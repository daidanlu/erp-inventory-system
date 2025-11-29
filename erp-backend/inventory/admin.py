from django.contrib import admin
from .models import Product, Order, OrderItem, Customer, StockMovement


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("sku", "name", "stock")
    search_fields = ("sku", "name")
    list_filter = ("stock",)


@admin.register(Customer)
class CustomerAdmin(admin.ModelAdmin):
    list_display = ("name", "email", "phone")
    search_fields = ("name", "email", "phone")


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ("id", "customer", "customer_name", "status", "created_at")
    search_fields = ("customer__name", "customer_name")
    list_filter = ("status", "created_at")


@admin.register(OrderItem)
class OrderItemAdmin(admin.ModelAdmin):
    list_display = ("order", "product", "quantity")
    search_fields = ("order__id", "product__sku", "product__name")


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "product",
        "order",
        "previous_stock",
        "delta",
        "new_stock",
        "reason",
        "created_at",
    )
    list_filter = ("reason", "created_at", "product")
    search_fields = ("product__sku", "product__name", "order__id")
