from django.db import models

# Create your models here.


class Customer(models.Model):
    name = models.CharField(max_length=255)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=50, blank=True)
    address = models.TextField(blank=True)

    def __str__(self):
        return self.name


class Product(models.Model):
    sku = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    stock = models.IntegerField(default=0)

    class Meta:
        ordering = ["sku"]

    def __str__(self):
        return f"{self.name} ({self.sku})"


class Order(models.Model):
    STATUS_DRAFT = "draft"
    STATUS_CONFIRMED = "confirmed"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (STATUS_DRAFT, "Draft"),
        (STATUS_CONFIRMED, "Confirmed"),
        (STATUS_CANCELLED, "Cancelled"),
    ]

    customer_name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    customer = models.ForeignKey(
        Customer,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="orders",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_CONFIRMED,
    )

    def __str__(self):
        return f"Order #{self.id} by {self.customer_name} at {self.created_at.strftime('%Y-%m-%d')}"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.CASCADE)
    quantity = models.PositiveIntegerField()

    def __str__(self):
        return f"{self.product.name} x {self.quantity}"

    def save(self, *args, **kwargs):
        if self._state.adding:  # only deduct stock on first creation
            if self.product.stock < self.quantity:
                raise ValueError(
                    f"Not enough stock for product {self.product.sku}: "
                    f"have {self.product.stock}, requested {self.quantity}"
                )
            self.product.stock -= self.quantity
            self.product.save()
        super().save(*args, **kwargs)


class StockMovement(models.Model):
    REASON_ORDER = "order"
    REASON_MANUAL = "manual_adjustment"

    REASON_CHOICES = [
        (REASON_ORDER, "Order"),
        (REASON_MANUAL, "Manual adjustment"),
    ]

    product = models.ForeignKey(
        Product, on_delete=models.CASCADE, related_name="stock_movements"
    )
    order = models.ForeignKey(
        Order,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stock_movements",
    )
    previous_stock = models.IntegerField()
    delta = models.IntegerField()
    new_stock = models.IntegerField()
    reason = models.CharField(max_length=32, choices=REASON_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.product.sku}: {self.previous_stock} -> {self.new_stock} ({self.reason})"


class ChatMessage(models.Model):
    ROLE_USER = "user"
    ROLE_BOT = "bot"
    ROLE_CHOICES = [
        (ROLE_USER, "User"),
        (ROLE_BOT, "Bot"),
    ]

    session_id = models.CharField(max_length=64, db_index=True)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at"]

    def __str__(self):
        return f"[{self.session_id}] {self.role}: {self.content[:40]}"
