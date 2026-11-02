-- Schema for Slovenia Air Quality GIS.
-- All geometries use SRID 4326 (WGS 84 longitude/latitude), the same CRS that
-- ARSO publishes station coordinates in and that Leaflet/GeoJSON expect.

-- Air-quality monitoring stations (source: ARSO XML feed).
CREATE TABLE stations (
    code        text PRIMARY KEY,               -- ARSO station code, e.g. 'E403'
    name        text NOT NULL,                  -- e.g. 'LJ Bežigrad'
    altitude_m  integer,                        -- not reported for every station
    geom        geometry(Point, 4326) NOT NULL
);

-- Spatial index for geometry operations (bounding-box filters, ST_Contains joins).
CREATE INDEX stations_geom_idx ON stations USING GIST (geom);

-- Second spatial index on the geography cast. Queries that measure real-world
-- distances (KNN in km, ST_DWithin with a radius in metres) cast to geography;
-- the planner can only use an index whose expression matches the query exactly.
CREATE INDEX stations_geog_idx ON stations USING GIST ((geom::geography));


-- One row per station, pollutant and hour ("long" format). New pollutants
-- need no schema change, and re-running ingestion cannot create duplicates.
CREATE TABLE measurements (
    station_code  text NOT NULL REFERENCES stations (code) ON DELETE CASCADE,
    pollutant     text NOT NULL,                -- 'pm10', 'pm2.5', 'o3', 'no2', ...
    measured_at   timestamptz NOT NULL,         -- end of the averaging hour
    value         double precision NOT NULL,    -- µg/m³ (CO in mg/m³)
    -- ARSO reports some values as "<2" (below the detection limit).
    -- We store the limit itself as value and set this flag, instead of guessing.
    below_limit   boolean NOT NULL DEFAULT false,
    PRIMARY KEY (station_code, pollutant, measured_at)
);

-- The primary key already serves "latest value per station and pollutant"
-- and "history of one station" lookups, so no extra index is needed.


-- Municipality boundaries (source: GURS register of spatial units, layer OB).
CREATE TABLE municipalities (
    id        integer PRIMARY KEY,              -- GURS municipality id (OB_ID)
    name      text NOT NULL,
    area_km2  double precision,
    geom      geometry(MultiPolygon, 4326) NOT NULL
);

CREATE INDEX municipalities_geom_idx ON municipalities USING GIST (geom);


-- Each ingestion run is logged, so the UI can say where the data came from
-- (live ARSO feed or the committed offline sample) and how fresh it is.
CREATE TABLE ingest_runs (
    id            serial PRIMARY KEY,
    source        text NOT NULL CHECK (source IN ('live', 'sample')),
    data_until    timestamptz,                  -- newest measurement in this run
    rows_loaded   integer NOT NULL,
    finished_at   timestamptz NOT NULL DEFAULT now()
);
