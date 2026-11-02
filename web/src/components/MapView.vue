<script setup>
import L from 'leaflet';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatValue, PM10_BANDS, NO_DATA_COLOR, pm10Color } from '../airQuality.js';

const props = defineProps({
  stations: { type: Object, default: null }, // GeoJSON FeatureCollection
  municipalities: { type: Object, default: null }, // GeoJSON FeatureCollection
  clickResult: { type: Object, default: null },
  selectedCode: { type: String, default: null },
});
const emit = defineEmits(['map-click', 'station-click']);

const container = ref(null);

// Leaflet objects are kept outside Vue's reactivity on purpose: Leaflet
// manages its own state, and wrapping it in reactive proxies breaks it.
let map = null;
let municipalityLayer = null;
let stationLayer = null;
let clickLayer = null;

const SLOVENIA_BOUNDS = [
  [45.42, 13.37],
  [46.88, 16.61],
];

onMounted(() => {
  map = L.map(container.value, { zoomSnap: 0.25 }).fitBounds(SLOVENIA_BOUNDS);

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  map.attributionControl.addAttribution(
    'Air quality: <a href="https://www.arso.gov.si">ARSO</a> · Boundaries: © GURS (CC BY 4.0)',
  );

  // Fires for clicks on the base map and on municipality polygons
  // (station markers stop the event, see drawStations).
  map.on('click', (event) => emit('map-click', event.latlng));

  drawMunicipalities();
  drawStations();
  drawClickResult();
});

onBeforeUnmount(() => map?.remove());

function drawMunicipalities() {
  municipalityLayer?.remove();
  if (!map || !props.municipalities) return;

  municipalityLayer = L.geoJSON(props.municipalities, {
    style: (feature) => ({
      fillColor: pm10Color(feature.properties.pm10),
      fillOpacity: 0.55,
      color: '#ffffff',
      weight: 0.8,
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const value =
        p.pm10 === null
          ? 'no current PM10 data'
          : `PM10 ${formatValue(p.pm10, p.pm10_below_limit)} µg/m³ at ${p.station_name}
             (${p.distance_km.toFixed(1)} km)`;
      layer.bindTooltip(`<strong>${p.name}</strong><br>${value}`, { sticky: true });
    },
  }).addTo(map);
  municipalityLayer.bringToBack();
}

function drawStations() {
  stationLayer?.remove();
  if (!map || !props.stations) return;

  stationLayer = L.geoJSON(props.stations, {
    pointToLayer: (feature, latlng) => {
      const selected = feature.properties.code === props.selectedCode;
      return L.circleMarker(latlng, {
        radius: selected ? 10 : 7,
        fillColor: pm10Color(feature.properties.readings.pm10?.value),
        fillOpacity: 1,
        color: selected ? '#2563eb' : '#1f2933',
        weight: selected ? 3 : 1.5,
        // Don't also trigger the map's click handler.
        bubblingMouseEvents: false,
      });
    },
    onEachFeature: (feature, layer) => {
      layer.bindTooltip(feature.properties.name);
      layer.on('click', () => emit('station-click', feature.properties.code));
    },
  }).addTo(map);
}

// Clicked point, lines to the nearest stations and the municipality outline.
function drawClickResult() {
  clickLayer?.remove();
  if (!map || !props.clickResult) return;

  const { point, municipality, nearest } = props.clickResult;
  clickLayer = L.layerGroup().addTo(map);

  if (municipality) {
    L.geoJSON(municipality, {
      style: { color: '#2563eb', weight: 3, fill: false },
      interactive: false,
    }).addTo(clickLayer);
  }

  for (const station of nearest) {
    const [lng, lat] = station.geometry.coordinates;
    L.polyline(
      [
        [point.lat, point.lng],
        [lat, lng],
      ],
      { color: '#2563eb', weight: 2, dashArray: '6 4', interactive: false },
    )
      .bindTooltip(`${station.properties.distance_km.toFixed(1)} km`, {
        permanent: true,
        direction: 'center',
        className: 'distance-label',
      })
      .addTo(clickLayer);
  }

  L.circleMarker([point.lat, point.lng], {
    radius: 5,
    color: '#2563eb',
    fillColor: '#ffffff',
    fillOpacity: 1,
    weight: 2,
    interactive: false,
  }).addTo(clickLayer);
}

watch(() => props.municipalities, drawMunicipalities);
watch(() => [props.stations, props.selectedCode], drawStations);
watch(() => props.clickResult, drawClickResult);
</script>

<template>
  <div class="map-wrapper">
    <div
      ref="container"
      class="map-container"
    />
    <div class="legend">
      <strong>PM10 µg/m³</strong>
      <span class="muted">(EEA index, hourly)</span>
      <div
        v-for="(band, i) in PM10_BANDS"
        :key="band.label"
        class="legend-row"
      >
        <span
          class="swatch"
          :style="{ background: band.color }"
        />
        {{ band.label }}
        <span class="muted">
          {{ i === 0 ? 0 : PM10_BANDS[i - 1].max + 1 }}{{ band.max === Infinity ? '+' : `–${band.max}` }}
        </span>
      </div>
      <div class="legend-row">
        <span
          class="swatch"
          :style="{ background: NO_DATA_COLOR }"
        />
        No data
      </div>
    </div>
  </div>
</template>

<style scoped>
.map-wrapper {
  position: relative;
}

.map-container {
  position: absolute;
  inset: 0;
}

.legend {
  position: absolute;
  bottom: 1.5rem;
  left: 0.6rem;
  z-index: 1000; /* above Leaflet panes */
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  font-size: 0.8rem;
  line-height: 1.5;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 2px;
}

.muted {
  color: var(--muted);
  margin-left: 0.25rem;
}

@media (max-width: 800px) {
  .legend {
    bottom: 1.2rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.7rem;
    line-height: 1.3;
  }

  .legend .muted {
    display: none;
  }
}

/* Leaflet creates tooltips outside this component, so the style must not be scoped. */
:global(.distance-label) {
  padding: 1px 5px;
  font-size: 0.75rem;
  font-weight: 600;
}
</style>
