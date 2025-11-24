from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from rest_framework.decorators import action
from django.utils import timezone
from django.db.models import Sum

from .models import Product, Order, Customer, OrderItem
from .serializers import (
    ProductSerializer,
    CustomerSerializer,
    OrderSerializer,
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


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by("-created_at")
    serializer_class = OrderSerializer
    permission_classes = [IsStaffOrReadOnly]

    filterset_fields = ["customer", "customer_name", "created_at"]

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
    """
    now = timezone.now()
    last_30_days = now - timezone.timedelta(days=30)

    products_count = Product.objects.count()
    customers_count = Customer.objects.count()
    orders_total_count = Order.objects.count()
    orders_last_30_days = Order.objects.filter(created_at__gte=last_30_days).count()

    total_stock = (
        Product.objects.aggregate(total_stock=Sum("stock"))["total_stock"] or 0
    )
    low_stock_count = Product.objects.filter(stock__lte=5).count()

    data = {
        "products_count": products_count,
        "customers_count": customers_count,
        "orders_total_count": orders_total_count,
        "orders_last_30_days": orders_last_30_days,
        "total_stock": total_stock,
        "low_stock_count": low_stock_count,
    }
    return Response(data)
