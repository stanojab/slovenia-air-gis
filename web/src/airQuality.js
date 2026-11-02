// PM10 bands of the European Air Quality Index (EEA, revised 2025), which
// is defined on hourly concentrations - the same resolution as ARSO's feed.
// Source: https://airindex.eea.europa.eu/AQI/index.html
export const PM10_BANDS = [
  { max: 15, label: 'Good', color: '#50f0e6' },
  { max: 45, label: 'Fair', color: '#50ccaa' },
  { max: 120, label: 'Moderate', color: '#f0e641' },
  { max: 195, label: 'Poor', color: '#ff5050' },
  { max: 270, label: 'Very poor', color: '#960032' },
  { max: Infinity, label: 'Extremely poor', color: '#7d2181' },
];

export const NO_DATA_COLOR = '#c8c8c8';

export function pm10Band(value) {
  if (value === null || value === undefined) return null;
  return PM10_BANDS.find((band) => value <= band.max);
}

export function pm10Color(value) {
  return pm10Band(value)?.color ?? NO_DATA_COLOR;
}

export const POLLUTANT_LABELS = {
  pm10: 'PM10',
  'pm2.5': 'PM2.5',
  o3: 'O₃',
  no2: 'NO₂',
};

// "<2" readings are below the detection limit; show them that way.
export function formatValue(value, belowLimit) {
  if (value === null || value === undefined) return '–';
  return belowLimit ? `<${value}` : String(value);
}

// ARSO times are Slovenian local time; show them in that zone for every visitor.
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Ljubljana',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTime(isoString) {
  return isoString ? timeFormat.format(new Date(isoString)) : '–';
}
