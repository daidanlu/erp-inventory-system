# ERP Inventory System

Prototype ERP / warehouse management system for PAL Enterprises to evaluate replacing an existing SaaS tool (e.g. Dianxiaomi).  
The goal is to manage **products, customers, orders, and inventory** with a clean API that can be used by a React / Ant Design frontend.

> Status: backend prototype in active development.  
> Product / Customer / Order / Inventory modules and basic access control are already implemented.

---

## Tech Stack

- **Backend**: Django 5 + Django REST Framework
- **Database**:
  - Local development: SQLite
  - Production-ready: PostgreSQL via environment variables (`DB_NAME`, `DB_USER`, etc.)
- **Auth & Permissions**:
  - Django auth
  - DRF custom permission (`IsStaffOrReadOnly`) for role-based access control
- **API Utilities**:
  - `django-filter` for filtering
  - DRF `SearchFilter` / `OrderingFilter`
  - DRF pagination (`PageNumberPagination`)

Frontend (React + Ant Design) will consume these APIs but is not covered in this backend README.

---

## Features (implemented so far)

### Core Domain

- **Products**
  - SKU, name, stock quantity
  - CRUD via `/api/products/`
  - Filtering, search, ordering
  - Pagination
  - Dedicated **low-stock endpoint** for inventory alerts:
    - `GET /api/products/low_stock/?threshold=5`

- **Customers**
  - Basic customer profile: name, email, phone, address
  - CRUD via `/api/customers/`
  - Linked to orders via a foreign key (`Order.customer`)
  - Filtering and search

- **Orders**
  - Orders store:
    - `customer_name` (string, for legacy / quick entries)
    - Optional `customer` foreign key
    - Timestamp (`created_at`)
  - Nested order items with product + quantity
  - API:
    - `POST /api/orders/` creates an order and its items in one request
  - **Automatic stock deduction & transactional safety**:
    - When an `OrderItem` is created, it checks stock and deducts from the related `Product`.
    - If there is not enough stock, order creation fails with a validation error and a `400 Bad Request` response.
    - Order creation is wrapped in a database transaction, so if any item fails (e.g. insufficient stock), no partial orders or stock updates are persisted.


- **Dashboard Summary**
  - Aggregated metrics for a simple dashboard:
    - Total products
    - Total customers
    - Total orders
    - Orders in the last 30 days
    - Total stock
    - Number of low-stock products
  - `GET /api/dashboard/`

---

## Role-Based Access Control (RBAC)

The system implements a minimal but practical RBAC layer at the API level:

- **Anonymous users**
  - Can read data (GET).
  - Cannot modify anything (no POST / PUT / PATCH / DELETE).

- **Authenticated non-staff users**
  - Same as anonymous: read-only.
  - Intended for internal users who can browse data but not change it.

- **Staff / admin users**
  - Full read/write access to Products, Customers, and Orders via the REST API.
  - Django admin access for managing data through the web UI.

Implementation details:

- Custom permission class `IsStaffOrReadOnly` in `inventory/permissions.py`
- Applied to:
  - `ProductViewSet`
  - `OrderViewSet`
  - `CustomerViewSet`
- DRF login for testing:
  - `api-auth/` is enabled so you can log in via the DRF browsable API using Django users.

---

## API Overview

### Auth

- **Admin / Django auth**
  - `/admin/` – Django admin (staff only)
- **DRF login**
  - `/api-auth/login/` – login form for the browsable API
  - `/api-auth/logout/`

---

### Products

**Endpoint**

- `GET /api/products/`
- `POST /api/products/` *(staff only)*
- `GET /api/products/{id}/`
- `PUT /api/products/{id}/` *(staff only)*
- `PATCH /api/products/{id}/` *(staff only)*
- `DELETE /api/products/{id}/` *(staff only)*

**Query parameters**

- **Filtering** (via `django-filter`):

  - `sku` – exact or partial match (depending on how the viewset is configured)
  - `name` – partial match
  - `stock`, `stock__gte`, `stock__lte` – filter by stock level

- **Search**:

  - `?search=P001` – searches by SKU and name

- **Ordering**:

  - `?ordering=sku`
  - `?ordering=-stock`

- **Pagination** (global):

  - `?page=1`
  - `?page=2`
  - Page size is controlled by `REST_FRAMEWORK["PAGE_SIZE"]` (currently 20).

**Low-stock helper**

- `GET /api/products/low_stock/`  
- Optional: `?threshold=5` (default 5)

Returns products whose `stock <= threshold`, with pagination.

---

### Customers

**Endpoint**

- `GET /api/customers/`
- `POST /api/customers/` *(staff only)*
- `GET /api/customers/{id}/`
- `PUT /api/customers/{id}/` *(staff only)*
- `PATCH /api/customers/{id}/` *(staff only)*
- `DELETE /api/customers/{id}/` *(staff only)*

**Query parameters**

- Filter by:
  - `name`
  - `email`
- Search:
  - `?search=alice` – searches name, email, phone
- Ordering:
  - `?ordering=name`, `?ordering=-id`
- Paginated response
- Per-customer order history:
  - `GET /api/customers/{id}/orders/` – returns the paginated list of orders for a given customer, ordered by newest first.

---

### Orders

**Endpoint**

- `GET /api/orders/`
- `POST /api/orders/` *(staff only)*
- `GET /api/orders/{id}/`
- `PUT /api/orders/{id}/` *(staff only)*
- `PATCH /api/orders/{id}/` *(staff only)*
- `DELETE /api/orders/{id}/` *(staff only)*

**Create order – request shape**

`POST /api/orders/`:

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

**Response shape**

```json
{
  "id": 3,
  "customer_name": "Test Customer",
  "created_at": "2025-11-18T04:09:17.872005Z",
  "customer": {
    "id": 1,
    "name": "Alice",
    "email": "alice@example.com",
    ...
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
    },
    ...
  ]
}
```

- When order items are created, stock is deducted in the `OrderItem.save()` method.
- If requested quantity exceeds available stock, a `ValueError` is raised in the model and converted into a `400 Bad Request` response.
- The entire order creation runs inside a database transaction, so no partial orders or stock updates are saved when validation fails.

**Filtering / Search / Ordering**

- Filter:
  - `?customer=<id>`
  - `?customer_name=Alice`
  - `?created_at__gte=2025-11-01`
- Search:
  - `?search=Alice` (searches `customer_name` and `customer.name`)
- Ordering:
  - `?ordering=created_at`
  - `?ordering=-created_at`

---

### Dashboard

- `GET /api/dashboard/`

Returns aggregated metrics:

```json
{
  "products_count": 12,
  "customers_count": 5,
  "orders_total_count": 42,
  "orders_last_30_days": 10,
  "total_stock": 378,
  "low_stock_count": 3
}
```

Intended as a backend data source for a React / Ant Design dashboard.

---

## Local Development (Windows + SQLite)

1. Clone the repository:

   ```bash
   git clone https://github.com/daidanlu/erp-inventory-system.git
   cd erp-inventory-system/erp-backend
   ```

2. Create and activate a virtual environment (Windows PowerShell):

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

3. Install dependencies:

   ```powershell
   pip install -r requirements.txt
   # or manually:
   # pip install django djangorestframework django-filter python-decouple
   # (plus psycopg2-binary if using PostgreSQL)
   ```

4. Run migrations (SQLite by default):

   ```powershell
   python manage.py migrate
   ```

5. Create a superuser:

   ```powershell
   python manage.py createsuperuser
   ```

6. Start the dev server:

   ```powershell
   python manage.py runserver
   ```

7. Access:

   - Admin: `http://127.0.0.1:8000/admin/`
   - DRF browsable API root: `http://127.0.0.1:8000/api/`
   - DRF login: `http://127.0.0.1:8000/api-auth/login/`

---

## Testing

The `inventory` app includes unit tests for:

- Role-based access control on the product API (anonymous / non-staff / staff users).
- The `/api/products/low_stock/` endpoint behaviour for default and custom thresholds.
- Order API behaviour when stock is insufficient (returns 400 and rolls back all changes).

Run the tests with:

```bash
python manage.py test inventory
```

---

## Future Work / TODO

- Frontend:
  - React + Ant Design dashboard pages for products, customers, and orders.
  - Low-stock warnings and basic charts using `/api/dashboard/` and `/api/products/low_stock/`.
- Backend:
  - More detailed order status (draft / confirmed / shipped).
  - Move stock deduction to order confirmation stage.
  - Export (CSV/Excel) endpoints for orders and inventory.
  - More granular permissions (e.g., warehouse vs. sales roles).
