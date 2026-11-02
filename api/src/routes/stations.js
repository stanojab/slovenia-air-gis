import { Router } from 'express';
import { query } from '../db.js';
import { toFeature, toFeatureCollection } from '../geojson.js';
import { HttpError, optionalInteger, parsePoint, requireNumber } from '../validate.js';

export const stationsRouter = Router();

const POLLUTANTS = ['pm10', 'pm2.5', 'o3', 'no2'];

// The point the user asked about, built from parameters $1 (lng) and $2 (lat).
// ST_MakePoint takes x then y, i.e. longitude first.
const QUERY_POINT = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography';

// GET /api/stations - all stations with their latest readings.
stationsRouter.get('/', async (req, res) => {
  const rows = await query(`
    SELECT s.code, s.name, s.altitude_m,
           COALESCE(l.readings, '{}'::json) AS readings,
           ST_AsGeoJSON(s.geom)::json AS geometry
    FROM stations s
    LEFT JOIN station_latest_readings l ON l.station_code = s.code
    ORDER BY s.name
  `);
  res.json(toFeatureCollection(rows));
});

// GET /api/stations/nearest?lat=&lng=&limit= - the closest stations (KNN).
//
// `<->` is PostGIS's distance operator. Used in ORDER BY together with LIMIT,
// Postgres walks the GIST index from the nearest entry outwards and stops
// after `limit` rows, instead of measuring the distance to every station.
// We order by geography (metres on the globe), matching the stations_geog_idx
// index, so the order is correct even though degrees of longitude are shorter
// than degrees of latitude.
stationsRouter.get('/nearest', async (req, res) => {
  const { lat, lng } = parsePoint(req.query);
  const limit = optionalInteger(req.query, 'limit', { min: 1, max: 50, fallback: 3 });

  const rows = await query(
    `
    SELECT s.code, s.name,
           ST_Distance(s.geom::geography, ${QUERY_POINT}) / 1000 AS distance_km,
           COALESCE(l.readings, '{}'::json) AS readings,
           ST_AsGeoJSON(s.geom)::json AS geometry
    FROM stations s
    LEFT JOIN station_latest_readings l ON l.station_code = s.code
    ORDER BY s.geom::geography <-> ${QUERY_POINT}
    LIMIT $3
    `,
    [lng, lat, limit],
  );
  res.json(toFeatureCollection(rows));
});

// GET /api/stations/within?lat=&lng=&radius_km= - stations inside a radius.
//
// ST_DWithin on geography takes the radius in metres and can use the GIST
// index to skip stations whose bounding box is too far away.
stationsRouter.get('/within', async (req, res) => {
  const { lat, lng } = parsePoint(req.query);
  const radiusKm = requireNumber(req.query, 'radius_km', { min: 0.001, max: 500 });

  const rows = await query(
    `
    SELECT s.code, s.name,
           ST_Distance(s.geom::geography, ${QUERY_POINT}) / 1000 AS distance_km,
           COALESCE(l.readings, '{}'::json) AS readings,
           ST_AsGeoJSON(s.geom)::json AS geometry
    FROM stations s
    LEFT JOIN station_latest_readings l ON l.station_code = s.code
    WHERE ST_DWithin(s.geom::geography, ${QUERY_POINT}, $3)
    ORDER BY distance_km
    `,
    [lng, lat, radiusKm * 1000],
  );
  res.json(toFeatureCollection(rows));
});

// GET /api/stations/:code/history?pollutant=&hours= - hourly time series.
// Returns one GeoJSON Feature (the station) with the series in its properties.
stationsRouter.get('/:code/history', async (req, res) => {
  const hours = optionalInteger(req.query, 'hours', { min: 1, max: 720, fallback: 168 });
  const pollutants = req.query.pollutant ? [req.query.pollutant] : POLLUTANTS;
  if (!pollutants.every((p) => POLLUTANTS.includes(p))) {
    throw new HttpError(400, `Parameter 'pollutant' must be one of: ${POLLUTANTS.join(', ')}`);
  }

  const [station] = await query(
    `SELECT code, name, altitude_m, ST_AsGeoJSON(geom)::json AS geometry
     FROM stations WHERE code = $1`,
    [req.params.code],
  );
  if (!station) throw new HttpError(404, `Station '${req.params.code}' not found`);

  // The time window ends at the newest measurement in the database rather than
  // now(), so the offline sample snapshot still shows a full history.
  const rows = await query(
    `
    SELECT pollutant, measured_at, value, below_limit
    FROM measurements
    WHERE station_code = $1
      AND pollutant = ANY($2)
      AND measured_at > (SELECT max(measured_at) FROM measurements) - make_interval(hours => $3)
    ORDER BY pollutant, measured_at
    `,
    [station.code, pollutants, hours],
  );

  const series = Object.fromEntries(pollutants.map((p) => [p, []]));
  for (const { pollutant, measured_at, value, below_limit } of rows) {
    series[pollutant].push({ measured_at, value, below_limit });
  }
  res.json(toFeature({ ...station, hours, series }));
});
