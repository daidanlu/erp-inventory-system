from django.db import transaction
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from django.utils import timezone
from django.db.models import Sum
from datetime import timedelta


from .models import Product, Order, Customer, OrderItem
from .serializers import (
    ProductSerializer,
    CustomerSerializer,
    OrderSerializer,
    ProductStockAdjustmentSerializer,
)
from .permissions import IsStaffOrReadOnly


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsStaffOrReadOnly]

    # exact filter field: ?stock=100, ?sku=P001
    filterset_fields = {
        "sku": ["exact", "icontains"],
        "name": ["icontains"],
        "stock": ["exact", "gte", "lte"],
    }
    # fuzzy search：?search=P00 or ?search=Test
    search_fields = ["sku", "name"]
    # sort: ?ordering=stock or ?ordering=-stock
    ordering_fields = ["id", "sku", "name", "stock"]
    ordering = ["sku"]

    @action(detail=False, methods=["GET"])
    def low_stock(self, request):
        """
        Return products whose stock is below or equal to a given threshold.
        Default threshold = 5, can be overridden via ?threshold=10.
        """
        try:
            threshold = int(request.query_params.get("threshold", 5))
        except ValueError:
            threshold = 5

        qs = self.get_queryset().filter(stock__lte=threshold)

        # 20 items per page
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["POST"], permission_classes=[IsStaffOrReadOnly])
    def bulk_adjust_stock(self, request):
        """
        Adjust stock levels for multiple products in a single, transactional request.

        Expected payload:
        [
          { "product_id": 1, "delta": 10 },
          { "product_id": 2, "delta": -3 }
        ]
        """
        serializer = ProductStockAdjustmentSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data

        if not items:
            raise ValidationError("No stock adjustments provided.")

        product_ids = [item["product_id"] for item in items]

        # use select_for_update for lock to prevent concurrency issues
        products_qs = Product.objects.select_for_update().filter(id__in=product_ids)
        products_by_id = {p.id: p for p in products_qs}

        if len(products_by_id) != len(set(product_ids)):
            raise ValidationError("One or more products do not exist.")

        with transaction.atomic():
            # check validity of all changes(deltas)
            for item in items:
                product = products_by_id[item["product_id"]]
                new_stock = product.stock + item["delta"]
                if new_stock < 0:
                    raise ValidationError(
                        f"Stock for product {product.sku} would become negative "
                        f"({product.stock} + {item['delta']})."
                    )

            # apply changes
            for item in items:
                product = products_by_id[item["product_id"]]
                product.stock = product.stock + item["delta"]
                product.save()

        # return updated data
        updated_products = Product.objects.filter(id__in=product_ids).order_by("id")
        response_data = ProductSerializer(updated_products, many=True).data
        return Response(response_data, status=status.HTTP_200_OK)


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by("-created_at")
    serializer_class = OrderSerializer
    permission_classes = [IsStaffOrReadOnly]

    filterset_fields = {
        "customer": ["exact"],
        "customer_name": ["exact", "icontains"],
        "created_at": ["date__gte", "date__lte"],
        "status": ["exact"],
    }

    search_fields = ["customer_name", "customer__name"]
    ordering_fields = ["id", "created_at"]
    ordering = ["-created_at"]


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("name")
    serializer_class = CustomerSerializer
    permission_classes = [IsStaffOrReadOnly]

    filterset_fields = {
        "name": ["exact", "icontains"],
        "email": ["exact", "icontains"],
    }
    search_fields = ["name", "email", "phone"]
    ordering_fields = ["id", "name"]
    ordering = ["name"]

    @action(detail=True, methods=["GET"])
    def orders(self, request, pk=None):
        """
        Return paginated orders for this customer, ordered by newest first.
        """
        customer = self.get_object()
        qs = Order.objects.filter(customer=customer).order_by("-created_at")

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = OrderSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = OrderSerializer(qs, many=True)
        return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def dashboard_summary(request):
    """
    Simple dashboard summary for the ERP:
    counts for products/customers/orders and some basic inventory stats.
    Now also includes status-aware order metrics.
    """
    now = timezone.now()
    last_30_days = now - timedelta(days=30)

    products_count = Product.objects.count()
    customers_count = Customer.objects.count()
    orders_total_count = Order.objects.count()

    # only calculate orders confirmed
    orders_last_30_days = Order.objects.filter(
        created_at__gte=last_30_days,
        status=Order.STATUS_CONFIRMED,
    ).count()

    total_stock = (
        Product.objects.aggregate(total_stock=Sum("stock"))["total_stock"] or 0
    )
    low_stock_count = Product.objects.filter(stock__lte=5).count()

    orders_by_status = {
        Order.STATUS_DRAFT: Order.objects.filter(status=Order.STATUS_DRAFT).count(),
        Order.STATUS_CONFIRMED: Order.objects.filter(
            status=Order.STATUS_CONFIRMED
        ).count(),
        Order.STATUS_CANCELLED: Order.objects.filter(
            status=Order.STATUS_CANCELLED
        ).count(),
    }

    data = {
        "products_count": products_count,
        "customers_count": customers_count,
        "orders_total_count": orders_total_count,
        "orders_last_30_days": orders_last_30_days,
        "total_stock": total_stock,
        "low_stock_count": low_stock_count,
        "orders_by_status": orders_by_status,
    }
    return Response(data)
