import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { api, haversineKm, PRESEREN_SQUARE } from './helpers.js';

afterAll(() => pool.end());

describe('GET /api/stations', () => {
  it('returns all stations as a GeoJSON FeatureCollection of points', async () => {
    const res = await api.get('/api/stations').expect(200);

    expect(res.body.type).toBe('FeatureCollection');
    expect(res.body.features).toHaveLength(24);
    for (const feature of res.body.features) {
      expect(feature.type).toBe('Feature');
      expect(feature.geometry.type).toBe('Point');
      const [lng, lat] = feature.geometry.coordinates;
      // Inside Slovenia's bounding box, and not swapped (lng ≈ 13-17, lat ≈ 45-47).
      expect(lng).toBeGreaterThan(13);
      expect(lng).toBeLessThan(17);
      expect(lat).toBeGreaterThan(45);
      expect(lat).toBeLessThan(47);
    }
  });

  it('includes the latest readings from the sample snapshot', async () => {
    const res = await api.get('/api/stations').expect(200);
    const bezigrad = res.body.features.find((f) => f.properties.code === 'E403');

    // Values from data/sample/arso_hourly_7d.xml, hour ending 2026-11-02 15:00 CET.
    expect(bezigrad.properties.name).toBe('LJ Bežigrad');
    expect(bezigrad.properties.readings.pm10.value).toBe(6);
    expect(bezigrad.properties.readings['pm2.5'].value).toBe(3);
    expect(bezigrad.properties.readings.o3.value).toBe(41);
    expect(bezigrad.properties.readings.no2.value).toBe(15);
    expect(new Date(bezigrad.properties.readings.pm10.measured_at).toISOString()).toBe(
      '2026-11-02T14:00:00.000Z',
    );
    // Only the four pollutants shown in the app are returned.
    expect(Object.keys(bezigrad.properties.readings).sort()).toEqual(['no2', 'o3', 'pm10', 'pm2.5']);
  });
});

describe('GET /api/stations/nearest', () => {
  it('returns the 3 Ljubljana stations, nearest first, with correct distances', async () => {
    const res = await api.get('/api/stations/nearest').query({ ...PRESEREN_SQUARE }).expect(200);
    const features = res.body.features;

    expect(features.map((f) => f.properties.code)).toEqual(['E403', 'E404', 'E405']);

    const distances = features.map((f) => f.properties.distance_km);
    expect([...distances].sort((a, b) => a - b)).toEqual(distances);

    for (const feature of features) {
      const expected = haversineKm(
        [PRESEREN_SQUARE.lng, PRESEREN_SQUARE.lat],
        feature.geometry.coordinates,
      );
      expect(feature.properties.distance_km).toBeCloseTo(expected, 1);
    }
  });

  it('respects the limit parameter', async () => {
    const res = await api
      .get('/api/stations/nearest')
      .query({ ...PRESEREN_SQUARE, limit: 10 })
      .expect(200);
    expect(res.body.features).toHaveLength(10);
  });

  it('orders by true distance, not by distance in degrees', async () => {
    // Pick the point where both orderings could disagree and compare to haversine.
    const point = { lat: 46.0, lng: 15.0 };
    const res = await api.get('/api/stations/nearest').query({ ...point, limit: 24 }).expect(200);
    const byHaversine = [...res.body.features].sort(
      (a, b) =>
        haversineKm([point.lng, point.lat], a.geometry.coordinates) -
        haversineKm([point.lng, point.lat], b.geometry.coordinates),
    );
    expect(res.body.features.map((f) => f.properties.code)).toEqual(
      byHaversine.map((f) => f.properties.code),
    );
  });
});

describe('GET /api/stations/within', () => {
  it('returns only stations inside the radius', async () => {
    const res = await api
      .get('/api/stations/within')
      .query({ ...PRESEREN_SQUARE, radius_km: 5 })
      .expect(200);

    expect(res.body.features.map((f) => f.properties.code).sort()).toEqual(['E403', 'E404', 'E405']);
    for (const feature of res.body.features) {
      expect(feature.properties.distance_km).toBeLessThanOrEqual(5);
    }
  });

  it('agrees with the distances from /nearest', async () => {
    const radius = 50;
    const [within, nearest] = await Promise.all([
      api.get('/api/stations/within').query({ ...PRESEREN_SQUARE, radius_km: radius }),
      api.get('/api/stations/nearest').query({ ...PRESEREN_SQUARE, limit: 50 }),
    ]);
    const expected = nearest.body.features
      .filter((f) => f.properties.distance_km <= radius)
      .map((f) => f.properties.code);
    expect(within.body.features.map((f) => f.properties.code)).toEqual(expected);
  });

  it('returns an empty collection when nothing is in range', async () => {
    const res = await api
      .get('/api/stations/within')
      .query({ lat: 40, lng: 10, radius_km: 10 })
      .expect(200);
    expect(res.body).toEqual({ type: 'FeatureCollection', features: [] });
  });
});

describe('GET /api/stations/:code/history', () => {
  it('returns an hourly series for each pollutant, oldest first', async () => {
    const res = await api.get('/api/stations/E403/history').query({ hours: 24 }).expect(200);

    expect(res.body.type).toBe('Feature');
    expect(res.body.geometry.type).toBe('Point');
    const { series } = res.body.properties;
    expect(Object.keys(series).sort()).toEqual(['no2', 'o3', 'pm10', 'pm2.5']);
    expect(series.pm10.length).toBeGreaterThan(20);
    expect(series.pm10.length).toBeLessThanOrEqual(24);

    const times = series.pm10.map((p) => Date.parse(p.measured_at));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(series.pm10.at(-1).value).toBe(6);
  });

  it('can filter to one pollutant', async () => {
    const res = await api.get('/api/stations/E403/history').query({ pollutant: 'pm10' }).expect(200);
    expect(Object.keys(res.body.properties.series)).toEqual(['pm10']);
  });

  it('returns 404 for an unknown station', async () => {
    await api.get('/api/stations/NOPE/history').expect(404);
  });
});
