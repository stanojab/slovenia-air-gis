import { Router } from 'express';
import { query } from '../db.js';
import { toFeatureCollection } from '../geojson.js';
import { parsePoint } from '../validate.js';

export const municipalitiesRouter = Router();

// Simplification tolerance in degrees (~0.001° ≈ 80-110 m in Slovenia).
// The full GURS boundaries are ~39 MB of GeoJSON; simplified they are small
// enough to send to a browser, and the difference is invisible at map zoom.
const SIMPLIFY_TOLERANCE = 0.001;

// A reading counts as "current" if it is at most this many hours older than
// the newest measurement in the database. Stops a station that went offline
// days ago from colouring the map with an old value.
const MAX_READING_AGE_HOURS = 6;

// GET /api/municipalities - simplified boundaries + PM10 from the nearest station.
//
// Only ~20 of 212 municipalities contain a station, so averaging stations
// *inside* each municipality would leave most of the map empty. Instead, for
// every municipality we find the nearest station with a current PM10 value.
// CROSS JOIN LATERAL runs the inner KNN query once per municipality.
// ST_PointOnSurface gives a point guaranteed to lie inside the polygon
// (a centroid can fall outside a C-shaped municipality).
municipalitiesRouter.get('/', async (req, res) => {
  const rows = await query(
    `
    SELECT m.id, m.name, m.area_km2,
           nearest.code AS station_code,
           nearest.name AS station_name,
           nearest.distance_km,
           nearest.value AS pm10,
           nearest.below_limit AS pm10_below_limit,
           nearest.measured_at AS pm10_measured_at,
           ST_AsGeoJSON(ST_Multi(ST_SimplifyPreserveTopology(m.geom, $1)), 5)::json AS geometry
    FROM municipalities m
    LEFT JOIN LATERAL (
        SELECT s.code, s.name, r.value, r.below_limit, r.measured_at,
               ST_Distance(s.geom::geography, ST_PointOnSurface(m.geom)::geography) / 1000
                   AS distance_km
        FROM stations s
        JOIN latest_readings r ON r.station_code = s.code AND r.pollutant = 'pm10'
        WHERE r.measured_at >= (SELECT max(measured_at) FROM measurements)
                               - make_interval(hours => $2)
        ORDER BY s.geom::geography <-> ST_PointOnSurface(m.geom)::geography
        LIMIT 1
    ) nearest ON true
    ORDER BY m.name
    `,
    [SIMPLIFY_TOLERANCE, MAX_READING_AGE_HOURS],
  );
  res.json(toFeatureCollection(rows));
});

// GET /api/municipalities/at?lat=&lng= - the municipality containing a point.
// Returns a FeatureCollection with one feature, or none if the point is
// outside Slovenia. The GIST index on geom narrows the search to polygons whose
// bounding box contains the point; ST_Contains then does the exact test.
municipalitiesRouter.get('/at', async (req, res) => {
  const { lat, lng } = parsePoint(req.query);
  const rows = await query(
    `
    SELECT id, name, area_km2,
           ST_AsGeoJSON(ST_Multi(ST_SimplifyPreserveTopology(geom, $3)), 5)::json AS geometry
    FROM municipalities
    WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
    `,
    [lng, lat, SIMPLIFY_TOLERANCE],
  );
  res.json(toFeatureCollection(rows));
});
