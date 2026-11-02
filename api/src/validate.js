// Query-string validation. Every helper either returns a clean number or
// throws an HttpError, which the error handler in app.js turns into a 400.

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireNumber(query, name, { min, max }) {
  const raw = query[name];
  if (raw === undefined || raw === '') {
    throw new HttpError(400, `Missing required parameter '${name}'`);
  }
  return checkNumber(raw, name, { min, max });
}

export function optionalInteger(query, name, { min, max, fallback }) {
  const raw = query[name];
  if (raw === undefined || raw === '') return fallback;
  const value = checkNumber(raw, name, { min, max });
  if (!Number.isInteger(value)) {
    throw new HttpError(400, `Parameter '${name}' must be an integer`);
  }
  return value;
}

function checkNumber(raw, name, { min, max }) {
  // Number('12abc') is NaN, unlike parseFloat('12abc') which returns 12.
  const value = Number(raw);
  if (typeof raw !== 'string' || !Number.isFinite(value)) {
    throw new HttpError(400, `Parameter '${name}' must be a number`);
  }
  if (value < min || value > max) {
    throw new HttpError(400, `Parameter '${name}' must be between ${min} and ${max}`);
  }
  return value;
}

export function parsePoint(query) {
  return {
    lat: requireNumber(query, 'lat', { min: -90, max: 90 }),
    lng: requireNumber(query, 'lng', { min: -180, max: 180 }),
  };
}
