// Bands of the European Air Quality Index (EEA, revised 2025). The index is
// defined on hourly concentrations - the same resolution as ARSO's feed.
// Each list holds the upper limit (µg/m³) of Good, Fair, Moderate, Poor and
// Very poor; anything above the last limit is Extremely poor.
// Source: https://airindex.eea.europa.eu/AQI/index.html
const BAND_LIMITS = {
  pm10: [15, 45, 120, 195, 270],
  'pm2.5': [5, 15, 50, 90, 140],
  o3: [60, 100, 120, 160, 180],
  no2: [10, 25, 60, 100, 150],
};

const BAND_STYLES = [
  { label: 'Good', color: '#50f0e6' },
  { label: 'Fair', color: '#50ccaa' },
  { label: 'Moderate', color: '#f0e641' },
  { label: 'Poor', color: '#ff5050' },
  { label: 'Very poor', color: '#960032' },
  { label: 'Extremely poor', color: '#7d2181' },
];

export const NO_DATA_COLOR = '#c8c8c8';

export const POLLUTANT_LABELS = {
  pm10: 'PM10',
  'pm2.5': 'PM2.5',
  o3: 'O₃',
  no2: 'NO₂',
};

// [{ label, color, min, max }, ...] for one pollutant, e.g. for the legend.
export function bandsFor(pollutant) {
  const limits = BAND_LIMITS[pollutant];
  return BAND_STYLES.map((style, i) => ({
    ...style,
    min: i === 0 ? 0 : limits[i - 1] + 1,
    max: limits[i] ?? Infinity,
  }));
}

export function bandFor(pollutant, value) {
  if (value === null || value === undefined) return null;
  return bandsFor(pollutant).find((band) => value <= band.max);
}

export function colorFor(pollutant, value) {
  return bandFor(pollutant, value)?.color ?? NO_DATA_COLOR;
}

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
