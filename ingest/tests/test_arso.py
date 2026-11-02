from datetime import UTC, datetime

import pytest

from ingest.arso import parse_feed, parse_local_time, parse_value

# Shape copied from the real ARSO feed (two hours of one station, one of another).
SAMPLE_XML = """<?xml version="1.0" encoding="UTF-8"?>
<arsopodatki verzija="1.5">
<vir>Agencija RS za okolje</vir>
<postaja sifra="E403" wgs84_dolzina="14.5127203" wgs84_sirina="46.0655449" nadm_visina="299">
  <merilno_mesto>LJ Bežigrad</merilno_mesto>
  <datum_od>2026-11-02 14:00</datum_od><datum_do>2026-11-02 15:00</datum_do>
  <o3>41</o3><no2>15</no2><pm10>6</pm10><pm2.5>3</pm2.5><benzen>0.8</benzen>
</postaja>
<postaja sifra="E403" wgs84_dolzina="14.5127203" wgs84_sirina="46.0655449" nadm_visina="299">
  <merilno_mesto>LJ Bežigrad</merilno_mesto>
  <datum_od>2026-11-02 13:00</datum_od><datum_do>2026-11-02 14:00</datum_do>
  <o3></o3><pm10>&lt;2</pm10>
</postaja>
<postaja sifra="E805" wgs84_dolzina="14.6477" wgs84_sirina="45.9565">
  <merilno_mesto>Brezje pri Grosupljem</merilno_mesto>
  <datum_od>2026-11-02 14:00</datum_od><datum_do>2026-11-02 15:00</datum_do>
  <pm10>14</pm10>
</postaja>
</arsopodatki>""".encode()


def test_stations_are_deduplicated_and_coordinates_parsed():
    stations, _ = parse_feed(SAMPLE_XML)
    by_code = {s.code: s for s in stations}

    assert set(by_code) == {"E403", "E805"}
    assert by_code["E403"].name == "LJ Bežigrad"
    assert by_code["E403"].lat == pytest.approx(46.0655449)
    assert by_code["E403"].lng == pytest.approx(14.5127203)
    assert by_code["E403"].altitude_m == 299
    assert by_code["E805"].altitude_m is None  # attribute missing in the feed


def test_measurements_skip_empty_values_and_flag_below_limit():
    _, measurements = parse_feed(SAMPLE_XML)
    e403 = [m for m in measurements if m.station_code == "E403"]

    # 5 values in the first hour, 1 in the second (empty <o3> is skipped)
    assert len(e403) == 6
    below = [m for m in e403 if m.below_limit]
    assert len(below) == 1
    assert below[0].pollutant == "pm10" and below[0].value == 2.0
    assert {m.pollutant for m in e403} >= {"benzene", "pm2.5"}  # tag names mapped


def test_local_time_is_converted_to_utc_correctly():
    # November = CET (UTC+1), July = CEST (UTC+2)
    assert parse_local_time("2026-11-02 15:00").astimezone(UTC) == datetime(
        2026, 11, 2, 14, 0, tzinfo=UTC
    )
    assert parse_local_time("2026-07-01 15:00").astimezone(UTC) == datetime(
        2026, 7, 1, 13, 0, tzinfo=UTC
    )


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("12", (12.0, False)),
        ("0.8", (0.8, False)),
        ("<1", (1.0, True)),
        ("", None),
        ("  ", None),
        (None, None),
    ],
)
def test_parse_value(text, expected):
    assert parse_value(text) == expected
