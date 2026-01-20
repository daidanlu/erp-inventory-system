from __future__ import annotations

import csv
import time as pytime
import uuid
import os
import threading
import json
import socket
import urllib.request
import urllib.error
from urllib.parse import urlparse, urlunparse
import re


from pathlib import Path
from django.shortcuts import get_object_or_404
from datetime import timedelta, datetime, time

from django.http import HttpResponse
from django.db import transaction
from django.utils import timezone
from django.db.models import Sum, Max, OuterRef, Subquery

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import viewsets, status, filters
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticatedOrReadOnly, AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError

from .models import Product, Order, Customer, OrderItem, StockMovement, ChatMessage
from .serializers import (
    ProductSerializer,
    CustomerSerializer,
    OrderSerializer,
    OrderItemSerializer,
    ProductStockAdjustmentSerializer,
    StockMovementSerializer,
    ChatMessageSerializer,
    ChatRequestSerializer,
)
from .permissions import IsStaffOrReadOnly


class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    permission_classes = [IsStaffOrReadOnly]

    # exact filter field: ?stock=100, ?sku=P001
    filterset_fields = {
        "sku": ["exact", "icontains"],
        "name": ["icontains"],
        "stock": ["exact", "gte", "lte"],
    }
    # fuzzy search：?search=P00 or ?search=Test
    search_fields = ["sku", "name"]
    # sort: ?ordering=stock or ?ordering=-stock
    ordering_fields = ["id", "sku", "name", "stock"]
    ordering = ["sku"]

    @action(detail=False, methods=["GET"])
    def low_stock(self, request):
        """
        Return products whose stock is below or equal to a given threshold.
        Default threshold = 5, can be overridden via ?threshold=10.
        """
        try:
            threshold = int(request.query_params.get("threshold", 5))
        except ValueError:
            threshold = 5

        qs = self.get_queryset().filter(stock__lte=threshold)

        # 20 items per page
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=["POST"], permission_classes=[IsStaffOrReadOnly])
    def bulk_adjust_stock(self, request):
        """
        Adjust stock levels for multiple products in a single, transactional request.

        Expected payload:
        [
          { "product_id": 1, "delta": 10 },
          { "product_id": 2, "delta": -3 }
        ]
        """
        serializer = ProductStockAdjustmentSerializer(data=request.data, many=True)
        serializer.is_valid(raise_exception=True)
        items = serializer.validated_data

        if not items:
            raise ValidationError("No stock adjustments provided.")

        product_ids = [item["product_id"] for item in items]

        # use select_for_update for lock to prevent concurrency issues
        products_qs = Product.objects.select_for_update().filter(id__in=product_ids)
        products_by_id = {p.id: p for p in products_qs}

        if len(products_by_id) != len(set(product_ids)):
            missing_ids = sorted(set(product_ids) - set(products_by_id.keys()))
            raise ValidationError(
                {
                    "message": "Products not found.",
                    "missing_product_ids": missing_ids,
                }
            )

        with transaction.atomic():
            # check validity of all changes(deltas)
            for item in items:
                product = products_by_id[item["product_id"]]
                new_stock = product.stock + item["delta"]
                if new_stock < 0:
                    raise ValidationError(
                        {
                            "message": "Stock would become negative.",
                            "product_id": product.id,
                            "sku": product.sku,
                            "current_stock": product.stock,
                            "delta": item["delta"],
                            "computed_stock": new_stock,
                        }
                    )

            # apply changes
            for item in items:
                product = products_by_id[item["product_id"]]
                previous_stock = product.stock
                delta = item["delta"]
                new_stock = previous_stock + delta

                product.stock = new_stock
                product.save()

                StockMovement.objects.create(
                    product=product,
                    order=None,
                    previous_stock=previous_stock,
                    delta=delta,
                    new_stock=new_stock,
                    reason=StockMovement.REASON_MANUAL,
                )

        # return updated data
        updated_products = Product.objects.filter(id__in=product_ids).order_by("id")
        response_data = ProductSerializer(updated_products, many=True).data
        return Response(response_data, status=status.HTTP_200_OK)

    @action(detail=False, methods=["GET"], permission_classes=[IsStaffOrReadOnly])
    def export(self, request):
        """
        Export all products as CSV (staff only).
        """
        # create HttpResponse
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="products.csv"'

        writer = csv.writer(response)
        # header of the csv
        writer.writerow(["id", "sku", "name", "stock"])

        for p in Product.objects.all().order_by("id"):
            writer.writerow([p.id, p.sku, p.name, p.stock])

        return response


class OrderViewSet(viewsets.ModelViewSet):
    queryset = Order.objects.all().order_by("-created_at")
    serializer_class = OrderSerializer
    permission_classes = [AllowAny]

    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]

    filterset_fields = {
        "customer": ["exact"],
        "customer_name": ["exact", "icontains"],
        "created_at": ["date__gte", "date__lte"],
        "status": ["exact"],
    }

    search_fields = ["customer_name", "customer__name"]
    ordering_fields = ["id", "created_at"]
    ordering = ["-created_at"]

    @action(detail=False, methods=["GET"], permission_classes=[IsStaffOrReadOnly])
    def export(self, request):
        """
        Export orders as CSV (staff only).
        Only includes high-level fields for now.
        """
        response = HttpResponse(content_type="text/csv")
        response["Content-Disposition"] = 'attachment; filename="orders.csv"'

        writer = csv.writer(response)
        writer.writerow(["id", "customer_name", "customer_id", "status", "created_at"])

        qs = self.filter_queryset(self.get_queryset()).order_by("id")
        for o in qs:
            writer.writerow(
                [
                    o.id,
                    o.customer_name,
                    o.customer.id if o.customer else "",
                    o.status,
                    o.created_at.isoformat(),
                ]
            )

        return response

    @action(detail=True, methods=["POST"], permission_classes=[IsStaffOrReadOnly])
    def cancel(self, request, pk=None):
        """
        Cancel an order and restock its items.

        Idempotent: cancelling an already-cancelled order will NOT restock again.
        """
        with transaction.atomic():
            # Lock the order row first to make cancellation concurrency-safe.
            # If two cancel requests race, only the first one will perform restock.
            order = get_object_or_404(Order.objects.select_for_update(), pk=pk)

            # idempotent: already cancelled -> no-op
            if order.status == Order.STATUS_CANCELLED:
                return Response(
                    self.get_serializer(order).data, status=status.HTTP_200_OK
                )

            # no prefetch cache surprises, and build a distinct product id list for locking
            item_qs = order.items.select_related("product").all()
            product_ids = list(item_qs.values_list("product_id", flat=True).distinct())

            # lock products to avoid concurrent updates
            products_qs = Product.objects.select_for_update().filter(id__in=product_ids)
            products_by_id = {p.id: p for p in products_qs}

            for item in item_qs:
                product = products_by_id.get(item.product_id)
                if product is None:
                    # shouldn't happen unless DB is inconsistent, but fail safely.
                    raise ValidationError("Order item references a missing product.")
                previous_stock = product.stock
                delta = item.quantity  # restock
                new_stock = previous_stock + delta

                product.stock = new_stock
                product.save(update_fields=["stock"])

                StockMovement.objects.create(
                    product=product,
                    order=order,
                    previous_stock=previous_stock,
                    delta=delta,
                    new_stock=new_stock,
                    reason=StockMovement.REASON_ORDER,
                )

            order.status = Order.STATUS_CANCELLED
            order.save(update_fields=["status"])

        return Response(self.get_serializer(order).data, status=status.HTTP_200_OK)


class StockMovementViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = StockMovement.objects.select_related("product", "order")
    serializer_class = StockMovementSerializer
    permission_classes = [IsStaffOrReadOnly]

    filterset_fields = {
        "product": ["exact"],
        "order": ["exact"],
        "reason": ["exact"],
        "created_at": ["date__gte", "date__lte"],
    }
    search_fields = ["product__sku", "product__name"]
    ordering_fields = ["created_at", "id"]
    ordering = ["-created_at"]


class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all().order_by("name")
    serializer_class = CustomerSerializer
    permission_classes = [IsStaffOrReadOnly]

    filterset_fields = {
        "name": ["exact", "icontains"],
        "email": ["exact", "icontains"],
    }
    search_fields = ["name", "email", "phone"]
    ordering_fields = ["id", "name"]
    ordering = ["name"]

    @action(detail=True, methods=["GET"])
    def orders(self, request, pk=None):
        """
        Return paginated orders for this customer, ordered by newest first.
        """
        customer = self.get_object()
        qs = Order.objects.filter(customer=customer).order_by("-created_at")

        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = OrderSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = OrderSerializer(qs, many=True)
        return Response(serializer.data)


@api_view(["GET"])
@permission_classes([IsAuthenticatedOrReadOnly])
def dashboard_summary(request):
    """
    Simple dashboard summary for the ERP:
    counts for products/customers/orders and some basic inventory stats.
    Now also includes status-aware order metrics.
    """
    now = timezone.now()
    last_30_days = now - timedelta(days=30)

    products_count = Product.objects.count()
    customers_count = Customer.objects.count()
    orders_total_count = Order.objects.count()

    # only calculate orders confirmed
    orders_last_30_days = Order.objects.filter(
        created_at__gte=last_30_days,
        status=Order.STATUS_CONFIRMED,
    ).count()

    total_stock = (
        Product.objects.aggregate(total_stock=Sum("stock"))["total_stock"] or 0
    )
    low_stock_count = Product.objects.filter(stock__lte=5).count()

    orders_by_status = {
        Order.STATUS_DRAFT: Order.objects.filter(status=Order.STATUS_DRAFT).count(),
        Order.STATUS_CONFIRMED: Order.objects.filter(
            status=Order.STATUS_CONFIRMED
        ).count(),
        Order.STATUS_CANCELLED: Order.objects.filter(
            status=Order.STATUS_CANCELLED
        ).count(),
    }

    data = {
        "products_count": products_count,
        "customers_count": customers_count,
        "orders_total_count": orders_total_count,
        "orders_last_30_days": orders_last_30_days,
        "total_stock": total_stock,
        "low_stock_count": low_stock_count,
        "orders_by_status": orders_by_status,
    }
    return Response(data)


def _to_openai_role(role: str) -> str:
    if role == ChatMessage.ROLE_USER:
        return "user"
    # stored as "bot" in DB
    return "assistant"


def _call_openai_compatible_chat(
    *, base_url: str, model: str, messages: list[dict], timeout_s: int
) -> str:
    """Call an OpenAI-compatible /v1/chat/completions endpoint (e.g., llama.cpp server)."""
    base_url = base_url.rstrip("/")
    url = f"{base_url}/chat/completions"

    payload = {
        "model": model,
        "messages": messages,
        "temperature": float(os.environ.get("LLM_TEMPERATURE", "0.2")),
        "max_tokens": int(os.environ.get("LLM_MAX_TOKENS", "256")),
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_s) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        # propagate a readable error upwards
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = ""
        raise RuntimeError(f"LLM HTTP {e.code}: {body or e.reason}") from e
    except (urllib.error.URLError, socket.timeout) as e:
        hint = (
            "If you're on Windows, avoid IPv6 localhost issues: "
            "set LLM_BASE_URL to 'http://127.0.0.1:8002/v1' (or without /v1; backend will normalize)."
        )
        raise RuntimeError(
            f"LLM connection error: {e}. base_url={base_url}. {hint}"
        ) from e

    try:
        obj = json.loads(raw)
    except json.JSONDecodeError as e:
        raise RuntimeError("LLM returned non-JSON response") from e

    # OpenAI-compatible: choices[0].message.content
    try:
        choice0 = (obj.get("choices") or [])[0]
        msg = choice0.get("message") or {}
        content = msg.get("content")
        if content:
            return str(content).strip()
        # some servers return text directly
        text = choice0.get("text")
        if text:
            return str(text).strip()
    except Exception:
        pass

    raise RuntimeError("LLM returned an empty response")


def _normalize_openai_base_url(raw: str) -> str:
    """
    Accept common user inputs and normalize to an OpenAI-compatible base URL ending with /v1.
    Examples accepted:
      - http://localhost:8002
      - http://localhost:8002/v1
      - http://127.0.0.1:8002
      - 127.0.0.1:8002
    Output:
      - http://127.0.0.1:8002/v1   (or https://... accordingly)
    """
    raw = (raw or "").strip()
    if not raw:
        return ""
    if not raw.startswith(("http://", "https://")):
        raw = "http://" + raw

    p = urlparse(raw)
    netloc = p.netloc.replace("localhost", "127.0.0.1")
    path = (p.path or "").rstrip("/")
    if not path.endswith("/v1"):
        path = (path + "/v1") if path else "/v1"

    return urlunparse((p.scheme, netloc, path, "", "", ""))


# ---- llama-cpp-python in-process provider (GGUF) ----
_LLAMA_CPP_INSTANCE = None
_LLAMA_CPP_LOCK = threading.Lock()


def _get_llama_cpp_instance():
    """
    Lazily initialize a llama-cpp-python Llama() instance.
    Required env:
      - LLM_GGUF_PATH: absolute/relative path to .gguf
    Optional env:
      - LLM_N_CTX (default 2048)
      - LLM_THREADS (default 8)
      - LLM_GPU_LAYERS (default 0)
      - LLM_CHAT_FORMAT (optional; otherwise auto from GGUF metadata)
    """
    global _LLAMA_CPP_INSTANCE
    if _LLAMA_CPP_INSTANCE is not None:
        return _LLAMA_CPP_INSTANCE

    model_path = (os.environ.get("LLM_GGUF_PATH") or "").strip()
    if not model_path:
        raise RuntimeError(
            "LLM_PROVIDER=llama_cpp requires LLM_GGUF_PATH pointing to a .gguf file"
        )
    if not os.path.exists(model_path):
        raise RuntimeError(f"LLM_GGUF_PATH not found: {model_path}")

    try:
        from llama_cpp import Llama
    except Exception as e:
        raise RuntimeError(
            "llama-cpp-python is not installed. Install it (e.g., pip install llama-cpp-python) "
            "or switch to LLM_PROVIDER=openai_compat with a running llama-server."
        ) from e

    n_ctx = int(os.environ.get("LLM_N_CTX", "2048"))
    n_threads = int(os.environ.get("LLM_THREADS", "8"))
    n_gpu_layers = int(os.environ.get("LLM_GPU_LAYERS", "0"))
    chat_format = (os.environ.get("LLM_CHAT_FORMAT") or "").strip() or None

    _LLAMA_CPP_INSTANCE = Llama(
        model_path=model_path,
        n_ctx=n_ctx,
        n_threads=n_threads,
        n_gpu_layers=n_gpu_layers,
        chat_format=chat_format,
        verbose=False,
    )
    return _LLAMA_CPP_INSTANCE


def _call_llama_cpp_local_chat(*, messages: list[dict]) -> str:
    llm = _get_llama_cpp_instance()
    temperature = float(os.environ.get("LLM_TEMPERATURE", "0.2"))
    max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "256"))

    with _LLAMA_CPP_LOCK:
        out = llm.create_chat_completion(
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
        )

    try:
        choice0 = (out.get("choices") or [])[0]
        msg = choice0.get("message") or {}
        content = msg.get("content")
        if content:
            return str(content).strip()
        text = choice0.get("text")
        if text:
            return str(text).strip()
    except Exception:
        pass
    raise RuntimeError("LLM (llama_cpp) returned an empty response")


def _get_llm_provider() -> str:
    # Default to mock so the chat endpoint never silently falls back to placeholder when LLM_PROVIDER is unset in local dev.
    p = (os.environ.get("LLM_PROVIDER") or "mock").strip().lower()
    # tolerate common aliases
    if p in ("openai-compatible", "openai_compatible", "openai"):
        return "openai_compat"
    if p in ("llama_cpp", "llama-cpp", "llamacpp", "llama.cpp", "local_gguf"):
        return "llama_cpp"
    return p


def _tool_low_stock(args: dict) -> dict:
    """
    Return low stock products.
    args:
      - threshold (int, default 5)
      - limit (int, default 20)
    """
    try:
        threshold = int(args.get("threshold", 5))
    except Exception:
        threshold = 5
    try:
        limit = int(args.get("limit", 20))
    except Exception:
        limit = 20
    limit = max(1, min(limit, 200))

    qs_all = Product.objects.filter(stock__lte=threshold)
    total = qs_all.count()
    qs = qs_all.order_by("stock", "sku")[:limit]

    items = [
        {
            "id": p.id,
            "sku": p.sku,
            "name": p.name,
            "stock": p.stock,
        }
        for p in qs
    ]
    return {
        "tool": "low_stock",
        "threshold": threshold,
        "total": total,
        "returned": len(items),
        "items": items,
    }


def _tool_orders_today(args: dict) -> dict:
    """
    Return today's order counts + breakdown by status.
    args: (reserved for future; currently ignored)
    """
    tz = timezone.get_current_timezone()
    today = timezone.localdate()
    start = timezone.make_aware(datetime.combine(today, time.min), timezone=tz)
    end = start + timedelta(days=1)

    qs = Order.objects.filter(created_at__gte=start, created_at__lt=end)
    total = qs.count()

    statuses = [
        Order.STATUS_DRAFT,
        Order.STATUS_CONFIRMED,
        Order.STATUS_CANCELLED,
    ]
    by_status = {s: qs.filter(status=s).count() for s in statuses}

    return {
        "tool": "orders_today",
        "date": str(today),
        "total": total,
        "by_status": by_status,
    }


TOOLS_REGISTRY = {
    "low_stock": _tool_low_stock,
    "orders_today": _tool_orders_today,
}


def _run_tool(tool_name: str, args: dict) -> dict:
    fn = TOOLS_REGISTRY.get(tool_name)
    if not fn:
        raise RuntimeError(f"Unknown tool: {tool_name}")
    if args is None:
        args = {}
    if not isinstance(args, dict):
        raise RuntimeError("args must be an object/dict")
    return fn(args)


def generate_llm_reply(
    *,
    session_id: str,
    user_message: str,
    tool_name: str | None = None,
    tool_result: dict | None = None,
) -> str:
    """
    Generate a reply via a pluggable provider:
      - LLM_PROVIDER=mock: deterministic reply (optionally includes tool result)
      - LLM_PROVIDER=openai_compat: call OpenAI-compatible /v1/chat/completions (e.g., llama.cpp server)
      - otherwise: placeholder fallback
    """
    provider = _get_llm_provider()

    if provider == "mock":
        echo = user_message.replace("\n", " ").strip()
        if len(echo) > 120:
            echo = echo[:120] + "…"

        if tool_result is not None and isinstance(tool_result, dict):
            t = tool_result.get("tool") or tool_name or "unknown"
            if t == "orders_today":
                total = int(tool_result.get("total") or 0)
                date = tool_result.get("date") or ""
                by = tool_result.get("by_status") or {}
                # keep a compact breakdown string
                if isinstance(by, dict) and by:
                    parts = [f"{k}={by.get(k)}" for k in sorted(by.keys())]
                    breakdown = ", ".join(parts)
                    return (
                        f"[MOCK_LLM] Orders today {date}: total {total} ({breakdown})."
                    )
                return f"[MOCK_LLM] Orders today {date}: total {total}."

            if t == "low_stock":
                threshold = int(tool_result.get("threshold") or 0)
                total = int(tool_result.get("total") or 0)
                returned = int(tool_result.get("returned") or 0)
                if total == 0:
                    return f"[MOCK_LLM] No products are at or below stock {threshold}."
                return f"[MOCK_LLM] Found {total} low-stock products (≤ {threshold}); showing {returned}."

            # Unknown tool: still keep it readable
            return f'[MOCK_LLM] tool={t} session={session_id} | echo="{echo}"'

        return f'[MOCK_LLM] tool=none session={session_id} | echo="{echo}"'

    if provider not in ("openai_compat", "llama_cpp"):
        return simple_bot_reply(user_message)

    if provider == "openai_compat":
        base_url = os.environ.get("LLM_BASE_URL")
        if not base_url:
            raise RuntimeError(
                "LLM_PROVIDER=openai_compat requires LLM_BASE_URL (e.g., http://127.0.0.1:8080/v1)"
            )
        if provider == "openai_compat":
            base_url = _normalize_openai_base_url(str(base_url))
    else:
        base_url = None

    model = os.environ.get("LLM_MODEL", "llama-3.2-1b")
    timeout_s = int(os.environ.get("LLM_TIMEOUT_SECONDS", "30"))

    system_prompt = os.environ.get(
        "LLM_SYSTEM_PROMPT",
        (
            "You are an ERP assistant embedded in a warehouse/order management system. "
            "You are READ-ONLY: do not claim that you changed inventory, orders, or customers. "
            "If the user asks you to modify data or perform actions, refuse and instruct them to use the ERP UI."
        ),
    )

    # Use last few turns for context
    recent = ChatMessage.objects.filter(session_id=session_id).order_by("-created_at")[
        :10
    ]
    recent = list(recent)[::-1]

    msgs = [{"role": "system", "content": system_prompt}]
    if tool_result is not None:
        tool_json = json.dumps(tool_result, ensure_ascii=False)
        msgs.append(
            {
                "role": "system",
                "content": f"Tool result available (JSON). tool={tool_name or 'unknown'}: {tool_json}",
            }
        )
    for m in recent:
        msgs.append({"role": _to_openai_role(m.role), "content": m.content})

    if provider == "llama_cpp":
        return _call_llama_cpp_local_chat(messages=msgs)

    return _call_openai_compatible_chat(
        base_url=str(base_url),
        model=model,
        messages=msgs,
        timeout_s=timeout_s,
    )


def simple_bot_reply(message: str) -> str:
    """
    Placeholder bot logic.

    Later this can call an external Rasa/Botpress endpoint.
    """
    text = message.lower()
    if "stock" in text or "库存" in text:
        return (
            "I can help you inspect inventory. "
            "Try /api/products/ or /api/products/low_stock/."
        )
    if "order" in text or "订单" in text:
        return (
            "For order details you can use the /api/orders/ endpoint with filters "
            "such as status or customer."
        )
    return (
        "This is a placeholder ERP chatbot endpoint. The backend is wired and can be "
        "connected to Rasa/Botpress later."
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def chat_with_bot(request):
    """
    Minimal chat endpoint for the ERP.

    Request body:
      - session_id (optional, string)
      - message (required, string)

    Response:
      - session_id: the conversation id (reused if provided)
      - reply: bot reply text
      - history: recent messages in this session
    """
    serializer = ChatRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    session_id = serializer.validated_data.get("session_id") or uuid.uuid4().hex
    message = serializer.validated_data["message"].strip()
    tool = request.data.get("tool")
    args = request.data.get("args") or {}

    if not message:
        return Response(
            {"detail": "Empty message."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # If mock mode and no explicit tool provided, do a tiny keyword-based routing to simulate "LLM chooses a tool" without needing a model server.
    provider = _get_llm_provider()
    if provider == "mock" and not tool:
        q = message.lower()

        if re.search(r"low[- ]?stock|stock.*low|库存", q):
            tool = "low_stock"
            if not isinstance(args, dict):
                args = {}

            m = re.search(r"(?:threshold|th|below|at|limit)\s*[:=]?\s*(\d{1,4})", q)
            if m:
                args["threshold"] = int(m.group(1))
            else:
                m2 = re.search(r"\b(\d{1,4})\b", q)
                if m2:
                    args["threshold"] = int(m2.group(1))

            m_limit = re.search(r"(?:max|limit|top)\s*[:=]?\s*(\d{1,4})", q)
            if m_limit:
                args["limit"] = int(m_limit.group(1))

        elif re.search(r"order.*today|today.*order|今日订单|今天订单", q):
            tool = "orders_today"

    tool_result = None
    tool_name = None
    if tool:
        try:
            tool_name = str(tool).strip()
            tool_result = _run_tool(tool_name, args)
        except RuntimeError as e:
            return Response(
                {"detail": str(e)},
                status=status.HTTP_400_BAD_REQUEST,
            )

    # save user message
    ChatMessage.objects.create(
        session_id=session_id,
        role=ChatMessage.ROLE_USER,
        content=message,
    )

    # generate bot reply (LLM if configured; otherwise placeholder fallback)
    try:
        reply_text = generate_llm_reply(
            session_id=session_id,
            user_message=message,
            tool_name=tool_name,
            tool_result=tool_result,
        )
    except RuntimeError as e:
        return Response(
            {"detail": str(e)},
            status=status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    ChatMessage.objects.create(
        session_id=session_id,
        role=ChatMessage.ROLE_BOT,
        content=reply_text,
    )

    # return recent history for this session
    recent_messages = ChatMessage.objects.filter(session_id=session_id).order_by(
        "-created_at"
    )[:10]
    recent_messages = list(recent_messages)[::-1]

    history = ChatMessageSerializer(recent_messages, many=True).data

    return Response(
        {
            "session_id": session_id,
            "reply": reply_text,
            "tool_result": tool_result,
            "history": history,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def chat_sessions(request):
    """
    List chat sessions ordered by most recent activity.

    Response item:
      - session_id
      - last_role
      - last_message
      - last_time
    """
    # Subquery to fetch latest message fields per session_id (works on SQLite test DB too)
    latest_qs = (
        ChatMessage.objects.filter(session_id=OuterRef("session_id"))
        .order_by("-created_at")
        .values("content")[:1]
    )
    latest_role_qs = (
        ChatMessage.objects.filter(session_id=OuterRef("session_id"))
        .order_by("-created_at")
        .values("role")[:1]
    )

    qs = (
        ChatMessage.objects.values("session_id")
        .annotate(
            last_time=Max("created_at"),
            last_message=Subquery(latest_qs),
            last_role=Subquery(latest_role_qs),
        )
        .order_by("-last_time")
    )

    try:
        limit = int(request.query_params.get("limit", 20))
    except ValueError:
        limit = 20
    limit = max(1, min(limit, 200))

    return Response(list(qs[:limit]), status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([AllowAny])
def chat_history(request):
    """
    Fetch chat history for a given session_id.
    Query params:
      - session_id (required)
      - limit (optional, default 50, max 200)
    """
    session_id = (request.query_params.get("session_id") or "").strip()
    if not session_id:
        return Response(
            {"detail": "session_id is required"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        limit = int(request.query_params.get("limit", 50))
    except ValueError:
        limit = 50
    limit = max(1, min(limit, 200))

    qs = ChatMessage.objects.filter(session_id=session_id).order_by("-created_at")[
        :limit
    ]
    # return chronological order for UI rendering
    msgs = list(qs)[::-1]
    data = ChatMessageSerializer(msgs, many=True).data
    return Response(
        {"session_id": session_id, "count": len(data), "messages": data},
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([AllowAny])
def llm_health(request):
    provider = _get_llm_provider()

    if provider == "mock":
        return Response({"ok": True, "provider": "mock"})

    if provider == "llama_cpp":
        try:
            _get_llama_cpp_instance()
            return Response({"ok": True, "provider": "llama_cpp"})
        except Exception as e:
            return Response(
                {"ok": False, "detail": str(e)},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

    if provider == "openai_compat":
        base_url = os.environ.get("LLM_BASE_URL")
        model = os.environ.get("LLM_MODEL", "")
        timeout_s = 5
        if not base_url:
            return Response(
                {
                    "ok": False,
                    "provider": "openai_compat",
                    "error_type": "config_error",
                    "detail": "LLM_BASE_URL not set",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        normalized_url = _normalize_openai_base_url(base_url)

        models_url = f"{normalized_url.rstrip('/')}/models"
        t0 = pytime.perf_counter()
        req = urllib.request.Request(models_url, method="GET")
        try:
            with urllib.request.urlopen(req, timeout=timeout_s) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            latency_ms = int((pytime.perf_counter() - t0) * 1000)
            return Response(
                {
                    "ok": True,
                    "provider": "openai_compat",
                    "base_url": normalized_url,
                    "model": model,
                    "latency_ms": latency_ms,
                    "checked_url": models_url,
                    "timeout_s": timeout_s,
                    "available_models": data,
                },
                status=status.HTTP_200_OK,
            )
        except (urllib.error.URLError, socket.timeout) as e:
            latency_ms = int((pytime.perf_counter() - t0) * 1000)
            return Response(
                {
                    "ok": False,
                    "provider": "openai_compat",
                    "base_url": normalized_url,
                    "model": model,
                    "latency_ms": latency_ms,
                    "checked_url": models_url,
                    "timeout_s": timeout_s,
                    "error_type": "connection_error",
                    "detail": str(e),
                    "hint": "Start the OpenAI-compatible LLM server and verify LLM_BASE_URL (use 127.0.0.1 on Windows).",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        except Exception as e:
            latency_ms = int((pytime.perf_counter() - t0) * 1000)
            return Response(
                {
                    "ok": False,
                    "provider": "openai_compat",
                    "base_url": normalized_url,
                    "model": model,
                    "latency_ms": latency_ms,
                    "checked_url": models_url,
                    "timeout_s": timeout_s,
                    "error_type": "unknown_error",
                    "detail": str(e),
                    "hint": "Unexpected error while checking /v1/models; inspect server logs and configuration.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
    return Response(
        {"ok": False, "detail": f"Unknown provider: {provider}"},
        status=status.HTTP_503_SERVICE_UNAVAILABLE,
    )
