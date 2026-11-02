# Learning notes: the key decisions, in plain language

These notes explain *why* the project is built the way it is. Each section ends with a
short "in one sentence" answer you could give in an interview.

---

## 1. Geometry vs geography

PostGIS has two spatial types.

- **`geometry`** treats coordinates as points on a flat plane. With SRID 4326 the units
  are degrees, so `ST_Distance` between two geometries returns degrees, which is not a
  useful number. Calculations are fast, and the full set of functions is available
  (`ST_Contains`, `ST_SimplifyPreserveTopology`, ...).
- **`geography`** treats coordinates as points on the Earth's ellipsoid (WGS 84).
  Distances and areas come out in **metres**, and they are correct anywhere on Earth.
  Fewer functions are available, and calculations are slower.

The problem with degrees: one degree of latitude is always about 111 km, but one degree
of longitude shrinks towards the poles. In Slovenia (about 46° N) it is about 77 km.
"Nearest" measured in degrees therefore over-weights east–west distance and can pick the
wrong station. A test in `api/test/stations.test.js` checks the KNN order against true
distances.

**What this project does:** it stores `geometry(Point, 4326)` and casts to `::geography`
whenever it measures distance (`ST_Distance`, `ST_DWithin`, KNN `<->`). Containment
(`ST_Contains`) and simplification stay in `geometry`, where distance doesn't matter.
An alternative would be a projected metric CRS such as Slovenia's D96/TM (EPSG:3794).
ARSO even publishes those coordinates (`d96_e`, `d96_n`). That would also give correct
metres, but only inside Slovenia, and the frontend would still need 4326.

> **In one sentence:** geometry is flat math in the units of the coordinates, geography
> is round-Earth math in metres, and I use geography wherever I measure distance.

## 2. SRID 4326

An SRID (Spatial Reference ID) says what the numbers in a coordinate mean. **4326 is
WGS 84 longitude/latitude**, the system GPS uses. I chose it because:

- ARSO publishes station positions in WGS 84 (`wgs84_dolzina`, `wgs84_sirina`);
- GURS's WFS can return boundaries in 4326 (`srsName=EPSG:4326`), so I never reproject;
- GeoJSON uses WGS 84 by definition, and Leaflet expects lat/lng.

Common trap: **PostGIS and GeoJSON use (x, y) = (longitude, latitude)**, but Leaflet and
humans say (latitude, longitude). That is why the code says `ST_MakePoint($1 /* lng */,
$2 /* lat */)`, and why the tests check that station coordinates fall inside Slovenia's
lng/lat ranges, to catch swapped axes.

> **In one sentence:** 4326 is plain GPS longitude/latitude, the format my sources
> deliver and my map consumes, so data flows end to end without reprojection.

## 3. Why GIST indexes

A normal B-tree index sorts values in one dimension, which doesn't work for shapes in
2D. A **GIST index** on a geometry column builds an **R-tree**: it groups the bounding
boxes of nearby shapes into larger boxes, then those into larger boxes again.

Every spatial query then runs in two steps, and `EXPLAIN` shows both:

1. **Filter (index):** quickly find the shapes whose *bounding box* could match, for
   example `Index Cond: (geom ~ point)` for `ST_Contains`.
2. **Refine (exact):** run the exact, expensive test on only those candidates, for
   example `Filter: st_contains(geom, point)`.

For `ST_Contains` on 212 municipalities, step 1 cuts the work to the 1–3 polygons whose
box contains the click, before any of their thousands of vertices are checked.

**The project has two indexes on stations:** `GIST (geom)` and `GIST ((geom::geography))`.
Postgres only uses an index when the query's expression matches the index's expression,
so the geography distance queries need the second one.

**Honest note:** with 24 stations, Postgres would scan the whole table anyway, because
it is faster than using the index. To show the index *can* be used, I ran `EXPLAIN` with
`SET enable_seqscan = off`. The indexes are there so the same queries scale to thousands
of stations or polygons.

> **In one sentence:** a GIST index is an R-tree of bounding boxes that lets PostGIS
> discard almost everything cheaply before running the exact geometric test.

## 4. How KNN (nearest-neighbour) search works

The naive way: compute the distance to every station, sort them all, take the first 3.
That's O(n log n) per click.

The PostGIS way:

```sql
ORDER BY s.geom::geography <-> <click point>::geography
LIMIT 3
```

`<->` is the **distance operator**. When it appears in `ORDER BY` with a `LIMIT`,
Postgres does an **index-ordered scan**. It walks the R-tree, always expanding the box
closest to the query point next, and returns stations in order of distance. It stops as
soon as it has 3, so far-away parts of the tree are never touched. `EXPLAIN` shows this
as `Index Scan … Order By: (geom::geography <-> …)`.

`<->` only decides the *order*. To show the actual distance I calculate
`ST_Distance(..)/1000` separately in the SELECT list, which is exact and in km.

In `/api/municipalities` the same trick runs once per municipality inside a
`LEFT JOIN LATERAL (...)`. "Lateral" means the subquery can refer to the current outer
row (`m.geom`), like a for-each loop written in SQL.

> **In one sentence:** `ORDER BY a <-> b LIMIT k` makes PostGIS walk the spatial index
> outward from the point and stop after k results, instead of measuring everything.

## 5. Why simplify polygons

The official GURS boundaries are precise to centimetres: about 500,000 vertices, or
**39 MB** of GeoJSON. A browser would download and draw all of that just to colour a
map where one pixel covers about 100 m.

`ST_SimplifyPreserveTopology(geom, 0.001)` removes vertices that change the shape by less
than the tolerance. It uses the Douglas–Peucker idea: keep a point only if it sticks out
more than the tolerance from the line between its neighbours. 0.001° is about 80–110 m,
which you can't see at country zoom. Combined with `ST_AsGeoJSON(..., 5)`, which rounds
coordinates to 5 decimals (about 1 m), the response is **~480 KB**, or **~170 KB** after
nginx gzip.

- **Why "PreserveTopology":** plain `ST_Simplify` can make a polygon self-intersect or
  collapse to nothing. The topology-preserving version guarantees valid output.
- **`ST_Multi`:** simplification can return a one-part MultiPolygon as a plain Polygon,
  and a test caught this. `ST_Multi` keeps the GeoJSON type consistent.
- **Trade-off:** each municipality is simplified on its own, so neighbours can end up
  with slightly different borders (tiny gaps or overlaps when zoomed in). Coverage-aware
  simplification (`ST_CoverageSimplify`, PostGIS 3.6+) would avoid that.
- **The full precision stays in the database.** "Which municipality am I in"
  (`ST_Contains`) runs on the original boundaries, so it is exact.

> **In one sentence:** simplification cuts the payload by about 99% with no visible
> difference, while exact spatial questions still run on full-precision data in the
> database.

## 6. How the Docker services connect

`docker compose up` starts four services on one private network that Compose creates:

| Service | What it is | Talks to |
|---|---|---|
| `db` | `postgis/postgis` image, data in a named volume `db-data` | — |
| `ingest` | Python image; loads data, then **exits** | `db` |
| `api` | Node image running Express | `db` |
| `web` | nginx serving the built Vue files | `api` |

- **Service names are hostnames.** Compose runs a DNS server on the network, so the API
  connects to `postgresql://…@db:5432/…`, and nginx forwards to `http://api:3000`. Inside
  the network, `localhost` would mean "this container", not the host.
- **Ports.** `ports: "8080:80"` publishes a container port on your machine. Only `web`
  (8080), `api` (3000, for curl and debugging) and `db` (5432, for psql or other database tools) are published.
  Containers talk to each other directly on internal ports.
- **Startup order with healthchecks.** `depends_on` alone only waits for a container to
  *start*, not to be *ready*. So:
  - `db` has a healthcheck (`pg_isready`);
  - `ingest` waits for `condition: service_healthy`;
  - `api` waits for `ingest` with `condition: service_completed_successfully` (exit code
    0), so the API never serves an empty database;
  - `web` waits for the API's own healthcheck (`/api/health`).
- **Schema setup.** Files in `db/init/` are mounted into `/docker-entrypoint-initdb.d`.
  The Postgres image runs them **only when the data volume is empty**. That's why
  changing the schema requires `docker compose down -v`.
- **Multi-stage builds.**
  - The `web` image builds with Node and then copies only the static `dist/` files into
    nginx, so the final image has no Node or `node_modules`.
  - The `api` Dockerfile has a `test` stage (with dev dependencies) and a `production`
    stage (runtime dependencies only, running as a non-root user).
- **nginx as a reverse proxy.** The browser only talks to one origin (`:8080`), and nginx
  sends `/api/*` on to the API. That avoids CORS entirely and is the usual production
  setup.
- **Tests use their own stack.** The `test` profile starts `db-test` with an in-memory
  (`tmpfs`) data directory, loads the committed snapshot with `ingest-test`, then runs
  the Vitest suite in `api-test`. It is isolated from your real data, and identical on
  every run.

> **In one sentence:** Compose puts the containers on one network where service names
> are hostnames, and healthcheck-based `depends_on` conditions start them in the right
> order: database ready, data loaded, API healthy, then the web server.

---

## Other decisions worth being able to explain

- **Long-format measurements table** `(station, pollutant, time) → value`, instead of one
  column per pollutant. Adding a pollutant needs no schema change. The composite primary
  key makes re-running ingestion safe (`ON CONFLICT DO NOTHING`) and also serves as the
  index for "latest value" and "history" lookups.
- **"Latest reading" with `DISTINCT ON`.** `SELECT DISTINCT ON (station, pollutant) …
  ORDER BY station, pollutant, measured_at DESC` keeps the first, newest row of each
  group. It lives in a SQL **view** in `db/init/03_views.sql`, so the rule is defined
  once.
- **Time zones.** ARSO publishes local Slovenian time with no offset. Ingestion attaches
  `Europe/Ljubljana` (CET in winter, CEST in summer) and stores `timestamptz`. Postgres
  keeps UTC internally, and the frontend formats for display in Ljubljana time. A
  pytest test checks both a winter and a summer timestamp.
- **`<2` values.** "Below detection limit" is not zero and not missing. I store the limit
  with `below_limit = true` and show `<2`, rather than inventing a number.
- **Raw SQL with parameters (`$1, $2`).** The SQL is visible and reviewable, and because
  values are always sent separately from the query text, user input can't inject SQL.
  Validation still runs first, so bad input gets a clear 400 instead of a database error.
- **Nearest-station colouring.** This is an approximation and the UI says so: every
  tooltip names the station and the distance the value comes from. Stale readings (more
  than 6 h older than the newest data) are ignored, so a broken station can't colour the
  map with old values.
- **Which pollutant colours the map.** The user picks one. No single pollutant is "the"
  air quality:
  - PM10 has the best coverage (22 of 24 stations) and is Slovenia's classic winter
    problem.
  - PM2.5 is the most harmful to health. The EEA attributes most air-pollution deaths
    in Europe to it.
  - O₃ is the summer pollutant.
  - NO₂ tracks traffic.

  Each has its own EEA band limits (for example "Good" PM2.5 ends at 5 µg/m³, but
  "Good" O₃ ends at 60), so the legend changes with the selection. The API takes
  `?pollutant=` and validates it against a fixed list. The value is still passed as a
  `$3` parameter, never pasted into the SQL. O₃ and NO₂ are measured at only 11
  stations, so their nearest-station distances are larger, which is one more reason the
  tooltip shows the distance.
- **Leaflet instead of MapLibre GL.** The data is small (212 polygons, 24 points) and
  raster OSM tiles need no API key or style JSON. Leaflet's API is the simplest way to
  draw GeoJSON. MapLibre's WebGL vector rendering would be worth it for vector tiles or
  tens of thousands of features.
- **Offline sample snapshot.** Real data captured on one date, clearly labelled. It makes
  CI and the tests deterministic and lets the app run without internet. When it is used,
  ingestion logs a warning, `ingest_runs.source = 'sample'` is recorded, and the UI shows
  a badge.
