from rest_framework import serializers
from .models import Product, Order, OrderItem, Customer


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"


class OrderItemSerializer(serializers.ModelSerializer):
    # read: return product info
    product = ProductSerializer(read_only=True)
    # write: product_id as primary key
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

    class Meta:
        model = Order
        fields = ["id", "customer_name", "created_at", "items"]
        read_only_fields = ["id", "created_at"]

    def create(self, validated_data):
        # get items part
        items_data = validated_data.pop("items", [])
        # create order itself
        order = Order.objects.create(**validated_data)
        # create each OrderItem, triggering OrderItem.save() to deduct inventory
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)
        return order


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = "__all__"
