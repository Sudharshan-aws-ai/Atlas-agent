"""
Date parsing and normalization layer for clinical study data.
Handles ISO, British/European, military/CDISC alphabetic dates (DD-MON-YYYY),
timestamps, and malformed date strings safely.
"""

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Optional


DATE_FORMATS = [
    "%Y-%m-%d",           # ISO standard, e.g. 2026-03-30
    "%d-%b-%Y",           # CDISC/alpha format, e.g. 03-FEB-2026
    "%d-%B-%Y",           # CDISC full month, e.g. 03-FEBRUARY-2026
    "%Y/%m/%d",           # Slash ISO
    "%d/%m/%Y",           # Slash European
    "%m/%d/%Y",           # Slash US
    "%Y-%m-%dT%H:%M:%S",  # ISO with time
    "%Y-%m-%d %H:%M:%S",  # Space with time
]


@dataclass(frozen=True)
class ParsedDate:
    """Represents the parsed outcome of a date string."""
    is_valid: bool
    date_val: Optional[date]
    iso: Optional[str]
    raw: str
    error: Optional[str] = None

    def __str__(self) -> str:
        return self.iso if self.iso else f"INVALID({self.raw})"


def parse_date(raw_val: Any) -> ParsedDate:
    """
    Parses a raw date value into a canonical ParsedDate.
    Never silently guesses or crashes on malformed/unknown dates.
    Preserves original string faithfully.
    """
    if raw_val is None:
        return ParsedDate(is_valid=False, date_val=None, iso=None, raw="", error="Date is null/None")

    s = str(raw_val).strip()
    if not s or s.lower() in ["nan", "none", "null", ""]:
        return ParsedDate(is_valid=False, date_val=None, iso=None, raw=s, error="Date string is empty")

    for fmt in DATE_FORMATS:
        try:
            dt = datetime.strptime(s, fmt)
            d = dt.date()
            return ParsedDate(is_valid=True, date_val=d, iso=d.isoformat(), raw=s, error=None)
        except ValueError:
            continue

    # Attempt case-insensitive match for month abbreviations like 03-feb-2026
    try:
        parts = s.split("-")
        if len(parts) == 3 and len(parts[1]) == 3:
            s_cap = f"{parts[0]}-{parts[1].capitalize()}-{parts[2]}"
            dt = datetime.strptime(s_cap, "%d-%b-%Y")
            d = dt.date()
            return ParsedDate(is_valid=True, date_val=d, iso=d.isoformat(), raw=s, error=None)
    except Exception:
        pass

    return ParsedDate(
        is_valid=False,
        date_val=None,
        iso=None,
        raw=s,
        error=f"Unrecognized date format: '{s}'"
    )


def days_between(d1: Any, d2: Any) -> Optional[int]:
    """
    Computes (d1 - d2) in days.
    Returns None if either date is invalid.
    """
    p1 = d1 if isinstance(d1, ParsedDate) else parse_date(d1)
    p2 = d2 if isinstance(d2, ParsedDate) else parse_date(d2)

    if not p1.is_valid or not p2.is_valid or p1.date_val is None or p2.date_val is None:
        return None

    return (p1.date_val - p2.date_val).days


def within_window_days(d1: Any, d2: Any, window_days: int) -> bool:
    """
    Determines if two dates fall within +/- window_days of each other (inclusive).
    Returns False if either date is invalid.
    """
    diff = days_between(d1, d2)
    if diff is None:
        return False
    return abs(diff) <= window_days
