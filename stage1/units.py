"""
Unit conversion, laboratory reference ranges, and analyte normalization.
Supports site-specific laboratories (e.g. S07 vs CENTRAL) and mathematically
grounded unit conversion (1 ukat/L = 60 U/L for transaminases).
"""

import csv
import os
from dataclasses import dataclass
from typing import Any, Dict, Optional, Tuple


@dataclass(frozen=True)
class ReferenceRange:
    testcd: str
    unit: str
    low: float
    high: float  # Upper Limit of Normal (ULN)
    lab: str


@dataclass(frozen=True)
class UnitConversionResult:
    is_convertible: bool
    original_val: float
    original_unit: str
    converted_val: Optional[float]
    target_unit: str
    conversion_factor: Optional[float]
    notes: str


# Canonical conversions documented in Protocol & Lab Manual
# 1 ukat/L = 60 U/L for enzymatic transaminases (ALT, AST)
ENZYME_UKAT_TO_UL = 60.0


def normalize_unit_str(u: Optional[str]) -> str:
    """Normalizes variations of unit strings (e.g. µkat/L, ukat/L)."""
    if not u:
        return ""
    u_clean = str(u).strip()
    # Replace greek micro character \u03bc or \u00b5 with 'u'
    u_clean = u_clean.replace("µ", "u").replace("μ", "u")
    return u_clean


class UnitManager:
    """
    Manages laboratory reference ranges and deterministic unit conversions.
    Enforces that values are never compared across incongruent units.
    """

    def __init__(self, ref_ranges_path: Optional[str] = None):
        self.ranges: Dict[Tuple[str, str], ReferenceRange] = {}  # (testcd, lab) -> Range
        self.ranges_by_unit: Dict[Tuple[str, str], ReferenceRange] = {}  # (testcd, unit) -> Range

        if ref_ranges_path and os.path.exists(ref_ranges_path):
            self.load_reference_ranges(ref_ranges_path)
        else:
            self._load_defaults()

    def load_reference_ranges(self, path: str) -> None:
        """Loads reference ranges from reference_ranges.csv."""
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                testcd = row["LBTESTCD"].strip().upper()
                unit = normalize_unit_str(row["UNIT"])
                low = float(row["LOW"])
                high = float(row["HIGH"])
                lab = row["LAB"].strip().upper()

                ref = ReferenceRange(
                    testcd=testcd,
                    unit=unit,
                    low=low,
                    high=high,
                    lab=lab,
                )
                self.ranges[(testcd, lab)] = ref
                self.ranges_by_unit[(testcd, unit)] = ref

    def _load_defaults(self) -> None:
        """Built-in reference ranges from STUDY-042 specification if file missing."""
        defaults = [
            ("ALT", "U/L", 7.0, 56.0, "CENTRAL"),
            ("AST", "U/L", 10.0, 40.0, "CENTRAL"),
            ("BILI", "mg/dL", 0.1, 1.2, "CENTRAL"),
            ("HBA1C", "%", 4.0, 5.6, "CENTRAL"),
            ("GLUC", "mg/dL", 70.0, 99.0, "CENTRAL"),
            ("CREAT", "mg/dL", 0.6, 1.2, "CENTRAL"),
            ("ALT", "ukat/L", 0.12, 0.93, "S07"),
            ("AST", "ukat/L", 0.17, 0.67, "S07"),
        ]
        for testcd, unit, low, high, lab in defaults:
            ref = ReferenceRange(testcd=testcd, unit=unit, low=low, high=high, lab=lab)
            self.ranges[(testcd, lab)] = ref
            self.ranges_by_unit[(testcd, unit)] = ref

    def convert_enzyme_unit(
        self,
        testcd: str,
        val: float,
        from_unit: str,
        to_unit: str,
    ) -> UnitConversionResult:
        """
        Converts transaminase units (ALT/AST) between ukat/L and U/L.
        Returns non-convertible if units are incompatible or analyte is non-enzymatic.
        """
        u_from = normalize_unit_str(from_unit)
        u_to = normalize_unit_str(to_unit)

        if u_from == u_to:
            return UnitConversionResult(
                is_convertible=True,
                original_val=val,
                original_unit=from_unit,
                converted_val=val,
                target_unit=to_unit,
                conversion_factor=1.0,
                notes="Identical units, no conversion necessary",
            )

        test_upper = testcd.upper()
        if test_upper in ["ALT", "AST"]:
            if u_from == "ukat/L" and u_to == "U/L":
                converted = round(val * ENZYME_UKAT_TO_UL, 4)
                return UnitConversionResult(
                    is_convertible=True,
                    original_val=val,
                    original_unit=from_unit,
                    converted_val=converted,
                    target_unit=to_unit,
                    conversion_factor=ENZYME_UKAT_TO_UL,
                    notes=f"1 ukat/L = 60 U/L applied: {val} * 60 = {converted} U/L",
                )
            elif u_from == "U/L" and u_to == "ukat/L":
                converted = round(val / ENZYME_UKAT_TO_UL, 4)
                return UnitConversionResult(
                    is_convertible=True,
                    original_val=val,
                    original_unit=from_unit,
                    converted_val=converted,
                    target_unit=to_unit,
                    conversion_factor=1.0 / ENZYME_UKAT_TO_UL,
                    notes=f"1 U/L = 1/60 ukat/L applied: {val} / 60 = {converted} ukat/L",
                )

        return UnitConversionResult(
            is_convertible=False,
            original_val=val,
            original_unit=from_unit,
            converted_val=None,
            target_unit=to_unit,
            conversion_factor=None,
            notes=f"Unsupported unit conversion between '{from_unit}' and '{to_unit}' for {testcd}",
        )

    def get_range(
        self,
        testcd: str,
        lab: Optional[str] = None,
        unit: Optional[str] = None,
        site_id: Optional[str] = None,
    ) -> Optional[ReferenceRange]:
        """
        Retrieves matching reference range, respecting site-specific labs.
        """
        test_upper = testcd.upper()
        # 1. Direct match by lab
        if lab:
            lab_upper = lab.upper()
            if (test_upper, lab_upper) in self.ranges:
                return self.ranges[(test_upper, lab_upper)]

        # 2. Match by site
        if site_id:
            site_upper = site_id.upper()
            if (test_upper, site_upper) in self.ranges:
                return self.ranges[(test_upper, site_upper)]

        # 3. Match by unit
        if unit:
            u_clean = normalize_unit_str(unit)
            if (test_upper, u_clean) in self.ranges_by_unit:
                return self.ranges_by_unit[(test_upper, u_clean)]

        # 4. Fallback to CENTRAL
        return self.ranges.get((test_upper, "CENTRAL"))

    def compute_uln_multiple(
        self,
        testcd: str,
        numeric_val: float,
        unit: str,
        site_id: Optional[str] = None,
    ) -> Tuple[Optional[float], Optional[ReferenceRange], str]:
        """
        Computes value / ULN multiple accurately respecting site-specific ranges and units.
        Returns (multiple, reference_range_used, rationale).
        """
        ref = self.get_range(testcd=testcd, unit=unit, site_id=site_id)
        if not ref or ref.high <= 0:
            return None, None, f"No valid reference range for {testcd}"

        u_reported = normalize_unit_str(unit)
        u_ref = normalize_unit_str(ref.unit)

        if u_reported == u_ref:
            ratio = numeric_val / ref.high
            rationale = (
                f"{numeric_val} {ref.unit} evaluated against {ref.lab} ULN ({ref.high} {ref.unit}): "
                f"ratio = {ratio:.2f}x ULN"
            )
            return ratio, ref, rationale

        # Try converting reported value to reference unit
        conv = self.convert_enzyme_unit(testcd, numeric_val, u_reported, u_ref)
        if conv.is_convertible and conv.converted_val is not None:
            ratio = conv.converted_val / ref.high
            rationale = (
                f"{numeric_val} {unit} converted to {conv.converted_val:.2f} {ref.unit} "
                f"({conv.notes}) vs {ref.lab} ULN ({ref.high} {ref.unit}): ratio = {ratio:.2f}x ULN"
            )
            return ratio, ref, rationale

        return None, ref, f"Incompatible units '{unit}' vs reference '{ref.unit}' without conversion"
