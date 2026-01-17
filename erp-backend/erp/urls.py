from django.contrib import admin
from django.urls import path, include
from rest_framework import routers
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
)

from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)

from inventory.views import (
    ProductViewSet,
    OrderViewSet,
    CustomerViewSet,
    StockMovementViewSet,
    dashboard_summary,
    chat_with_bot,
    llm_health,
)

router = routers.DefaultRouter()
router.register(r"products", ProductViewSet)
router.register(r"orders", OrderViewSet)
router.register(r"customers", CustomerViewSet)
router.register(r"stock-movements", StockMovementViewSet, basename="stock-movement")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api-auth/", include("rest_framework.urls")),
    
    path("api/token/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

    path("api/dashboard/", dashboard_summary),
    path("api/", include(router.urls)),
    path("api/chat/health/", llm_health, name="llm-health"),
    path("api/chat/", chat_with_bot, name="chat-with-bot"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]