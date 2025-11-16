# ERP Inventory System (In Development)

A full-stack ERP system for warehouse and order management, built with Django REST and React.

### Backend (Django + DRF)

- `/api/products/`: CRUD for products.
- `/api/orders/`: create and list customer orders with nested line items.
- Creating an order via `/api/orders/` automatically creates `OrderItem` rows
  and deducts stock from the related `Product` records.

#### Local dev (Windows + SQLite)

1. `cd erp-backend`
2. `python -m venv .venv && .\.venv\Scripts\Activate.ps1`
3. `pip install -r requirements.txt` (or install Django + DRF + python-decouple)
4. `python manage.py migrate`
5. `python manage.py runserver`
