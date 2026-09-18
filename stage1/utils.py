"""
Utility functions for timing, serialization, and logging in Stage 1 Atlas.
"""

import json
from datetime import date, datetime
from time import perf_counter
from typing import Any, Callable, Tuple


class StudyJSONEncoder(json.JSONEncoder):
    """JSON encoder handling date, datetime, set, and custom object serialization."""
    def default(self, o: Any) -> Any:
        if isinstance(o, (date, datetime)):
            return o.isoformat()
        if isinstance(o, set):
            return sorted(list(o))
        if hasattr(o, "to_dict"):
            return o.to_dict()
        if hasattr(o, "model_dump"):
            return o.model_dump()
        return super().default(o)


def time_execution(fn: Callable, *args: Any, **kwargs: Any) -> Tuple[Any, float]:
    """Execute fn and return (result, elapsed_seconds)."""
    t0 = perf_counter()
    result = fn(*args, **kwargs)
    t1 = perf_counter()
    return result, t1 - t0
