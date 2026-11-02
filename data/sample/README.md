# Offline sample snapshot

**These files are a snapshot, not live data.** They let the app and the tests run
without internet access. The ingest service only uses them when started with
`INGEST_OFFLINE=1` (or `--offline`), or when the live feeds cannot be reached. In
that case it logs a warning and records `source = 'sample'` in `ingest_runs`, and
the UI shows that the data is from the snapshot.

| File | Source | Captured | License |
|---|---|---|---|
| `arso_hourly_7d.xml` | ARSO hourly air-quality feed, last 7 days, unmodified: <https://www.arso.gov.si/xml/zrak/ones_zrak_urni_podatki_7dni.xml> | 2026-11-02 15:40 CET (data 2026-10-26 to 2026-11-02) | ARSO open data, OPSI terms (CC BY 4.0, attribution) |
| `municipalities_simplified.geojson` | GURS register of spatial units, layer `SI.GURS.RPE:OB_G` (212 municipalities) | 2026-11-02 | CC BY 4.0, © GURS |

The municipality file is simplified to keep the repository small (about 0.8 MB
instead of 39 MB). It was exported from the database after a live ingest with:

```sql
COPY (
  SELECT json_build_object(
    'type', 'FeatureCollection',
    'features', json_agg(json_build_object(
      'type', 'Feature',
      'properties', json_build_object('OB_ID', id, 'OB_UIME', name, 'POV_KM2', area_km2),
      'geometry', ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.0005), 6)::json
    ) ORDER BY id)
  ) FROM municipalities
) TO STDOUT;
```

ARSO marks its real-time data as unverified and for information only.
