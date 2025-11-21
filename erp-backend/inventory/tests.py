from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from .models import Product, Order, OrderItem, Customer


class OrderStockTests(TestCase):
    def test_creating_order_item_deducts_stock(self):
        # create a product with stock=10
        product = Product.objects.create(
            sku="P001",
            name="Test Product",
            stock=10,
        )
        # order linked to customer
        order = Order.objects.create(customer_name="Test Customer")

        # create OrderItem with quantity 3
        OrderItem.objects.create(
            order=order,
            product=product,
            quantity=3,
        )

        # check if 10-3=7
        product.refresh_from_db()
        self.assertEqual(product.stock, 7)

    def test_insufficient_stock_raises_error(self):
        # create a product with stock=2
        product = Product.objects.create(
            sku="P002",
            name="Low Stock Product",
            stock=2,
        )
        # order linked to customer
        order = Order.objects.create(customer_name="Test Customer")

        # create OrderItem with quantity 5 to see if causing ValueError
        with self.assertRaises(ValueError):
            OrderItem.objects.create(
                order=order,
                product=product,
                quantity=5,
            )


class ProductApiPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        # create a staff user
        self.staff_user = User.objects.create_user(
            username="staff",
            password="staffpass",
            is_staff=True,
        )

        # create a nonstaff user
        self.normal_user = User.objects.create_user(
            username="normal",
            password="normalpass",
            is_staff=False,
        )

        # create a product for GET test
        self.product = Product.objects.create(
            sku="P001",
            name="Test Product",
            stock=10,
        )

        self.list_url = "/api/products/"

    def test_anonymous_can_list_but_cannot_create_product(self):
        # check if staying logged out can GET
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)

        # check if staying logged out cannot POST
        response = self.client.post(
            self.list_url,
            {"sku": "P002", "name": "Anon Product", "stock": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_non_staff_authenticated_user_is_read_only(self):
        # login as nonstaff user
        self.client.login(username="normal", password="normalpass")

        # can GET
        response = self.client.get(self.list_url)
        self.assertEqual(response.status_code, 200)

        # cannot POST
        response = self.client.post(
            self.list_url,
            {"sku": "P003", "name": "Normal User Product", "stock": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 403)

    def test_staff_user_can_create_product(self):
        # login as staff user
        self.client.login(username="staff", password="staffpass")
        # can POST
        response = self.client.post(
            self.list_url,
            {"sku": "P004", "name": "Staff Product", "stock": 5},
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        self.assertTrue(Product.objects.filter(sku="P004").exists())


class LowStockEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # create products with different stocks
        self.p1 = Product.objects.create(sku="A", name="A", stock=2)
        self.p2 = Product.objects.create(sku="B", name="B", stock=5)
        self.p3 = Product.objects.create(sku="C", name="C", stock=10)
        self.p4 = Product.objects.create(sku="D", name="D", stock=50)

        self.url = "/api/products/low_stock/"

    def test_default_threshold_is_5(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)

        # paging format: {"count":.., "results":[...]}
        data = response.json()
        results = data.get("results", data)

        skus = sorted([item["sku"] for item in results])
        # default threshold=5, check if containing A with stock 2 and B with stock 5
        self.assertEqual(skus, ["A", "B"])

    def test_custom_threshold(self):
        response = self.client.get(self.url + "?threshold=10")
        self.assertEqual(response.status_code, 200)

        data = response.json()
        results = data.get("results", data)

        skus = sorted([item["sku"] for item in results])
        # check threshold=10, check if containing A, B, C with stock<=10
        self.assertEqual(skus, ["A", "B", "C"])
