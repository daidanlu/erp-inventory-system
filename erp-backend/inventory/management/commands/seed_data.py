import random
from django.core.management.base import BaseCommand
from django.utils import timezone
from faker import Faker
from inventory.models import Product, Customer, Order, OrderItem, StockMovement


PRODUCT_PREFIXES = [
    "iPhone 15",
    "Samsung Galaxy S24",
    "MacBook Pro",
    "Sony WH-1000XM5",
    "Dell XPS 13",
    "iPad Air",
    "Logitech MX Master",
    "Kindle Paperwhite",
    "AirPods Pro",
    "Nintendo Switch",
    "PlayStation 5",
    "GoPro Hero 12",
]
PRODUCT_SUFFIXES = [
    "Pro",
    "Max",
    "Ultra",
    "Lite",
    "Mini",
    "Plus",
    "Black",
    "Silver",
    "256GB",
]


class Command(BaseCommand):
    help = "Seeds the database with realistic test data (Products, Customers, Orders)"

    def handle(self, *args, **options):
        fake = Faker()
        self.stdout.write("Starting data seeding...")

        # 1. Clear existing data
        OrderItem.objects.all().delete()
        Order.objects.all().delete()
        StockMovement.objects.all().delete()
        Product.objects.all().delete()
        Customer.objects.all().delete()
        self.stdout.write("Cleared old data.")

        # 2. Create Products
        products = []
        for i in range(50):
            name = (
                f"{random.choice(PRODUCT_PREFIXES)} {random.choice(PRODUCT_SUFFIXES)}"
            )
            sku = f"SKU-{fake.unique.hex_color().upper()[1:]}"  # e.g. SKU-1A2B3C
            stock = random.randint(0, 200)

            p = Product.objects.create(name=name, sku=sku, stock=stock)
            products.append(p)
        self.stdout.write(f"Created {len(products)} products.")

        # 3. Create Customers
        customers = []
        for _ in range(20):
            c = Customer.objects.create(
                name=fake.name(),
                email=fake.email(),
                phone=fake.phone_number(),
                address=fake.address().replace("\n", ", "),
            )
            customers.append(c)
        self.stdout.write(f"Created {len(customers)} customers.")

        # 4. Create Orders
        for _ in range(50):
            customer = random.choice(customers)
            # Random date in last 30 days
            created_at = timezone.now() - timezone.timedelta(days=random.randint(0, 30))

            order = Order.objects.create(
                customer=customer,
                customer_name=customer.name,
                status=random.choice(
                    ["draft", "confirmed", "confirmed", "confirmed", "cancelled"]
                ),
            )
            order.created_at = created_at
            order.save()

            # Add items to order
            num_items = random.randint(1, 5)
            selected_products = random.sample(products, num_items)

            for p in selected_products:
                qty = random.randint(1, 5)
                # Ensure don't crash on negative stock for seeding
                if p.stock >= qty:
                    OrderItem.objects.create(order=order, product=p, quantity=qty)
                    # Refresh product stock from DB as it changed
                    p.refresh_from_db()

        self.stdout.write(f"Created 50 random orders.")
        self.stdout.write("Seeding complete.")
