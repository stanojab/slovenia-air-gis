import request from 'supertest';
import { createApp } from '../src/app.js';

export const api = request(createApp());

// Great-circle distance on a sphere, used as an independent check of the
// distances PostGIS computes (PostGIS uses the WGS 84 spheroid, so the two
// agree to within a few tenths of a percent).
export function haversineKm([lng1, lat1], [lng2, lat2]) {
  const rad = (deg) => (deg * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * 6371.0088 * Math.asin(Math.sqrt(a));
}

// Fixed test locations (the test database holds the committed sample snapshot).
export const PRESEREN_SQUARE = { lat: 46.0514, lng: 14.506 }; // central Ljubljana
export const BLED = { lat: 46.3683, lng: 14.1146 };
export const VENICE = { lat: 45.4408, lng: 12.3155 }; // outside Slovenia
