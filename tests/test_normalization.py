"""
Unit tests for non-numeric, qualified, and comma-decimal lab value normalization.
"""

from stage1.normalization import parse_lab_result


def test_less_than_five_not_zero():
    res = parse_lab_result("<5")
    assert res.is_numeric is False
    assert res.numeric_value is None
    assert res.qualifier == "<"
    assert res.detection_limit == 5.0
    assert res.raw_value == "<5"


def test_not_detected_not_zero():
    res = parse_lab_result("ND")
    assert res.is_numeric is False
    assert res.numeric_value is None
    assert res.qualifier == "ND"
    assert res.raw_value == "ND"


def test_comma_decimal_parsing():
    res = parse_lab_result("12,4")
    assert res.is_numeric is True
    assert res.numeric_value == 12.4
    assert res.qualifier == "="

    res_large = parse_lab_result("117,9")
    assert res_large.is_numeric is True
    assert res_large.numeric_value == 117.9


def test_empty_and_null_results():
    res_none = parse_lab_result(None)
    assert res_none.is_numeric is False
    assert res_none.numeric_value is None
    assert res_none.qualifier == "EMPTY"

    res_blank = parse_lab_result("")
    assert res_blank.is_numeric is False
    assert res_blank.numeric_value is None


def test_standard_floats():
    res = parse_lab_result("40.4")
    assert res.is_numeric is True
    assert res.numeric_value == 40.4
    assert res.qualifier == "="
