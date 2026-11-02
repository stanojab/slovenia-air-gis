<script setup>
import { computed, onMounted, ref } from 'vue';
import {
  fetchHealth,
  fetchMunicipalities,
  fetchMunicipalityAt,
  fetchNearestStations,
  fetchStations,
} from './api.js';
import { formatTime, formatValue } from './airQuality.js';
import MapView from './components/MapView.vue';
import StationPanel from './components/StationPanel.vue';

const stations = ref(null);
const municipalities = ref(null);
const lastIngest = ref(null);
const error = ref(null);

// Result of the last map click: { point, municipality, nearest }
const clickResult = ref(null);
const selectedCode = ref(null);

const selectedStation = computed(
  () => stations.value?.features.find((f) => f.properties.code === selectedCode.value) ?? null,
);

onMounted(async () => {
  try {
    const [stationData, municipalityData, health] = await Promise.all([
      fetchStations(),
      fetchMunicipalities(),
      fetchHealth(),
    ]);
    stations.value = stationData;
    municipalities.value = municipalityData;
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
    </header>

    <MapView
      class="map"
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
              <span class="pm10">
                PM10
                {{
                  formatValue(
                    station.properties.readings.pm10?.value,
                    station.properties.readings.pm10?.below_limit,
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
          Municipalities are coloured by the latest hourly PM10 value of their
          nearest monitoring station. Circles are ARSO monitoring stations.
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
.nearest .pm10 {
  margin-left: 0.5rem;
}

.pm10 {
  font-size: 0.85rem;
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
