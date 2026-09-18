"""
Unit tests for unit conversion and site-specific reference ranges.
"""

from stage1.units import UnitManager


def test_transaminase_ukat_to_ul_conversion():
    um = UnitManager("hackathon-data/data/reference_ranges.csv")
    conv = um.convert_enzyme_unit("ALT", 3.995, "ukat/L", "U/L")
    assert conv.is_convertible is True
    # 3.995 * 60 = 239.7
    assert round(conv.converted_val, 1) == 239.7


def test_transaminase_ul_to_ukat_conversion():
    um = UnitManager("hackathon-data/data/reference_ranges.csv")
    conv = um.convert_enzyme_unit("AST", 60.0, "U/L", "ukat/L")
    assert conv.is_convertible is True
    assert round(conv.converted_val, 2) == 1.00


def test_unknown_unit_conversion_rejected():
    um = UnitManager("hackathon-data/data/reference_ranges.csv")
    conv = um.convert_enzyme_unit("BILI", 1.2, "mg/dL", "mmol/L")
    assert conv.is_convertible is False
    assert conv.converted_val is None


def test_site_specific_reference_ranges():
    um = UnitManager("hackathon-data/data/reference_ranges.csv")

    # Central ALT: 7 - 56 U/L
    ref_central = um.get_range("ALT", lab="CENTRAL")
    assert ref_central is not None
    assert ref_central.high == 56.0
    assert ref_central.unit == "U/L"

    # Site S07 ALT: 0.12 - 0.93 ukat/L
    ref_s07 = um.get_range("ALT", site_id="S07")
    assert ref_s07 is not None
    assert ref_s07.high == 0.93
    assert ref_s07.unit == "ukat/L"


def test_uln_multiple_calculation_for_s07():
    um = UnitManager("hackathon-data/data/reference_ranges.csv")
    # 3.995 ukat/L at site S07 (ULN 0.93 ukat/L)
    ratio, ref, rationale = um.compute_uln_multiple("ALT", 3.995, "ukat/L", site_id="S07")
    assert ratio is not None
    assert round(ratio, 2) == 4.30
    assert ratio > 3.0
