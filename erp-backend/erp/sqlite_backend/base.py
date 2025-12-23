from django.db.backends.sqlite3.base import DatabaseWrapper as SQLiteDatabaseWrapper


class DatabaseWrapper(SQLiteDatabaseWrapper):
    """
    SQLite connection tweaks to reduce flaky 'database table is locked' errors
    during concurrent test requests.
    """

    def get_new_connection(self, conn_params):
        conn = super().get_new_connection(conn_params)

        try:
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")
            conn.execute("PRAGMA busy_timeout=5000;")  # ms
            conn.execute("PRAGMA foreign_keys=ON;")
        except Exception:

            pass
        return conn
