import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { api, BLED, PRESEREN_SQUARE, VENICE } from './helpers.js';

afterAll(() => pool.end());

describe('GET /api/municipalities/at', () => {
  it('finds the municipality that contains a point', async () => {
    const res = await api.get('/api/municipalities/at').query(PRESEREN_SQUARE).expect(200);
    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features).toHaveLength(1);
    expect(res.body.features[0].properties.name).toBe('Ljubljana');
    expect(res.body.features[0].geometry.type).toBe('MultiPolygon');
  });

  it('works for a small municipality', async () => {
    const res = await api.get('/api/municipalities/at').query(BLED).expect(200);
    expect(res.body.features.map((f) => f.properties.name)).toEqual(['Bled']);
  });

  it('returns an empty collection for a point outside Slovenia', async () => {
    const res = await api.get('/api/municipalities/at').query(VENICE).expect(200);
    expect(res.body).toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('GET /api/municipalities', () => {
  it('returns all 212 municipalities as simplified multipolygons', async () => {
    const res = await api.get('/api/municipalities').expect(200);

    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features).toHaveLength(212);
    expect(res.body.features.every((f) => f.geometry.type === 'MultiPolygon')).toBe(true);
    // Simplification keeps the payload small enough for a browser.
    expect(JSON.stringify(res.body).length).toBeLessThan(1_000_000);
  });

  it('attaches the PM10 value of the nearest station to each municipality', async () => {
    const res = await api.get('/api/municipalities').expect(200);
    const byName = Object.fromEntries(res.body.features.map((f) => [f.properties.name, f]));

    for (const feature of res.body.features) {
      expect(typeof feature.properties.pm10).toBe('number');
      expect(feature.properties.distance_km).toBeGreaterThanOrEqual(0);
    }
    expect(byName.Ljubljana.properties.station_code).toMatch(/^E40[345]$/);
    expect(byName.Piran.properties.station_name).toBe('Koper');
    expect(byName.Maribor.properties.station_name).toMatch(/^MB /);
  });
});
