#!/usr/bin/env python3
"""
Small sanity check for local Postgres connectivity.

- Reads env vars (PG_* preferred, DB_* supported as fallback)
- Prints a clear diagnosis + common fixes (wrong port, wrong password, container not started)
"""

from __future__ import annotations

import os
import sys
from dataclasses import dataclass

try:
    import psycopg
except Exception:
    print("ERROR: psycopg is not installed in this venv.")
    print('Fix: pip install "psycopg[binary]"')
    raise


def _env(*names: str, default: str | None = None) -> str | None:
    for n in names:
        v = os.environ.get(n)
        if v:
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
    host = _env("PG_HOST", "DB_HOST", default="127.0.0.1") or "127.0.0.1"
    port_s = _env("PG_PORT", "DB_PORT", default="5432") or "5432"
    dbname = _env("PG_DB", "DB_NAME", default="erp") or "erp"
    user = _env("PG_USER", "DB_USER", default="erp") or "erp"
    password = _env("PG_PASSWORD", "DB_PASSWORD", default=None)

    try:
        port = int(port_s)
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


def main() -> int:
    cfg = load_cfg()
    ok, msg = try_connect(cfg)
    if ok:
        print(msg)
        return 0

    print("FAILED:", msg)
    print()
    print("Most common fixes:")
    print("1) Wrong port")
    print("   - If Postgres is in Docker, your host port might be 5433 (not 5432).")
    print("   - Check: docker ps  (look for '0.0.0.0:XXXX->5432/tcp')")
    print("2) Wrong password/user/db")
    print(
        '   - Check container env: docker inspect <container> --format "{{range .Config.Env}}{{println .}}{{end}}"'
    )
    print("3) Container not running")
    print("   - Start: docker compose up -d db")
    print()

    # if user is on 5432, auto-test 5433 to suggest the right mapping.
    if cfg.port == 5432:
        alt = DbCfg(
            host=cfg.host,
            port=5433,
            dbname=cfg.dbname,
            user=cfg.user,
            password=cfg.password,
        )
        ok2, msg2 = try_connect(alt)
        if ok2:
            print("HINT: Connection works on port 5433.")
            print('Set: $env:PG_PORT="5433"  (PowerShell)')
            print("Or run: powershell -ExecutionPolicy Bypass -File .\\scripts\\dev.ps1 -DbPort 5433")
            return 1

    return 1


if __name__ == "__main__":
    raise SystemExit(main())
