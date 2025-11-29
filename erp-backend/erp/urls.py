from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from inventory.views import (
    ProductViewSet,
    OrderViewSet,
    CustomerViewSet,
    StockMovementViewSet,
    dashboard_summary,
)

router = routers.DefaultRouter()
router.register(r"products", ProductViewSet)
router.register(r"orders", OrderViewSet)
router.register(r"customers", CustomerViewSet)
router.register(r"stock-movements", StockMovementViewSet, basename="stock-movement")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api-auth/", include("rest_framework.urls")),
    path("api/dashboard/", dashboard_summary),
    path("api/", include(router.urls)),
]
