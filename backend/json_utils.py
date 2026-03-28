"""Small helpers for parsing JSON from SQLite text columns."""

from __future__ import annotations

import json
from typing import Any


def loads_json(value: str | None, default: Any) -> Any:
    if value is None or value == "":
        return default
    try:
        return json.loads(value)
    except (json.JSONDecodeError, TypeError):
        return default
