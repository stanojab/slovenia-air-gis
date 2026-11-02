// Turn database rows into GeoJSON. Each row must have a `geometry` column
// (produced in SQL with ST_AsGeoJSON(...)::json); every other column becomes
// a property of the feature.

export function toFeature({ geometry, ...properties }) {
  return { type: 'Feature', geometry, properties };
}

export function toFeatureCollection(rows) {
  return { type: 'FeatureCollection', features: rows.map(toFeature) };
}
