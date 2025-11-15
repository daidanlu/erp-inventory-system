from rest_framework import serializers
from .models import Product, Order, OrderItem


class ProductSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = "__all__"


class OrderItemSerializer(serializers.ModelSerializer):
    # 读：返回完整商品信息
    product = ProductSerializer(read_only=True)
    # 写：用 product_id 传主键
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
        # 从数据中取出 items 部分
        items_data = validated_data.pop("items", [])
        # 创建订单本身
        order = Order.objects.create(**validated_data)
        # 再创建每一条 OrderItem（触发 OrderItem.save() 里的扣库存逻辑）
        for item_data in items_data:
            OrderItem.objects.create(order=order, **item_data)
        return order
