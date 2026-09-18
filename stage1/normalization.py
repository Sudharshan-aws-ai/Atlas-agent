"""
Normalization routines for non-numeric, qualified, comma-decimal,
and missing clinical laboratory results.
"""

import re
from dataclasses import dataclass
from typing import Any, Dict, Optional


@dataclass(frozen=True)
class NormalizedLabValue:
    """Structured representation of a laboratory finding."""
    numeric_value: Optional[float]
    qualifier: Optional[str]
    detection_limit: Optional[float]
    is_numeric: bool
    raw_value: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "numeric_value": self.numeric_value,
            "qualifier": self.qualifier,
            "detection_limit": self.detection_limit,
            "is_numeric": self.is_numeric,
            "raw_value": self.raw_value,
        }

    def __str__(self) -> str:
        if self.is_numeric and self.numeric_value is not None:
            return str(self.numeric_value)
        if self.qualifier and self.detection_limit is not None:
            return f"{self.qualifier}{self.detection_limit}"
        return self.raw_value


def parse_lab_result(raw_val: Any) -> NormalizedLabValue:
    """
    Parses a raw LBORRES value into a strict NormalizedLabValue.
    Never converts '<5' or 'ND' to 0.
    Faithfully normalizes European comma decimals like '12,4' to 12.4.
    """
    if raw_val is None:
        return NormalizedLabValue(
            numeric_value=None,
            qualifier="EMPTY",
            detection_limit=None,
            is_numeric=False,
            raw_value="",
        )

    s = str(raw_val).strip()
    if not s or s.lower() in ["nan", "none", "null", "empty"]:
        return NormalizedLabValue(
            numeric_value=None,
            qualifier="EMPTY",
            detection_limit=None,
            is_numeric=False,
            raw_value=s,
        )

    # Not Detected / Not Done
    if s.upper() in ["ND", "NOT DETECTED", "NOT DONE"]:
        return NormalizedLabValue(
            numeric_value=None,
            qualifier="ND",
            detection_limit=None,
            is_numeric=False,
            raw_value=s,
        )

    # Detection limit qualifiers like '<5', '<= 5', '>10', etc.
    match_qualifier = re.match(r"^([<>]={0,1})\s*([0-9]+(?:[.,][0-9]+)?)$", s)
    if match_qualifier:
        symbol = match_qualifier.group(1)
        num_str = match_qualifier.group(2).replace(",", ".")
        try:
            limit_val = float(num_str)
            return NormalizedLabValue(
                numeric_value=None,
                qualifier=symbol,
                detection_limit=limit_val,
                is_numeric=False,
                raw_value=s,
            )
        except ValueError:
            pass

    # Comma decimal format e.g. "12,4" or "117,9"
    candidate = s
    if "," in candidate and "." not in candidate:
        parts = candidate.split(",")
        if len(parts) == 2 and parts[0].lstrip("-+").isdigit() and parts[1].isdigit():
            candidate = f"{parts[0]}.{parts[1]}"

    # Attempt float conversion
    try:
        val = float(candidate)
        return NormalizedLabValue(
            numeric_value=val,
            qualifier="=",
            detection_limit=None,
            is_numeric=True,
            raw_value=s,
        )
    except ValueError:
        return NormalizedLabValue(
            numeric_value=None,
            qualifier=None,
            detection_limit=None,
            is_numeric=False,
            raw_value=s,
        )
