"""Translate SQLite-oriented SQL to PostgreSQL when using a Postgres backend."""

import re
from typing import Final

_RE_DT_NOW_DAYS: Final = re.compile(r"datetime\('now',\s*'-(\d+)\s+day'\)", re.IGNORECASE)
_RE_DT_NOW: Final = re.compile(r"datetime\('now'\)", re.IGNORECASE)


def adapt_sql_for_postgres(sql: str) -> str:
    """Adjust SQLite-specific functions and placeholders for psycopg."""
    s = sql.strip()
    # INSERT OR IGNORE → ON CONFLICT (only table we use this for)
    if "INSERT OR IGNORE" in s.upper():
        s = _adapt_insert_or_ignore(s)
    s = _RE_DT_NOW_DAYS.sub(r"(CURRENT_TIMESTAMP - INTERVAL '\1 days')", s)
    s = _RE_DT_NOW.sub("CURRENT_TIMESTAMP", s)
    # date() for timestamptz columns
    s = re.sub(r"\bdate\(\s*created_at\s*\)", "(created_at::date)", s, flags=re.IGNORECASE)
    s = s.replace("?", "%s")
    return s


def _adapt_insert_or_ignore(sql: str) -> str:
    m = re.search(
        r"INSERT\s+OR\s+IGNORE\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)",
        sql,
        re.IGNORECASE | re.DOTALL,
    )
    if not m:
        return sql
    table, cols, vals = m.group(1), m.group(2), m.group(3)
    if table.lower() == "alert_notifications":
        return (
            f"INSERT INTO {table} ({cols}) VALUES ({vals}) "
            "ON CONFLICT (alert_id) DO NOTHING"
        )
    return sql


def should_append_returning_id(sql: str) -> bool:
    """Whether this INSERT should get RETURNING id under PostgreSQL."""
    u = sql.upper().strip()
    if not u.startswith("INSERT"):
        return False
    if "RETURNING" in u:
        return False
    if "INSERT OR IGNORE" in u.upper():
        return False
    if "ON CONFLICT" in u and "DO NOTHING" in u.upper():
        return False
    return True


def append_returning_id(sql: str) -> str:
    s = sql.rstrip().rstrip(";")
    return f"{s} RETURNING id"


def strip_trailing_semicolon(sql: str) -> str:
    return sql.rstrip().rstrip(";")

