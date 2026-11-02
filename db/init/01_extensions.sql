-- Runs once, when the db container starts with an empty data volume
-- (scripts in /docker-entrypoint-initdb.d are executed in alphabetical order).

CREATE EXTENSION IF NOT EXISTS postgis;
