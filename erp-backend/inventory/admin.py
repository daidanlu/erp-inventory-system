from django.contrib import admin
from .models import Product, Order, OrderItem, Customer, StockMovement, ChatMessage


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


@admin.register(ChatMessage)
class ChatMessageAdmin(admin.ModelAdmin):
    list_display = ("session_id", "role", "short_content", "created_at")
    list_filter = ("role", "created_at")
    search_fields = ("session_id", "content")

    def short_content(self, obj):
        return (obj.content[:40] + "…") if len(obj.content) > 40 else obj.content

    short_content.short_description = "content"
