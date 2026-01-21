# ERP Inventory System

Prototype ERP / warehouse management system for **PAL Enterprises**, designed to evaluate replacing an existing SaaS tool (e.g. Dianxiaomi).  
The system tracks **customers, products, orders, inventory levels, and stock movements**, and exposes a REST API consumed by a React + Ant Design dashboard.

> Status: **working full‑stack prototype**  
> • Backend: Django + DRF API with inventory rules, CSV exports, dashboard metrics, and a simple chat/assistant endpoint.  
> • Frontend: Vite + React + Ant Design dashboard (summary cards, product table, low‑stock alert, order creation modal, and an AI assistant panel).

---

## Tech Stack

### Backend

- **Framework**: Django 5.x + Django REST Framework
- **App**: `inventory` (configured via `InventoryConfig`)
- **Database**:
  - Local development: SQLite (default Django `db.sqlite3`)
  - Production: can be switched to PostgreSQL or another RDBMS via `DATABASES`
- **Auth**
  - Django auth (used by Django admin and DRF session login)
  - JWT auth via `djangorestframework-simplejwt`:
    - `POST /api/token/` – obtain access/refresh token pair
    - `POST /api/token/refresh/` – refresh access token
- **API Schema & Docs**
  - drf-spectacular:
    - `GET /api/schema/` – OpenAPI schema
    - `GET /api/docs/` – Swagger UI

### Frontend

- **Framework**: React + TypeScript
- **Bundler**: Vite
- **UI Library**: Ant Design
- **HTTP**: Axios

The frontend is a single‑page dashboard that talks to the Django backend at `/api/...`.

---

## Data Model

All models live in `inventory.models`:

### Customer

Basic customer master data.

- `name` – display name
- `email` – optional
- `phone` – optional
- `address` – optional free‑form text
- Reverse relation: `orders` (from `Order`, via `related_name="orders"`)

### Product

Represents a SKU in the warehouse.

- `sku` – unique identifier (string)
- `name` – product name
- `stock` – current on‑hand quantity (integer)
- Default ordering: by `sku`

### Order

Sales order header.

- `customer_name` – human‑readable name saved on the order (required, used for quick/legacy entries)
- `customer` – optional FK → `Customer` (`null=True`, `blank=True`, `related_name="orders"`)
- `created_at` – timestamp (auto‑added)
- `status` – one of:
  - `draft`
  - `confirmed` (default)
  - `cancelled`

### OrderItem

Order lines.

- `order` – FK → `Order` (`related_name="items"`)
- `product` – FK → `Product`
- `quantity` – positive integer

Custom logic in `save()`:

- On **first creation only** (`self._state.adding`):
  - Checks `product.stock >= quantity`
  - Deducts stock (`product.stock -= quantity`) and saves the product
  - If stock is insufficient, raises `ValueError("Not enough stock ...")`

### StockMovement

Audit log for every inventory change.

- `product` – FK → `Product` (`related_name="stock_movements"`)
- `order` – optional FK → `Order` (`related_name="stock_movements"`)
- `previous_stock` – stock level before change
- `delta` – change amount (positive: in, negative: out)
- `new_stock` – stock after change
- `reason` – one of:
  - `"order"`
  - `"manual_adjustment"`
- `created_at` – timestamp

This is populated when:

- Orders are created (one `StockMovement` per order line)
- `bulk_adjust_stock` API is called for manual adjustments

### ChatMessage

Very small persistence layer for a chatbot / assistant.

- `session_id` – conversation id (string, indexed)
- `role` – `"user"` or `"bot"`
- `content` – message text
- `created_at` – timestamp
- Default ordering: by `created_at`

---

## Admin Integration

`inventory/admin.py` registers all models:

- **ProductAdmin**
  - `list_display`: `sku`, `name`, `stock`
  - `search_fields`: `sku`, `name`
  - `list_filter`: `stock`
- **CustomerAdmin**
  - `list_display`: `name`, `email`, `phone`
  - `search_fields`: `name`, `email`, `phone`
- **OrderAdmin**
  - `list_display`: `id`, `customer`, `customer_name`, `status`, `created_at`
  - `search_fields`: `customer__name`, `customer_name`
  - `list_filter`: `status`, `created_at`
- **OrderItemAdmin**
  - `list_display`: `order`, `product`, `quantity`
  - `search_fields`: `order__id`, `product__sku`, `product__name`
- **StockMovementAdmin**
  - `list_display`: `id`, `product`, `order`, `previous_stock`, `delta`, `new_stock`, `reason`, `created_at`
  - `list_filter`: `reason`, `created_at`, `product`
  - `search_fields`: `product__sku`, `product__name`, `order__id`
- **ChatMessageAdmin**
  - `list_display`: `session_id`, `role`, `short_content`, `created_at`
  - `list_filter`: `role`, `created_at`
  - `search_fields`: `session_id`, `content`
  - `short_content` shows a truncated preview of the message

---

## Permissions & Auth

### Custom Permission: `IsStaffOrReadOnly`

- All **safe methods** (`GET`, `HEAD`, `OPTIONS`) are allowed for everyone.
- **Write methods** (`POST`, `PUT`, `PATCH`, `DELETE`) require an authenticated user with `is_staff=True`.

Applied to:

- `ProductViewSet`
- `CustomerViewSet`
- `StockMovementViewSet` (which is read‑only, but still restricted to staff for safety)
- `bulk_adjust_stock` and `export` actions on `ProductViewSet`
- `export` action on `OrderViewSet`

### ViewSet‑level Permissions

- **ProductViewSet**
  - `permission_classes = [IsStaffOrReadOnly]`
- **CustomerViewSet**
  - `permission_classes = [IsStaffOrReadOnly]`
- **StockMovementViewSet**
  - `permission_classes = [IsStaffOrReadOnly]`
- **OrderViewSet**
  - `permission_classes = [AllowAny]` (open for now for demo; can be tightened later)
- **dashboard_summary**
  - `IsAuthenticatedOrReadOnly`
- **chat_with_bot**
  - `AllowAny`

### Auth Endpoints

- Django admin:
  - `GET /admin/`
- DRF session auth:
  - `POST /api-auth/login/`
  - `POST /api-auth/logout/`
- JWT:
  - `POST /api/token/` – obtain access and refresh tokens
  - `POST /api/token/refresh/` – refresh access token

---

## API Overview

All REST endpoints are wired in `urls.py` via a DRF `DefaultRouter` under `/api/`.

### Products

Viewset: `ProductViewSet` (`ModelViewSet`)

**Base endpoints**

- `GET /api/products/`
- `POST /api/products/` *(staff only)*
- `GET /api/products/{id}/`
- `PUT /api/products/{id}/` *(staff only)*
- `PATCH /api/products/{id}/` *(staff only)*
- `DELETE /api/products/{id}/` *(staff only)*

**Filtering / Searching / Ordering**

- Filter fields:
  - `sku`: `exact`, `icontains`
  - `name`: `icontains`
  - `stock`: `exact`, `gte`, `lte`
- Search:
  - `?search=<text>` – searches `sku` and `name`
- Ordering:
  - `?ordering=sku`, `?ordering=-stock`, etc.
  - Default ordering: `sku`

**Low‑stock helper**

- `GET /api/products/low_stock/?threshold=<int>`
  - Default `threshold=5` when absent or invalid
  - Returns products where `stock <= threshold`
  - Uses DRF pagination (20 items per page by default if pagination is enabled)

**Bulk stock adjustment**

- `POST /api/products/bulk_adjust_stock/` *(staff only)*
- Request body (JSON array):

  ```json
  [
    { "product_id": 1, "delta": 10 },
    { "product_id": 2, "delta": -3 }
  ]
  ```

- Behavior:
  - Validated by `ProductStockAdjustmentSerializer`
  - Locks rows with `select_for_update` and runs inside `transaction.atomic()`
  - Validates:
    - All referenced products exist
    - No resulting `stock` is negative
  - If validation passes:
    - Updates `Product.stock`
    - Creates corresponding `StockMovement` rows with `reason="manual_adjustment"`
  - If any check fails:
    - Raises `ValidationError`
    - Entire operation is rolled back (no stock changes)

**Product export (CSV)**

- `GET /api/products/export/` *(staff only)*
- Response:
  - `Content-Type: text/csv`
  - `Content-Disposition: attachment; filename="products.csv"`
- Columns:
  - `id, sku, name, stock`

---

### Customers

Viewset: `CustomerViewSet` (`ModelViewSet`)

**Base endpoints**

- `GET /api/customers/`
- `POST /api/customers/` *(staff only)*
- `GET /api/customers/{id}/`
- `PUT /api/customers/{id}/` *(staff only)*
- `PATCH /api/customers/{id}/` *(staff only)*
- `DELETE /api/customers/{id}/` *(staff only)*

**Filtering / Searching / Ordering**

- Filter fields:
  - `name`: `exact`, `icontains`
  - `email`: `exact`, `icontains`
- Search:
  - `?search=<text>` – searches `name`, `email`, `phone`
- Ordering:
  - `?ordering=id` or `?ordering=name`
  - Default: `name`

**Customer order history**

- `GET /api/customers/{id}/orders/`
  - Returns paginated list of orders for this customer, ordered by `-created_at`.

---

### Orders

Viewset: `OrderViewSet` (`ModelViewSet`, `AllowAny`)

**Base endpoints**

- `GET /api/orders/`
- `POST /api/orders/`
- `GET /api/orders/{id}/`
- `PUT /api/orders/{id}/`
- `PATCH /api/orders/{id}/`
- `DELETE /api/orders/{id}/`

**Filtering / Searching / Ordering**

- Filter fields:
  - `customer` – `?customer=<customer_id>`
  - `customer_name` – `exact`, `icontains`
  - `created_at` – `date__gte`, `date__lte`
  - `status` – `draft|confirmed|cancelled`
- Search:
  - `?search=<text>` – over `customer_name` and `customer__name`
- Ordering:
  - `?ordering=id` or `?ordering=created_at`
  - Default: `-created_at` (newest first)

**Request & response shape**

Serializer: `OrderSerializer` with nested `items`.

Example request:

```json
{
  "customer_name": "Test Customer",
  "customer_id": 1,
  "items": [
    { "product_id": 1, "quantity": 2 },
    { "product_id": 2, "quantity": 3 }
  ]
}
```

Example response:

```json
{
  "id": 3,
  "customer_name": "Test Customer",
  "created_at": "2025-11-18T04:09:17.872005Z",
  "status": "confirmed",
  "customer": {
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com",
    "phone": "",
    "address": ""
  },
  "items": [
    {
      "product": {
        "id": 1,
        "sku": "P001",
        "name": "Test A",
        "stock": 96
      },
      "quantity": 2
    }
  ]
}
```

**Atomic creation & stock deduction**

- `OrderSerializer.create()`:
  - Runs in a single `transaction.atomic()` block
  - Creates `Order`
  - Creates `OrderItem` rows from `items` array
    - Each `OrderItem` creation triggers `OrderItem.save()`:
      - Validates sufficient stock
      - Deducts stock from the associated `Product`
  - For each item, records a `StockMovement`:
    - `previous_stock`
    - `delta = -quantity`
    - `new_stock`
    - `reason = "order"`
- If any item would cause stock to go negative:
  - `OrderItem.save()` raises `ValueError`
  - Serializer catches it and raises a DRF `ValidationError({"detail": ...})`
  - Response is `400 Bad Request`
  - No `Order`, `OrderItem`, or stock changes are persisted (full rollback)

**Order export (CSV)**

- `GET /api/orders/export/` *(staff only)*
- Response:
  - `Content-Type: text/csv`
  - `Content-Disposition: attachment; filename="orders.csv"`
- Columns:
  - `id, customer_name, customer_id, status, created_at`
- Uses the same filter parameters as `/api/orders/` and exports the filtered queryset.

---

### Stock Movements

Viewset: `StockMovementViewSet` (`ReadOnlyModelViewSet`)

**Endpoints**

- `GET /api/stock-movements/`
- `GET /api/stock-movements/{id}/`

**Filtering / Searching / Ordering**

- Filter fields:
  - `product` – by product id
  - `order` – by order id
  - `reason` – `order` or `manual_adjustment`
  - `created_at` – `date__gte`, `date__lte`
- Search:
  - `?search=<text>` – over `product__sku` and `product__name`
- Ordering:
  - `?ordering=created_at` or `?ordering=id`
  - Default: `-created_at`

This endpoint powers the “stock history” drawer in the frontend.

---

### Dashboard Summary

Function view: `dashboard_summary`

- `GET /api/dashboard/`

Returns a JSON summary for the dashboard:

```json
{
  "products_count": 12,
  "customers_count": 5,
  "orders_total_count": 42,
  "orders_last_30_days": 10,
  "total_stock": 378,
  "low_stock_count": 3,
  "orders_by_status": {
    "draft": 3,
    "confirmed": 35,
    "cancelled": 4
  }
}
```

Semantics:

- `products_count` – total number of products
- `customers_count` – total number of customers
- `orders_total_count` – total number of orders
- `orders_last_30_days` – only **confirmed** orders created in the last 30 days
- `total_stock` – sum of `Product.stock` across all products
- `low_stock_count` – number of products where `stock <= 5`
- `orders_by_status` – counts of orders grouped by `status`

---

### Chatbot Endpoint

Function view: `chat_with_bot`

- `POST /api/chat/`
- Request body:

  ```json
  {
    "session_id": "optional string",
    "message": "User question here"
  }
  ```

- Behavior:
  - If `session_id` is omitted or empty, a new hex id is generated.
  - Saves the user message as a `ChatMessage` with `role="user"`.
  - Generates a reply with `simple_bot_reply(message)`:
    - For now, this is a simple keyword‑based helper that points users to `/api/products/`, `/api/products/low_stock/`, `/api/orders/`, etc.
  - Saves the bot reply as a `ChatMessage` with `role="bot"`.
  - Loads the latest 10 messages for that `session_id` (sorted by time) and returns:

    ```json
    {
      "session_id": "same or new session id",
      "reply": "bot reply text",
      "history": [
        { "id": 1, "role": "user", ... },
        { "id": 2, "role": "bot", ... }
      ]
    }
    ```

This is a placeholder endpoint that can later be wired to a real LLM / NLU backend.

---

## Frontend (High‑Level)

> Note: This section describes the current behavior of the React + Ant Design app that consumes the APIs above.

- **DashboardSummary**
  - Calls `GET /api/dashboard/`
  - Shows cards for:
    - Total products
    - Total stock
    - Total orders (with last‑30‑days orders in brackets)
    - Low‑stock count

- **ProductList**
  - Calls `GET /api/products/?page=<n>`
  - Shows a table:
    - ID, SKU, Name, Stock, “History” button
  - Stock column:
    - ≤ 5: red tag (“low stock”)
    - > 5: green tag

- **LowStockTable**
  - Calls `GET /api/products/low_stock/`
  - Shows a compact table for SKUs that need replenishment.

- **ProductStockHistoryDrawer**
  - When opened for a given product, calls:
    - `GET /api/stock-movements/?product=<product_id>`
  - Shows a list of stock movement rows:
    - Time, delta, reason, previous → new stock values, and linked order id (if any).

- **CreateOrderModal**
  - On open:
    - Loads customers via `GET /api/customers/`
    - Loads products via `GET /api/products/`
  - Collects:
    - `customer_id`
    - `customer_name`
    - One or more line items (`product_id`, `quantity`)
  - Submits a new order via `POST /api/orders/`.
  - Properly handles:
    - Validation errors (e.g. insufficient stock → 400 with `detail` message from backend).

- **ChatPanel**
  - Simple chat UI bound to `POST /api/chat/`.
  - Maintains `sessionId` in state, sends it along with each message.
  - Renders role‑tagged message bubbles for user and bot.

---

## Local Development

### Backend (Django)

1. Create and activate a virtual environment:

   ```bash
   python -m venv .venv
   # Windows PowerShell
   .\.venv\Scripts\Activate.ps1
   # macOS / Linux
   # source .venv/bin/activate
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Run migrations:

   ```bash
   python manage.py migrate
   ```

4. Create a superuser (for admin and DRF login):

   ```bash
   python manage.py createsuperuser
   ```

5. Start the development server:

   ```bash
   python manage.py runserver
   ```

6. Access:

   - Django admin: `http://127.0.0.1:8000/admin/`
   - DRF API root / router: `http://127.0.0.1:8000/api/`
   - DRF login: `http://127.0.0.1:8000/api-auth/login/`
   - Swagger UI: `http://127.0.0.1:8000/api/docs/`
   - OpenAPI schema: `http://127.0.0.1:8000/api/schema/`

### Frontend (Vite + React)

From the frontend directory (e.g. `erp-frontend/`):

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start Vite dev server:

   ```bash
   npm run dev
   ```

3. Open the URL printed in the console (usually something like `http://127.0.0.1:5173/`).

Make sure the backend is running at `http://127.0.0.1:8000` or update the frontend’s API base URL accordingly.

---

## Testing

Backend tests live in `inventory/tests.py` and cover:

- **Stock behavior**
  - Creating `OrderItem` deducts stock correctly.
  - Attempting to create an order with insufficient stock:
    - Returns `400 Bad Request` from `/api/orders/`
    - Leaves stock, orders, and order items unchanged (transaction rollback).
- **Permissions**
  - Anonymous users:
    - Can list products
    - Cannot create products
  - Non‑staff authenticated users:
    - Can list products
    - Cannot create products
  - Staff users:
    - Can create products
- **Low‑stock endpoint**
  - Default threshold (`5`)
  - Custom threshold via `?threshold=10`
- **Product export**
  - `/api/products/export/` returns CSV with header and data rows.
- **Customer orders endpoint**
  - `/api/customers/{id}/orders/` only returns orders for that customer.
- **Order status & filtering**
  - New orders default to `status="confirmed"`
  - Filtering orders by `status` works as expected.
- **Dashboard summary**
  - Correct counts and status‑aware metrics (`orders_last_30_days`, `orders_by_status`).
- **Bulk stock adjustment**
  - Successful adjustments update stock correctly.
  - Invalid adjustments (negative result) roll back all changes.
- **Stock movement creation**
  - Orders and bulk adjustments both create matching `StockMovement` records.

Run tests:

```bash
python manage.py test inventory
```

---

## Next Steps / Ideas

- Tighten `OrderViewSet` permissions (e.g. switch to `IsStaffOrReadOnly` or JWT roles).
- Add more stock movement reasons (returns, damaged goods, cycle count adjustments).
- Extend models with financial fields (unit cost, sale price, discounts, taxes).
- Replace `simple_bot_reply` with a real LLM / NLU backend and add intents for:
  - “Show low stock items”
  - “Recent orders from customer X”
  - “Total stock value by category”
- Add more dashboard filters and charts on the frontend (orders over time, top customers, etc.).


## Local Development (Backend + Postgres on Windows/Mac/Linux)

This repo supports running the backend with **SQLite by default**, and **PostgreSQL** for a production‑like local environment.

### Prerequisites

- Python 3.11+
- Docker Desktop (Docker Compose v2)
- (Windows) PowerShell

### 1) Start PostgreSQL (Docker)

From the repo root:

```powershell
cd D:\erp-inventory-system
docker compose up -d db
docker ps
```

**Port note (important):**

- PostgreSQL in the container listens on **5432**.
- If your machine already has something using host port **5432** (common on Windows), map the container to host **5433** instead and use `PG_PORT=5433`.

In `docker-compose.yml`, the `db` service should be:

```yml
services:
  db:
    ports:
      - "5433:5432"  # host:container (use 5432:5432 if 5432 is free)
```

### 2) Create & activate venv, install deps

```powershell
cd D:\erp-inventory-system\erp-backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

If you use Postgres + psycopg3:

```powershell
pip install "psycopg[binary]"
```

### 3) Configure environment variables

#### Option A — set vars in the current terminal session (PowerShell)

```powershell
$env:USE_POSTGRES="1"
$env:PG_DB="erp"
$env:PG_USER="erp"
$env:PG_PASSWORD="erp"
$env:PG_HOST="127.0.0.1"
$env:PG_PORT="5433"  # use 5432 if you mapped 5432:5432
```

#### Option B — use a `.env` file

Create `erp-backend/.env`:

```env
USE_POSTGRES=1
PG_DB=erp
PG_USER=erp
PG_PASSWORD=erp
PG_HOST=127.0.0.1
PG_PORT=5433
```
> If your settings module reads directly from OS env vars, `.env` works only if your setup loads it (e.g., via `python-decouple`, `django-environ`, or a custom loader). If you’re not sure, use **Option A**.

### 4) Verify DB connectivity (quick sanity check)

Run from `erp-backend` (venv activated):

```powershell
python -c "import psycopg, os; conn=psycopg.connect(host=os.environ['PG_HOST'], port=os.environ['PG_PORT'], dbname=os.environ['PG_DB'], user=os.environ['PG_USER'], password=os.environ['PG_PASSWORD']); print(conn.execute('select 1').fetchone()); conn.close()"
```

Expected output:

```
(1,)
```

### 5) Run migrations

```powershell
python manage.py migrate
```

### 6) Create a superuser (optional)

```powershell
python manage.py createsuperuser
```

### 7) Run the backend server

```powershell
python manage.py runserver
```

Then open:

- Admin: http://127.0.0.1:8000/admin/

If schema UI is enabled, one of these may exist depending on your URL config:

- Swagger UI: http://127.0.0.1:8000/api/schema/swagger-ui/
- Redoc: http://127.0.0.1:8000/api/schema/redoc/

### Stop / reset database

Stop containers:

```powershell
cd D:\erp-inventory-system
docker compose down
```

Hard reset DB volume (**DESTROYS ALL DATA**):

```powershell
docker compose down -v
```

### Troubleshooting

#### `Password authentication failed for user "erp"`

Usually means you are connecting to a **different Postgres than you think** (e.g., a host-installed Postgres on 5432), or the container was initialized with different credentials.

Checklist:

1) Confirm which host port is mapped:

```powershell
cd D:\erp-inventory-system
docker ps
```

2) Inspect container env vars (should match your `PG_*`):

```powershell
docker inspect erp_postgres --format "{{range .Config.Env}}{{println .}}{{end}}" | findstr POSTGRES_
```

3) If you changed `POSTGRES_*` after a volume already existed, recreate the volume:

```powershell
docker compose down -v
docker compose up -d db
```

4) If port 5432 is contested, use host 5433 mapping and set `PG_PORT=5433`.

#### Compose validation error: `services.db.environment.ports must be ...`

You put `ports:` under `environment:` by mistake.
Make sure `ports:` is directly under the `db:` service, not nested in `environment:`.

Correct:

```yml
services:
  db:
    environment:
      POSTGRES_DB: erp
      POSTGRES_USER: erp
      POSTGRES_PASSWORD: erp
    ports:
      - "5433:5432"
```
```

    ---

    ## Helper scripts

    If you frequently switch between **SQLite** and **PostgreSQL** (or you have multiple local Postgres instances), these scripts help you avoid “it works in Docker but not in Django” problems.

    ### 1) Verify PostgreSQL connectivity from Python

    Create: `erp-backend/scripts/db_check.py`

    ```python
    #!/usr/bin/env python3
'''
Small sanity check for local Postgres connectivity.

- Reads env vars (PG_* preferred, DB_* supported as fallback)
- Prints a clear diagnosis + common fixes (wrong port, wrong password, container not started)
'''
from __future__ import annotations

import os
import sys
from dataclasses import dataclass

try:
    import psycopg
except Exception:
    print('ERROR: psycopg is not installed in this venv.')
    print('Fix: pip install "psycopg[binary]"')
    raise


def _env(*names: str, default: str | None = None) -> str | None:
    for n in names:
        v = os.environ.get(n)
        if v is not None and v != "":
            return v
    return default


@dataclass(frozen=True)
class DbCfg:
    host: str
    port: int
    dbname: str
    user: str
    password: str | None


def load_cfg() -> DbCfg:
    host = _env("PG_HOST", "DB_HOST", default="127.0.0.1")
    port_s = _env("PG_PORT", "DB_PORT", default="5432")
    dbname = _env("PG_DB", "DB_NAME", default="erp")
    user = _env("PG_USER", "DB_USER", default="erp")
    password = _env("PG_PASSWORD", "DB_PASSWORD", default=None)

    try:
        port = int(port_s)  # type: ignore[arg-type]
    except Exception:
        raise SystemExit(f"Invalid port value: {port_s!r}")

    return DbCfg(host=host, port=port, dbname=dbname, user=user, password=password)


def try_connect(cfg: DbCfg) -> tuple[bool, str]:
    try:
        conn = psycopg.connect(
            host=cfg.host,
            port=cfg.port,
            dbname=cfg.dbname,
            user=cfg.user,
            password=cfg.password,
            connect_timeout=3,
        )
        with conn.cursor() as cur:
            cur.execute("select 1;")
            val = cur.fetchone()
        conn.close()
        return True, f"OK: connected to {cfg.host}:{cfg.port}/{cfg.dbname} as {cfg.user}. Result={val}"
    except Exception as e:
        return False, f"{type(e).__name__}: {e}"


def main() -> None:
    cfg = load_cfg()
    ok, msg = try_connect(cfg)
    if ok:
        print(msg)
        return

    print("FAILED:", msg)
    print()
    print("Most common fixes:")
    print("1) Wrong port")
    print("   - If Postgres is in Docker, your host port might be 5433 (not 5432).")
    print("   - Check: docker ps  (look for '0.0.0.0:XXXX->5432/tcp')")
    print("2) Wrong password/user/db")
    print("   - Check container env: docker inspect <container> --format "{{range .Config.Env}}{{println .}}{{end}}"")
    print("3) Container not running")
    print("   - Start: docker compose up -d db")
    print()
    if cfg.port == 5432:
        alt = DbCfg(host=cfg.host, port=5433, dbname=cfg.dbname, user=cfg.user, password=cfg.password)
        ok2, msg2 = try_connect(alt)
        if ok2:
            print("HINT: Connection works on port 5433.")
            print("Set: $env:PG_PORT="5433"  (PowerShell)")
    sys.exit(1)


if __name__ == "__main__":
    main()
    ```

    Run (from `erp-backend/` in the venv):

    ```powershell
    python scripts\db_check.py
    ```

    ### 2) One-command local Postgres dev bootstrap (Windows PowerShell)

    Create: `scripts/dev.ps1`

    ```powershell
    param(
  [int]$DbPort = 5433,
  [string]$DbHost = "127.0.0.1",
  [string]$DbName = "erp",
  [string]$DbUser = "erp",
  [string]$DbPassword = "erp",
  [switch]$RunServer
)

$ErrorActionPreference = "Stop"

# Repo root is the parent of this scripts/ folder
$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "==> Starting db container (docker compose up -d db)"
Set-Location $RepoRoot
docker compose up -d db | Out-Host

Write-Host "==> Activating backend venv"
Set-Location "$RepoRoot\erp-backend"
. .\.venv\Scripts\Activate.ps1

Write-Host "==> Exporting env vars for Postgres"
$env:USE_POSTGRES = "1"
$env:PG_DB = $DbName
$env:PG_USER = $DbUser
$env:PG_PASSWORD = $DbPassword
$env:PG_HOST = $DbHost
$env:PG_PORT = "$DbPort"

Write-Host "==> Checking DB connectivity"
python scripts\db_check.py

Write-Host "==> Running migrations"
python manage.py migrate

if ($RunServer) {
  Write-Host "==> Starting Django dev server"
  python manage.py runserver
} else {
  Write-Host "Done. (Add -RunServer to start the dev server.)"
}
    ```

    Run (from repo root):

    ```powershell
    powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1 -DbPort 5433 -RunServer
    ```

    > If your Postgres host port is still 5432, run: `.\scripts\dev.ps1 -DbPort 5432 -RunServer`


### Notes / Disclosure
Built and validated by the author. AI coding assistants were used as auxiliary tools during development (debugging/refactoring/productivity).

