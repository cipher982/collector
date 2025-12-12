"""Factory helpers for tests.

We purposefully avoid using the database here – factories return pure Python
objects that can be JSON-encoded directly and sent to the API.
"""

from __future__ import annotations

import random
import string
from typing import Any
from typing import Dict


def _rand_str(n: int = 8) -> str:
    return "".join(random.choices(string.ascii_letters, k=n))


def sample_payload() -> Dict[str, Any]:
    """Return a minimally valid /collect payload."""

    return {
        "timestamp": "2025-01-01T00:00:00Z",
        "browser": {
            "userAgent": _rand_str(),
            "onLine": True,
        },
        "performance": {
            "resources": [],
        },
        "fingerprints": {
            "canvas": _rand_str(16),
            "fonts": ["Arial", "Helvetica"],
            "webgl": {"vendor": "Test"},
        },
        "errors": [],
    }


def sample_event() -> Dict[str, Any]:
    """Return a minimally valid /event payload."""

    return {
        "visitor_id": "v_test",
        "session_id": "s_test",
        "pageview_id": "p_test",
        "event_type": "pageview",
        "seq": 1,
        "client_timestamp": "2025-01-01T00:00:00Z",
        "path": "/",
        "referrer": None,
        "payload": {"k": "v"},
    }
