from datetime import UTC, date, datetime, timedelta

from ranking import periods


def test_jalali_matches_known_dates_and_round_trips():
    assert periods.to_jalali(date(2024, 3, 20)) == (1403, 1, 1)
    assert periods.to_jalali(date(2026, 9, 28)) == (1405, 7, 6)
    assert periods.to_jalali(date(2021, 3, 20)) == (1399, 12, 30)
    d = date(2015, 1, 1)
    while d < date(2035, 1, 1):
        assert periods.to_gregorian(*periods.to_jalali(d)) == d
        d += timedelta(days=1)


def test_week_starts_saturday_and_month_is_jalali_in_tehran():
    # Friday 2026-10-02 22:00 UTC is already Saturday 01:30 in Tehran: a new week.
    now = datetime(2026, 10, 2, 22, 0, tzinfo=UTC)
    w = periods.week(now)
    assert w.start.date() == date(2026, 10, 3) and w.start.weekday() == 5 and (w.end - w.start).days == 7
    m = periods.month(datetime(2026, 9, 28, 12, tzinfo=UTC))
    assert m.key == "lb:month:1405-07"
    assert m.start.date() == date(2026, 9, 23) and m.end.date() == date(2026, 10, 23)  # Mehr 1405
