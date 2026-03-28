# Database schema changes

This project uses SQLite with `CREATE TABLE IF NOT EXISTS` in `database.py`. There is no automatic migrator.

When you add columns or new tables:

1. Add the `CREATE TABLE` / new columns to `init_db()` for **fresh** databases.
2. For **existing** `sentinel.db` files, run a one-time `ALTER TABLE` (or recreate) manually or via a dated script in this folder, and document the date in your PR.

Enabling `PRAGMA foreign_keys=ON` (see `get_conn()` in `database.py`) enforces referential integrity for new writes.
