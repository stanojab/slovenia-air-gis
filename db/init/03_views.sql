-- Latest value of every pollutant at every station.
-- DISTINCT ON keeps the first row of each (station, pollutant) group, and the
-- ORDER BY makes that first row the newest one. The measurements primary key
-- (station_code, pollutant, measured_at) lets Postgres read this from the index.
CREATE VIEW latest_readings AS
SELECT DISTINCT ON (station_code, pollutant)
       station_code, pollutant, value, below_limit, measured_at
FROM measurements
ORDER BY station_code, pollutant, measured_at DESC;

-- The same, folded into one JSON object per station for the API, e.g.
-- {"pm10": {"value": 6, "below_limit": false, "measured_at": "..."}, ...}
-- Only the four pollutants shown in the app are included.
CREATE VIEW station_latest_readings AS
SELECT station_code,
       json_object_agg(
           pollutant,
           json_build_object('value', value, 'below_limit', below_limit, 'measured_at', measured_at)
       ) AS readings
FROM latest_readings
WHERE pollutant IN ('pm10', 'pm2.5', 'o3', 'no2')
GROUP BY station_code;
