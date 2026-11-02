<script setup>
import { ref, watch } from 'vue';
import { fetchHistory } from '../api.js';
import { formatTime, formatValue, POLLUTANT_LABELS, pm10Band } from '../airQuality.js';
import HistoryChart from './HistoryChart.vue';

const props = defineProps({
  station: { type: Object, required: true }, // GeoJSON Feature from /api/stations
});
defineEmits(['close']);

const history = ref(null);
const pollutant = ref('pm10');
const error = ref(null);

// Load the history whenever a different station is selected.
watch(
  () => props.station.properties.code,
  async (code) => {
    history.value = null;
    error.value = null;
    try {
      const result = await fetchHistory(code);
      if (code !== props.station.properties.code) return; // another station was clicked meanwhile
      const series = result.properties.series;
      history.value = series;
      // Not every station measures PM10 (e.g. Krvavec only measures O3): show what it has.
      if (!series[pollutant.value].length) {
        pollutant.value = Object.keys(series).find((key) => series[key].length) ?? 'pm10';
      }
    } catch (err) {
      error.value = err.message;
    }
  },
  { immediate: true },
);
</script>

<template>
  <section>
    <div class="title">
      <h2>{{ station.properties.name }}</h2>
      <button
        class="close"
        aria-label="Close"
        @click="$emit('close')"
      >
        ×
      </button>
    </div>
    <p class="muted">
      ARSO station {{ station.properties.code }}
      <template v-if="station.properties.altitude_m">
        · {{ station.properties.altitude_m }} m a.s.l.
      </template>
    </p>

    <h3>Latest hourly values (µg/m³)</h3>
    <table class="readings">
      <tr
        v-for="(label, key) in POLLUTANT_LABELS"
        :key="key"
      >
        <th>{{ label }}</th>
        <td>
          {{
            formatValue(
              station.properties.readings[key]?.value,
              station.properties.readings[key]?.below_limit,
            )
          }}
          <span
            v-if="key === 'pm10' && pm10Band(station.properties.readings.pm10?.value)"
            class="muted"
          >
            {{ pm10Band(station.properties.readings.pm10.value).label }}
          </span>
        </td>
        <td class="muted">
          {{ formatTime(station.properties.readings[key]?.measured_at) }}
        </td>
      </tr>
    </table>

    <h3>Last 7 days</h3>
    <div
      class="pollutant-tabs"
      role="tablist"
    >
      <button
        v-for="(label, key) in POLLUTANT_LABELS"
        :key="key"
        :class="{ active: pollutant === key }"
        :disabled="!history?.[key]?.length"
        @click="pollutant = key"
      >
        {{ label }}
      </button>
    </div>
    <p
      v-if="error"
      class="error"
    >
      {{ error }}
    </p>
    <p v-else-if="!history">
      Loading…
    </p>
    <p
      v-else-if="!history[pollutant].length"
      class="muted"
    >
      This station does not measure {{ POLLUTANT_LABELS[pollutant] }}.
    </p>
    <HistoryChart
      v-else
      :points="history[pollutant]"
      :label="POLLUTANT_LABELS[pollutant]"
    />
  </section>
</template>

<style scoped>
.title {
  display: flex;
  justify-content: space-between;
  align-items: start;
}

.title h2 {
  font-size: 1.1rem;
}

h3 {
  margin-top: 1rem;
  font-size: 0.95rem;
}

.close {
  border: none;
  background: none;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  color: var(--muted);
}

.muted {
  color: var(--muted);
  font-size: 0.85rem;
}

.error {
  color: #b91c1c;
}

.readings {
  width: 100%;
  margin-top: 0.4rem;
  border-collapse: collapse;
}

.readings th,
.readings td {
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid var(--border);
  text-align: left;
}

.pollutant-tabs {
  display: flex;
  gap: 0.3rem;
  margin: 0.5rem 0;
}

.pollutant-tabs button {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: #ffffff;
  cursor: pointer;
}

.pollutant-tabs button.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #ffffff;
}

.pollutant-tabs button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
