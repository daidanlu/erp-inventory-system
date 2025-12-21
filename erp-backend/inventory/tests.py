import csv
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from datetime import timedelta
from django.utils import timezone

from .models import Product, Order, OrderItem, Customer, StockMovement


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
        # With JWT authentication enabled, anonymous write attempts now, return 401 (unauthenticated) instead of 403.
        self.assertEqual(response.status_code, 401)

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


class ProductExportTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        self.staff = User.objects.create_user(
            username="exportstaff",
            password="exportpass",
            is_staff=True,
        )

        Product.objects.create(sku="EXP-1", name="Export 1", stock=10)
        Product.objects.create(sku="EXP-2", name="Export 2", stock=5)

        self.url = "/api/products/export/"

    def test_product_export_csv_as_staff(self):
        self.client.login(username="exportstaff", password="exportpass")

        response = self.client.get(self.url)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "text/csv")

        content = response.content.decode("utf-8")
        lines = [line for line in content.splitlines() if line.strip()]

        # header of the table
        self.assertIn("sku", lines[0])
        # at least 2 data rows
        self.assertGreaterEqual(len(lines), 3)


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


class OrderApiInsufficientStockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        # staff user for POST /api/orders/
        self.staff_user = User.objects.create_user(
            username="staff2",
            password="staffpass2",
            is_staff=True,
        )

        # product with stock=2
        self.product = Product.objects.create(
            sku="P-LOW",
            name="Low Stock Product",
            stock=2,
        )

        self.url = "/api/orders/"

    def test_create_order_with_insufficient_stock_returns_400_and_rolls_back(self):
        self.client.login(username="staff2", password="staffpass2")

        payload = {
            "customer_name": "Test Customer",
            "items": [{"product_id": self.product.id, "quantity": 5}],  # >stock
        }

        response = self.client.post(self.url, payload, format="json")

        # should return 400 instead of 500
        self.assertEqual(response.status_code, 400)

        # error message with json detail
        self.assertIn("detail", response.data)
        self.assertIn("Not enough stock", response.data["detail"])

        # should not create any orders to check rollback
        self.assertEqual(Order.objects.count(), 0)
        self.assertEqual(OrderItem.objects.count(), 0)

        # should not deduct stock
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 2)


class CustomerOrdersEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        # create 2 customers
        self.c1 = Customer.objects.create(
            name="customer_1",
            email="customer_1@daedalus.com",
            phone="123",
            address="Address 1",
        )
        self.c2 = Customer.objects.create(
            name="customer_2",
            email="customer_2@daedalus.com",
            phone="456",
            address="Address 2",
        )

        self.product = Product.objects.create(
            sku="P001",
            name="Test Product",
            stock=100,
        )

        # c1: 2 orders, c2: 1 order
        self.o1 = Order.objects.create(customer=self.c1, customer_name="customer_1")
        self.o2 = Order.objects.create(customer=self.c1, customer_name="customer_1")
        self.o3 = Order.objects.create(customer=self.c2, customer_name="customer_2")

        # add some order items
        OrderItem.objects.create(order=self.o1, product=self.product, quantity=1)
        OrderItem.objects.create(order=self.o2, product=self.product, quantity=2)
        OrderItem.objects.create(order=self.o3, product=self.product, quantity=3)

        self.url_c1 = f"/api/customers/{self.c1.id}/orders/"
        self.url_c2 = f"/api/customers/{self.c2.id}/orders/"

    def test_customer_orders_returns_only_this_customers_orders(self):
        response = self.client.get(self.url_c1)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        results = data.get("results", data)

        ids = sorted([item["id"] for item in results])
        self.assertEqual(ids, sorted([self.o1.id, self.o2.id]))

        response2 = self.client.get(self.url_c2)
        self.assertEqual(response2.status_code, 200)

        data2 = response2.json()
        results2 = data2.get("results", data2)

        ids2 = sorted([item["id"] for item in results2])
        self.assertEqual(ids2, [self.o3.id])


class OrderStatusTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.customer = Customer.objects.create(
            name="Status Customer",
            email="status@daedalus.com",
            phone="123",
            address="Address",
        )

    def test_order_default_status_is_confirmed(self):
        order = Order.objects.create(
            customer=self.customer,
            customer_name="Status Customer",
        )
        self.assertEqual(order.status, Order.STATUS_CONFIRMED)

    def test_filter_orders_by_status(self):
        o1 = Order.objects.create(
            customer=self.customer,
            customer_name="Status Customer",
            status=Order.STATUS_DRAFT,
        )
        o2 = Order.objects.create(
            customer=self.customer,
            customer_name="Status Customer",
            status=Order.STATUS_CANCELLED,
        )

        url = "/api/orders/?status=draft"
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

        data = response.json()
        results = data.get("results", data)

        ids = [item["id"] for item in results]
        self.assertIn(o1.id, ids)
        self.assertNotIn(o2.id, ids)


class OrderCancelEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        self.staff = User.objects.create_user(
            username="cancelstaff",
            password="cancelpass",
            is_staff=True,
        )

        self.product = Product.objects.create(
            sku="CANCEL-1",
            name="Cancel Product",
            stock=10,
        )

    def test_cancel_order_restocks_and_is_idempotent(self):
        self.client.login(username="cancelstaff", password="cancelpass")

        # create an order via API so it uses your serializer logic + creates initial StockMovement
        create_resp = self.client.post(
            "/api/orders/",
            {
                "customer_name": "Cancel Customer",
                "items": [{"product_id": self.product.id, "quantity": 3}],
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        order_id = create_resp.data["id"]

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)  # 10 - 3

        cancel_url = f"/api/orders/{order_id}/cancel/"

        # first cancel: restock + write another StockMovement
        cancel_resp = self.client.post(cancel_url, {}, format="json")
        self.assertEqual(cancel_resp.status_code, status.HTTP_200_OK)

        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, Order.STATUS_CANCELLED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)  # back to 10

        movements = StockMovement.objects.filter(
            order=order, product=self.product
        ).order_by("id")
        self.assertEqual(movements.count(), 2)
        self.assertEqual([m.delta for m in movements], [-3, 3])
        self.assertEqual(movements[1].previous_stock, 7)
        self.assertEqual(movements[1].new_stock, 10)

        # second cancel: idempotent (no additional restock/movement)
        cancel_resp2 = self.client.post(cancel_url, {}, format="json")
        self.assertEqual(cancel_resp2.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertEqual(
            StockMovement.objects.filter(order=order, product=self.product).count(),
            2,
        )


class OrderCancelEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        self.staff = User.objects.create_user(
            username="cancelstaff",
            password="cancelpass",
            is_staff=True,
        )

        self.product = Product.objects.create(
            sku="CANCEL-1",
            name="Cancel Product",
            stock=10,
        )

    def test_cancel_order_restocks_and_is_idempotent(self):
        self.client.login(username="cancelstaff", password="cancelpass")
        create_resp = self.client.post(
            "/api/orders/",
            {
                "customer_name": "Cancel Customer",
                "items": [{"product_id": self.product.id, "quantity": 3}],
            },
            format="json",
        )
        self.assertEqual(create_resp.status_code, status.HTTP_201_CREATED)
        order_id = create_resp.data["id"]

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 7)  # 10 - 3

        cancel_url = f"/api/orders/{order_id}/cancel/"

        # first cancel: restock + write another StockMovement
        cancel_resp = self.client.post(cancel_url, {}, format="json")
        self.assertEqual(cancel_resp.status_code, status.HTTP_200_OK)

        order = Order.objects.get(id=order_id)
        self.assertEqual(order.status, Order.STATUS_CANCELLED)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)  # back to 10

        movements = StockMovement.objects.filter(
            order=order, product=self.product
        ).order_by("id")
        self.assertEqual(movements.count(), 2)
        self.assertEqual([m.delta for m in movements], [-3, 3])
        self.assertEqual(movements[1].previous_stock, 7)
        self.assertEqual(movements[1].new_stock, 10)

        # second cancel: idempotent (no additional restock/movement)
        cancel_resp2 = self.client.post(cancel_url, {}, format="json")
        self.assertEqual(cancel_resp2.status_code, status.HTTP_200_OK)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 10)
        self.assertEqual(
            StockMovement.objects.filter(order=order, product=self.product).count(),
            2,
        )


class DashboardSummaryTests(TestCase):
    def setUp(self):
        self.client = APIClient()

        self.product = Product.objects.create(
            sku="DASH-P1",
            name="Dash Product",
            stock=10,
        )
        self.customer = Customer.objects.create(
            name="Dash Customer",
            email="dash@daedalus.com",
            phone="123",
            address="Dash Address",
        )

        now = timezone.now()
        thirty_one_days_ago = now - timedelta(days=31)
        ten_days_ago = now - timedelta(days=10)

        # order 1: confirmed, 10 days ago
        self.o1 = Order.objects.create(
            customer=self.customer,
            customer_name="Dash Customer",
            status=Order.STATUS_CONFIRMED,
            created_at=ten_days_ago,
        )

        # order 2: draft, 10 days ago
        self.o2 = Order.objects.create(
            customer=self.customer,
            customer_name="Dash Customer",
            status=Order.STATUS_DRAFT,
            created_at=ten_days_ago,
        )

        # order 3: cancelled, 31 days ago, outdated
        self.o3 = Order.objects.create(
            customer=self.customer,
            customer_name="Dash Customer",
            status=Order.STATUS_CANCELLED,
            created_at=thirty_one_days_ago,
        )

    def test_dashboard_counts_and_orders_by_status(self):
        response = self.client.get("/api/dashboard/")
        self.assertEqual(response.status_code, 200)

        data = response.json()

        self.assertEqual(data["products_count"], 1)
        self.assertEqual(data["customers_count"], 1)
        self.assertEqual(data["orders_total_count"], 3)

        # only contains o1
        self.assertEqual(data["orders_last_30_days"], 1)

        # order by status
        by_status = data["orders_by_status"]
        self.assertEqual(by_status[Order.STATUS_DRAFT], 1)
        self.assertEqual(by_status[Order.STATUS_CONFIRMED], 1)
        self.assertEqual(by_status[Order.STATUS_CANCELLED], 1)


class BulkAdjustStockTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()

        # staff user
        self.staff = User.objects.create_user(
            username="stockstaff",
            password="stockpass",
            is_staff=True,
        )

        # 2 products
        self.p1 = Product.objects.create(sku="BULK-1", name="Bulk 1", stock=10)
        self.p2 = Product.objects.create(sku="BULK-2", name="Bulk 2", stock=5)

        self.url = "/api/products/bulk_adjust_stock/"

    def test_bulk_adjust_stock_success(self):
        self.client.login(username="stockstaff", password="stockpass")

        payload = [
            {"product_id": self.p1.id, "delta": 5},  # 10 -> 15
            {"product_id": self.p2.id, "delta": -2},  #  5 -> 3
        ]

        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 200)

        self.p1.refresh_from_db()
        self.p2.refresh_from_db()
        self.assertEqual(self.p1.stock, 15)
        self.assertEqual(self.p2.stock, 3)

    def test_bulk_adjust_stock_rollback_on_negative(self):
        self.client.login(username="stockstaff", password="stockpass")

        payload = [
            {"product_id": self.p1.id, "delta": -100},
            {"product_id": self.p2.id, "delta": 10},
        ]

        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, 400)

        # stock should not be changed for overall operation
        self.p1.refresh_from_db()
        self.p2.refresh_from_db()
        self.assertEqual(self.p1.stock, 10)
        self.assertEqual(self.p2.stock, 5)


class StockMovementTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        User = get_user_model()
        self.staff = User.objects.create_user(
            username="movestaff",
            password="movepass",
            is_staff=True,
        )
        self.product = Product.objects.create(sku="MOV-1", name="Move 1", stock=10)
        self.customer = Customer.objects.create(
            name="Move Customer",
            email="move@daedalus.com",
            phone="123",
            address="Address",
        )

    def test_order_creation_creates_stock_movements(self):
        url = "/api/orders/"
        payload = {
            "customer_name": "Move Customer",
            "items": [
                {"product_id": self.product.id, "quantity": 2},
            ],
        }
        self.client.login(username="movestaff", password="movepass")
        response = self.client.post(url, payload, format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 8)  # 10 - 2

        movements = StockMovement.objects.filter(product=self.product)
        self.assertEqual(movements.count(), 1)
        m = movements.first()
        self.assertEqual(m.previous_stock, 10)
        self.assertEqual(m.delta, -2)
        self.assertEqual(m.new_stock, 8)
        self.assertEqual(m.reason, StockMovement.REASON_ORDER)

    def test_bulk_adjust_creates_stock_movements(self):
        User = get_user_model()
        staff = User.objects.create_user(
            username="bulkstaff",
            password="bulkpass",
            is_staff=True,
        )
        self.client.login(username="bulkstaff", password="bulkpass")

        url = "/api/products/bulk_adjust_stock/"
        payload = [
            {"product_id": self.product.id, "delta": 5},  # 10 -> 15
        ]
        response = self.client.post(url, payload, format="json")
        self.assertEqual(response.status_code, 200)

        self.product.refresh_from_db()
        self.assertEqual(self.product.stock, 15)

        movements = StockMovement.objects.filter(product=self.product)
        self.assertTrue(movements.exists())
