import { afterAll, describe, expect, it } from 'vitest';
import { pool } from '../src/db.js';
import { api } from './helpers.js';

afterAll(() => pool.end());

describe('query parameter validation', () => {
  it.each([
    ['/api/stations/nearest?lng=14.5', "Missing required parameter 'lat'"],
    ['/api/stations/nearest?lat=abc&lng=14.5', "Parameter 'lat' must be a number"],
    ['/api/stations/nearest?lat=12abc&lng=14.5', "Parameter 'lat' must be a number"],
    ['/api/stations/nearest?lat=91&lng=14.5', "Parameter 'lat' must be between -90 and 90"],
    ['/api/stations/nearest?lat=46&lng=181', "Parameter 'lng' must be between -180 and 180"],
    ['/api/stations/nearest?lat=46&lng=14.5&limit=0', "Parameter 'limit' must be between 1 and 50"],
    ['/api/stations/nearest?lat=46&lng=14.5&limit=2.5', "Parameter 'limit' must be an integer"],
    ['/api/stations/nearest?lat=46&lat=47&lng=14.5', "Parameter 'lat' must be a number"],
    ['/api/stations/within?lat=46&lng=14.5', "Missing required parameter 'radius_km'"],
    ['/api/stations/within?lat=46&lng=14.5&radius_km=-1', "Parameter 'radius_km' must be between"],
    ['/api/stations/within?lat=46&lng=14.5&radius_km=1000', "Parameter 'radius_km' must be between"],
    ['/api/municipalities/at?lat=46', "Missing required parameter 'lng'"],
    ['/api/stations/E403/history?pollutant=xyz', "Parameter 'pollutant' must be one of"],
    ['/api/municipalities?pollutant=so2', "Parameter 'pollutant' must be one of"],
    ['/api/stations/E403/history?hours=0', "Parameter 'hours' must be between 1 and 720"],
  ])('%s -> 400', async (url, message) => {
    const res = await api.get(url).expect(400);
    expect(res.body.error).toContain(message);
  });

  it('returns JSON 404 for unknown routes', async () => {
    const res = await api.get('/api/does-not-exist').expect(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});
