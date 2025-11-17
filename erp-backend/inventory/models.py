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

    def __str__(self):
        return f"{self.name} ({self.sku})"


class Order(models.Model):
    customer_name = models.CharField(max_length=100)
    created_at = models.DateTimeField(auto_now_add=True)

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
                raise ValueError("Insufficient stock for product.")
            self.product.stock -= self.quantity
            self.product.save()
        super().save(*args, **kwargs)
