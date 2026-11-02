"""Entry point: python -m ingest.main [--offline] [--refresh-boundaries]

Loads the last 7 days of hourly ARSO data and, if the table is empty,
the GURS municipality boundaries. Safe to run repeatedly: existing hours
are skipped. If the live feeds are unreachable, it falls back to the
committed sample snapshot in data/sample and records that in ingest_runs.
"""

import argparse
import logging
import os
import sys
from pathlib import Path

from . import arso, db, municipalities

log = logging.getLogger("ingest")

SAMPLE_DIR = Path(os.environ.get("SAMPLE_DIR", "/data/sample"))
SAMPLE_ARSO = SAMPLE_DIR / "arso_hourly_7d.xml"
SAMPLE_MUNICIPALITIES = SAMPLE_DIR / "municipalities_simplified.geojson"


def load_arso_xml(offline: bool) -> tuple[bytes, str]:
    """Return (xml, source) where source is 'live' or 'sample'."""
    if not offline:
        try:
            return arso.fetch_feed(), "live"
        except OSError as error:
            log.warning("ARSO feed unreachable (%s) - USING OFFLINE SAMPLE", error)
    return SAMPLE_ARSO.read_bytes(), "sample"


def load_municipality_geojson(offline: bool) -> bytes:
    if not offline:
        try:
            return municipalities.fetch_geojson()
        except OSError as error:
            log.warning("GURS WFS unreachable (%s) - USING OFFLINE SAMPLE", error)
    return SAMPLE_MUNICIPALITIES.read_bytes()


def run(database_url: str, offline: bool, refresh_boundaries: bool) -> None:
    with db.connect(database_url) as conn:
        if refresh_boundaries or db.count_municipalities(conn) == 0:
            log.info("Loading municipality boundaries...")
            items = municipalities.parse_geojson(load_municipality_geojson(offline))
            db.replace_municipalities(conn, items)
            log.info("Loaded %d municipalities", len(items))
        else:
            log.info("Municipalities already loaded, skipping (use --refresh-boundaries)")

        xml, source = load_arso_xml(offline)
        stations, measurements = arso.parse_feed(xml)
        db.upsert_stations(conn, stations)
        added = db.insert_measurements(conn, measurements)
        data_until = max((m.measured_at for m in measurements), default=None)
        db.log_run(conn, source, data_until, added)
        log.info(
            "Source=%s: %d stations, %d new measurements (data until %s)",
            source,
            len(stations),
            added,
            data_until,
        )
        # Leaving the `with` block commits the transaction: all or nothing.


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Load ARSO + GURS data into PostGIS")
    parser.add_argument(
        "--offline",
        action="store_true",
        help="use the committed sample snapshot instead of live feeds",
    )
    parser.add_argument(
        "--refresh-boundaries",
        action="store_true",
        help="re-download municipality boundaries even if present",
    )
    args = parser.parse_args()

    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        sys.exit("DATABASE_URL is not set")
    offline = args.offline or os.environ.get("INGEST_OFFLINE") == "1"
    run(database_url, offline, args.refresh_boundaries)


if __name__ == "__main__":
    main()
