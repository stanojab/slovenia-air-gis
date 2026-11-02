"""Write parsed data into PostGIS. All SQL is plain and visible here."""

import json
from datetime import datetime

import psycopg

from .arso import Measurement, Station
from .municipalities import Municipality


def connect(database_url: str) -> psycopg.Connection:
    return psycopg.connect(database_url)


def upsert_stations(conn: psycopg.Connection, stations: list[Station]) -> None:
    # ST_MakePoint takes (x, y) = (longitude, latitude) - an easy thing to swap by mistake.
    sql = """
        INSERT INTO stations (code, name, altitude_m, geom)
        VALUES (%s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
        ON CONFLICT (code) DO UPDATE
        SET name = EXCLUDED.name,
            altitude_m = EXCLUDED.altitude_m,
            geom = EXCLUDED.geom
    """
    with conn.cursor() as cur:
        cur.executemany(sql, [(s.code, s.name, s.altitude_m, s.lng, s.lat) for s in stations])


def insert_measurements(conn: psycopg.Connection, measurements: list[Measurement]) -> int:
    """Insert measurements, skipping hours we already have. Returns rows added."""
    sql = """
        INSERT INTO measurements (station_code, pollutant, measured_at, value, below_limit)
        VALUES (%s, %s, %s, %s, %s)
        ON CONFLICT (station_code, pollutant, measured_at) DO NOTHING
    """
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM measurements")
        before = cur.fetchone()[0]
        cur.executemany(
            sql,
            [
                (m.station_code, m.pollutant, m.measured_at, m.value, m.below_limit)
                for m in measurements
            ],
        )
        cur.execute("SELECT count(*) FROM measurements")
        return cur.fetchone()[0] - before


def count_municipalities(conn: psycopg.Connection) -> int:
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM municipalities")
        return cur.fetchone()[0]


def replace_municipalities(conn: psycopg.Connection, municipalities: list[Municipality]) -> None:
    # ST_Multi turns a Polygon into a one-part MultiPolygon, so every row
    # matches the column type. ST_MakeValid repairs any self-intersections,
    # which would otherwise make ST_Contains give wrong answers.
    sql = """
        INSERT INTO municipalities (id, name, area_km2, geom)
        VALUES (
            %s, %s, %s,
            ST_Multi(ST_CollectionExtract(
                ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326)), 3))
        )
    """
    with conn.cursor() as cur:
        cur.execute("DELETE FROM municipalities")
        cur.executemany(
            sql,
            [(m.id, m.name, m.area_km2, json.dumps(m.geometry)) for m in municipalities],
        )


def log_run(
    conn: psycopg.Connection, source: str, data_until: datetime | None, rows_loaded: int
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO ingest_runs (source, data_until, rows_loaded) VALUES (%s, %s, %s)",
            (source, data_until, rows_loaded),
        )
