from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from inventory.views import ProductViewSet, OrderViewSet

router = routers.DefaultRouter()
router.register(r"products", ProductViewSet)
router.register(r"orders", OrderViewSet)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", include(router.urls)),
]
