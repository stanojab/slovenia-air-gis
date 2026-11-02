<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import {
  fetchHealth,
  fetchMunicipalities,
  fetchMunicipalityAt,
  fetchNearestStations,
  fetchStations,
} from './api.js';
import { formatTime, formatValue, POLLUTANT_LABELS } from './airQuality.js';
import MapView from './components/MapView.vue';
import StationPanel from './components/StationPanel.vue';

const stations = ref(null);
const municipalities = ref(null);
const lastIngest = ref(null);
const error = ref(null);

// Pollutant that colours the map. Boundaries for each pollutant are fetched
// once and cached, so switching back and forth is instant.
const pollutant = ref('pm10');
const municipalitiesByPollutant = new Map();

async function loadMunicipalities(selected) {
  if (!municipalitiesByPollutant.has(selected)) {
    municipalitiesByPollutant.set(selected, await fetchMunicipalities(selected));
  }
  // Ignore a slow response if the user has picked another pollutant meanwhile.
  if (selected === pollutant.value) {
    municipalities.value = municipalitiesByPollutant.get(selected);
  }
}

watch(pollutant, (selected) =>
  loadMunicipalities(selected).catch((err) => {
    error.value = `Could not load municipalities: ${err.message}`;
  }),
);

// Result of the last map click: { point, municipality, nearest }
const clickResult = ref(null);
const selectedCode = ref(null);

const selectedStation = computed(
  () => stations.value?.features.find((f) => f.properties.code === selectedCode.value) ?? null,
);

onMounted(async () => {
  try {
    const [stationData, health] = await Promise.all([
      fetchStations(),
      fetchHealth(),
      loadMunicipalities(pollutant.value),
    ]);
    stations.value = stationData;
    lastIngest.value = health.last_ingest;
  } catch (err) {
    error.value = `Could not load data: ${err.message}`;
  }
});

// Clicks can arrive faster than responses; only the newest one may update the panel.
let latestClick = 0;

async function onMapClick({ lat, lng }) {
  const clickId = ++latestClick;
  selectedCode.value = null;
  clickResult.value = { point: { lat, lng }, municipality: null, nearest: [], loading: true };
  try {
    const [atPoint, nearest] = await Promise.all([
      fetchMunicipalityAt(lat, lng),
      fetchNearestStations(lat, lng, 3),
    ]);
    if (clickId !== latestClick) return;
    clickResult.value = {
      point: { lat, lng },
      municipality: atPoint.features[0] ?? null,
      nearest: nearest.features,
      loading: false,
    };
  } catch (err) {
    if (clickId === latestClick) error.value = err.message;
  }
}
</script>

<template>
  <div class="layout">
    <header class="header">
      <h1>Slovenia Air Quality GIS</h1>
      <p
        v-if="lastIngest"
        class="freshness"
        :class="{ sample: lastIngest.source === 'sample' }"
      >
        <template v-if="lastIngest.source === 'sample'">
          Offline sample snapshot ·
        </template>
        Data until {{ formatTime(lastIngest.data_until) }} (ARSO, unverified)
      </p>
      <div
        class="pollutant-picker"
        role="radiogroup"
        aria-label="Pollutant shown on the map"
      >
        <span class="picker-label">Map shows</span>
        <button
          v-for="(label, key) in POLLUTANT_LABELS"
          :key="key"
          role="radio"
          :aria-checked="pollutant === key"
          :class="{ active: pollutant === key }"
          @click="pollutant = key"
        >
          {{ label }}
        </button>
      </div>
    </header>

    <MapView
      class="map"
      :pollutant="pollutant"
      :stations="stations"
      :municipalities="municipalities"
      :click-result="clickResult"
      :selected-code="selectedCode"
      @map-click="onMapClick"
      @station-click="selectedCode = $event"
    />

    <aside class="panel">
      <p
        v-if="error"
        class="error"
      >
        {{ error }}
      </p>

      <StationPanel
        v-if="selectedStation"
        :station="selectedStation"
        :map-pollutant="pollutant"
        @close="selectedCode = null"
      />

      <section v-else-if="clickResult">
        <h2>{{ clickResult.municipality?.properties.name ?? 'Outside Slovenia' }}</h2>
        <p class="muted">
          {{ clickResult.point.lat.toFixed(4) }}, {{ clickResult.point.lng.toFixed(4) }}
        </p>
        <p v-if="clickResult.loading">
          Loading…
        </p>
        <template v-else>
          <h3>Nearest stations</h3>
          <ol class="nearest">
            <li
              v-for="station in clickResult.nearest"
              :key="station.properties.code"
            >
              <button
                class="link"
                @click="selectedCode = station.properties.code"
              >
                {{ station.properties.name }}
              </button>
              <span class="muted">{{ station.properties.distance_km.toFixed(1) }} km</span>
              <span class="reading">
                {{ POLLUTANT_LABELS[pollutant] }}
                {{
                  formatValue(
                    station.properties.readings[pollutant]?.value,
                    station.properties.readings[pollutant]?.below_limit,
                  )
                }}
              </span>
            </li>
          </ol>
        </template>
      </section>

      <section v-else>
        <h2>Air quality in Slovenia</h2>
        <p>
          Municipalities are coloured by the latest hourly value of the selected
          pollutant at their nearest monitoring station that measures it.
          Circles are ARSO monitoring stations; grey means no data.
        </p>
        <p class="muted">
          PM10 and PM2.5 are fine dust (traffic, wood heating; worst in winter).
          O₃ is ozone (worst on sunny summer days). NO₂ comes mostly from traffic.
          O₃ and NO₂ are measured at only 11 stations, so values are often borrowed
          from further away.
        </p>
        <p>
          <strong>Click anywhere</strong> on the map to see the municipality and the
          three nearest stations. <strong>Click a station</strong> for its readings
          and the last 7 days of history.
        </p>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 1fr 360px;
  grid-template-rows: auto 1fr;
  height: 100%;
}

.header {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 1rem;
  padding: 0.6rem 1rem;
  background: var(--panel-bg);
  border-bottom: 1px solid var(--border);
}

.header h1 {
  font-size: 1.15rem;
}

.freshness {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}

.freshness.sample {
  padding: 0.1rem 0.5rem;
  border-radius: 4px;
  background: var(--warning-bg);
  color: var(--warning-text);
}

.map {
  min-height: 0;
}

.panel {
  overflow-y: auto;
  padding: 1rem;
  background: var(--panel-bg);
  border-left: 1px solid var(--border);
}

.panel h2 {
  font-size: 1.1rem;
}

.panel h3 {
  margin-top: 1rem;
  font-size: 0.95rem;
}

.muted {
  color: var(--muted);
  font-size: 0.85rem;
}

.error {
  color: #b91c1c;
}

.nearest {
  padding-left: 1.2rem;
}

.nearest li {
  margin-bottom: 0.5rem;
}

.nearest .muted,
.nearest .reading {
  margin-left: 0.5rem;
}

.reading {
  font-size: 0.85rem;
}

.pollutant-picker {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin-left: auto;
}

.picker-label {
  font-size: 0.85rem;
  color: var(--muted);
}

.pollutant-picker button {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #ffffff;
  cursor: pointer;
}

.pollutant-picker button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #ffffff;
}

.link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  text-decoration: underline;
}

/* Phones and narrow windows: map on top, panel below. */
@media (max-width: 800px) {
  .layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto 60vh auto;
    height: auto;
  }

  .panel {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}
</style>
