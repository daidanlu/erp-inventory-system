from django.db import transaction
from rest_framework import serializers
from .models import Product, Order, OrderItem, Customer


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"


class ProductStockAdjustmentSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    # +: in, -: out
    delta = serializers.IntegerField()


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"


class OrderItemSerializer(serializers.ModelSerializer):
    product = ProductSerializer(read_only=True)
    product_id = serializers.PrimaryKeyRelatedField(
        source="product",
        queryset=Product.objects.all(),
        write_only=True,
    )

    class Meta:
        model = OrderItem
        fields = ["product", "product_id", "quantity"]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)
    customer = CustomerSerializer(read_only=True)
    customer_id = serializers.PrimaryKeyRelatedField(
        source="customer",
        queryset=Customer.objects.all(),
        write_only=True,
        required=False,
        allow_null=True,
    )

    class Meta:
        model = Order
        fields = [
            "id",
            "customer_name",
            "created_at",
            "status",
            "customer",
            "customer_id",
            "items",
        ]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        items_data = validated_data.pop("items", [])
        # atomic step, complete transaction rollback
        try:
            with transaction.atomic():
                order = Order.objects.create(**validated_data)
                for item_data in items_data:
                    # if insufficient, OrderItem.save() throws ValueError
                    OrderItem.objects.create(order=order, **item_data)
        except ValueError as e:
            # get ValueError transferred to DRF standard 400 Bad Request
            raise serializers.ValidationError({"detail": str(e)})

        return order
