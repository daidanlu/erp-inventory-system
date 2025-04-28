from django.db import models

# Create your models here.

class Product(models.Model):
    sku = models.CharField(max_length=64, unique=True)
    name = models.CharField(max_length=128)
    stock = models.IntegerField(default=0)

    def __str__(self):
        return f"{self.name} ({self.sku})"
