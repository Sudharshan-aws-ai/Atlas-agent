"""
Unit tests for date parsing and date window logic.
"""

from datetime import date
from stage1.dates import days_between, parse_date, within_window_days


def test_iso_date_parsing():
    res = parse_date("2026-03-30")
    assert res.is_valid is True
    assert res.date_val == date(2026, 3, 30)
    assert res.iso == "2026-03-30"


def test_cdisc_alphabetic_date_parsing():
    res = parse_date("03-FEB-2026")
    assert res.is_valid is True
    assert res.date_val == date(2026, 2, 3)
    assert res.iso == "2026-02-03"


def test_case_insensitive_month_parsing():
    res = parse_date("15-jan-2026")
    assert res.is_valid is True
    assert res.date_val == date(2026, 1, 15)


def test_slash_date_parsing():
    res = parse_date("2026/05/20")
    assert res.is_valid is True
    assert res.date_val == date(2026, 5, 20)


def test_invalid_date_never_crashes():
    res = parse_date("NOT_A_DATE")
    assert res.is_valid is False
    assert res.date_val is None
    assert res.raw == "NOT_A_DATE"
    assert res.error is not None


def test_empty_date_handling():
    res = parse_date(None)
    assert res.is_valid is False
    assert res.date_val is None

    res_empty = parse_date("")
    assert res_empty.is_valid is False


def test_date_window_calculations():
    d1 = "2026-03-30"
    d2 = "2026-04-06"
    assert days_between(d2, d1) == 7
    assert within_window_days(d1, d2, window_days=7) is True
    assert within_window_days(d1, d2, window_days=6) is False


def test_date_window_with_invalid_dates():
    assert days_between("INVALID", "2026-03-30") is None
    assert within_window_days("INVALID", "2026-03-30", window_days=7) is False
