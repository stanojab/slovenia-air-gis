// Thin wrappers around the REST API. Every function returns parsed JSON
// (GeoJSON for the spatial endpoints) or throws with the API's error message.

async function getJson(path, params = {}) {
  const url = new URL(path, window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url);
  const body = await response.json();
  if (!response.ok) {
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }
  return body;
}

export const fetchHealth = () => getJson('/api/health');
export const fetchStations = () => getJson('/api/stations');
export const fetchMunicipalities = (pollutant) => getJson('/api/municipalities', { pollutant });

export const fetchNearestStations = (lat, lng, limit = 3) =>
  getJson('/api/stations/nearest', { lat, lng, limit });

export const fetchMunicipalityAt = (lat, lng) => getJson('/api/municipalities/at', { lat, lng });

export const fetchHistory = (code, hours = 168) =>
  getJson(`/api/stations/${encodeURIComponent(code)}/history`, { hours });
