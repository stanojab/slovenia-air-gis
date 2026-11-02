<script setup>
import {
  CategoryScale,
  Chart,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { formatTime, formatValue } from '../airQuality.js';

// Register only the Chart.js parts we use, which keeps the bundle small.
Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip);

const props = defineProps({
  points: { type: Array, required: true }, // [{ measured_at, value, below_limit }]
  label: { type: String, required: true },
});

const canvas = ref(null);
let chart = null;

function render() {
  chart?.destroy();
  chart = new Chart(canvas.value, {
    type: 'line',
    data: {
      labels: props.points.map((p) => formatTime(p.measured_at)),
      datasets: [
        {
          label: props.label,
          data: props.points.map((p) => p.value),
          borderColor: '#2563eb',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.2,
        },
      ],
    },
    options: {
      animation: false,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: { ticks: { maxTicksLimit: 4, maxRotation: 0 } },
        y: { beginAtZero: true, title: { display: true, text: 'µg/m³' } },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (item) => {
              const point = props.points[item.dataIndex];
              return `${props.label}: ${formatValue(point.value, point.below_limit)} µg/m³`;
            },
          },
        },
      },
    },
  });
}

onMounted(render);
watch(() => props.points, render);
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="chart">
    <canvas ref="canvas" />
  </div>
</template>

<style scoped>
.chart {
  position: relative;
  height: 220px;
}
</style>
