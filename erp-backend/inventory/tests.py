from django.test import TestCase
from .models import Product, Order, OrderItem


class OrderStockTests(TestCase):
    def test_creating_order_item_deducts_stock(self):
        # 库存为10的商品
        product = Product.objects.create(
            sku="P001",
            name="Test Product",
            stock=10,
        )
        order = Order.objects.create(customer_name="Test Customer")

        # 创建订单数量为3
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=3,
        )

        # 验证库存是否从10变成7
        product.refresh_from_db()
        self.assertEqual(product.stock, 7)

    def test_insufficient_stock_raises_error(self):
        # 库存只有2
        product = Product.objects.create(
            sku="P002",
            name="Low Stock Product",
            stock=2,
        )
        order = Order.objects.create(customer_name="Test Customer")

        # 下单数量5看是否导致ValueError
        with self.assertRaises(ValueError):
            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=5,
            )
