from rest_framework import viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticatedOrReadOnly
from rest_framework.response import Response
from django.utils import timezone
from django.db.models import Sum
from .models import Product, Order, Customer
from .serializers import ProductSerializer, OrderSerializer, CustomerSerializer


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by("-created_at")
    serializer_class = OrderSerializer


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("name")
    serializer_class = CustomerSerializer


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
