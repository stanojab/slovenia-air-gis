"""Download and parse ARSO's hourly air-quality XML feed.

Feed documentation: https://www.arso.gov.si/zrak/kakovost%20zraka/podatki/kakovost_zraka_xml.html

The 7-day feed has one <postaja> element per station *per hour*:

    <postaja sifra="E403" wgs84_dolzina="14.51" wgs84_sirina="46.07" nadm_visina="299">
      <merilno_mesto>LJ Bežigrad</merilno_mesto>
      <datum_od>2026-11-02 14:00</datum_od>
      <datum_do>2026-11-02 15:00</datum_do>
      <pm10>6</pm10><pm2.5>3</pm2.5><o3>41</o3><no2>15</no2>
    </postaja>
"""

import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

FEED_URL = "https://www.arso.gov.si/xml/zrak/ones_zrak_urni_podatki_7dni.xml"

# Tag name in the feed -> pollutant name we store.
POLLUTANTS = {
    "pm10": "pm10",
    "pm2.5": "pm2.5",
    "o3": "o3",
    "no2": "no2",
    "so2": "so2",
    "co": "co",
    "benzen": "benzene",
    "nox": "nox",
}

# Times in the feed are local Slovenian time, not UTC.
LOCAL_TZ = ZoneInfo("Europe/Ljubljana")


@dataclass(frozen=True)
class Station:
    code: str
    name: str
    lat: float
    lng: float
    altitude_m: int | None


@dataclass(frozen=True)
class Measurement:
    station_code: str
    pollutant: str
    measured_at: datetime
    value: float
    below_limit: bool


def fetch_feed(url: str = FEED_URL, timeout: int = 30) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "slovenia-air-gis"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def parse_local_time(text: str) -> datetime:
    """'2026-11-02 15:00' (Ljubljana local time) -> timezone-aware datetime."""
    return datetime.strptime(text, "%Y-%m-%d %H:%M").replace(tzinfo=LOCAL_TZ)


def parse_value(text: str | None) -> tuple[float, bool] | None:
    """Parse a measurement value.

    Returns (value, below_limit), or None when the station sent no value.
    '<2' means "below the detection limit of 2"; we keep the 2 and flag it.
    """
    if text is None or not text.strip():
        return None
    text = text.strip()
    if text.startswith("<"):
        return float(text[1:]), True
    return float(text), False


def parse_feed(xml_bytes: bytes) -> tuple[list[Station], list[Measurement]]:
    root = ET.fromstring(xml_bytes)
    stations: dict[str, Station] = {}
    measurements: list[Measurement] = []

    for element in root.iter("postaja"):
        code = element.attrib["sifra"]
        altitude = element.attrib.get("nadm_visina")
        stations[code] = Station(
            code=code,
            name=element.findtext("merilno_mesto", "").strip(),
            lat=float(element.attrib["wgs84_sirina"]),
            lng=float(element.attrib["wgs84_dolzina"]),
            altitude_m=int(float(altitude)) if altitude else None,
        )

        # We use the end of the averaging hour as the measurement time.
        measured_at = parse_local_time(element.findtext("datum_do"))
        for tag, pollutant in POLLUTANTS.items():
            parsed = parse_value(element.findtext(tag))
            if parsed is None:
                continue
            value, below_limit = parsed
            measurements.append(Measurement(code, pollutant, measured_at, value, below_limit))

    return list(stations.values()), measurements
