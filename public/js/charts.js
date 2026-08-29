/**
 * charts.js — Chart.js factory with CRT NOC theme
 */

// ── CRT Theme defaults ────────────────────────────────────────────
const CRT = {
  green:        '#1acc00',
  greenBright:  '#39ff14',
  greenDim:     '#0d7a00',
  greenGhost:   'rgba(26, 204, 0, 0.08)',
  greenFill:    'rgba(26, 204, 0, 0.12)',
  amber:        '#d4a827',
  amberFill:    'rgba(212, 168, 39, 0.12)',
  red:          '#cc2a36',
  redFill:      'rgba(204, 42, 54, 0.12)',
  blue:         '#5577aa',
  blueFill:     'rgba(85, 119, 170, 0.12)',
  grid:         'rgba(25, 40, 25, 0.8)',
  text:         '#4a6a44',
  textBright:   '#9cbf94',
  background:   'transparent',
  fontMono:     "'JetBrains Mono', 'Fira Code', monospace",
};

// ── Global Chart.js defaults ──────────────────────────────────────
if (typeof Chart !== 'undefined') {
  Chart.defaults.color            = CRT.text;
  Chart.defaults.font.family      = CRT.fontMono;
  Chart.defaults.font.size        = 10;
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.plugins.tooltip.backgroundColor = '#0c150c';
  Chart.defaults.plugins.tooltip.borderColor      = '#253825';
  Chart.defaults.plugins.tooltip.borderWidth      = 1;
  Chart.defaults.plugins.tooltip.titleColor       = CRT.greenBright;
  Chart.defaults.plugins.tooltip.bodyColor        = CRT.textBright;
  Chart.defaults.plugins.tooltip.titleFont        = { family: CRT.fontMono, size: 10, weight: '600' };
  Chart.defaults.plugins.tooltip.bodyFont         = { family: CRT.fontMono, size: 10 };
  Chart.defaults.plugins.tooltip.padding          = 8;
  Chart.defaults.plugins.tooltip.cornerRadius     = 0;
  Chart.defaults.animation.duration               = 150;
}

// ── Line dataset factory ──────────────────────────────────────────
function lineDataset(label, data, color, fillColor) {
  return {
    label,
    data,
    borderColor:     color,
    backgroundColor: fillColor,
    borderWidth:     1.5,
    pointRadius:     0,
    pointHoverRadius: 3,
    pointHoverBackgroundColor: color,
    tension:         0.3,
    fill:            true,
  };
}

// ── Base time-series config ────────────────────────────────────────
function baseTimeConfig(datasets, yMax = 100, yLabel = '%', opts = {}) {
  return {
    type: 'line',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 100 },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'second', displayFormats: { second: 'HH:mm:ss' } },
          grid: { color: CRT.grid, drawBorder: false },
          ticks: {
            color: CRT.text,
            font: { family: CRT.fontMono, size: 9 },
            maxTicksLimit: 8,
            maxRotation: 0,
          },
          border: { color: CRT.grid },
        },
        y: {
          min: 0,
          max: yMax,
          grid: { color: CRT.grid, drawBorder: false },
          ticks: {
            color: CRT.text,
            font: { family: CRT.fontMono, size: 9 },
            callback: v => v + yLabel,
            maxTicksLimit: 5,
          },
          border: { color: CRT.grid },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}${yLabel}`,
          },
        },
      },
      ...opts,
    },
  };
}

// ── CPU chart ─────────────────────────────────────────────────────
export function createCpuChart(canvas, history) {
  const data = buildTimeData(history.ts, history.cpu);
  const ds = [lineDataset('CPU', data, CRT.green, CRT.greenFill)];
  return new Chart(canvas, baseTimeConfig(ds, 100, '%'));
}

// ── Memory chart ──────────────────────────────────────────────────
export function createMemChart(canvas, history) {
  const data = buildTimeData(history.ts, history.mem);
  const ds = [lineDataset('MEM', data, CRT.amber, CRT.amberFill)];
  return new Chart(canvas, baseTimeConfig(ds, 100, '%'));
}

// ── Network chart (dual line: RX + TX) ────────────────────────────
export function createNetChart(canvas, history) {
  const rxData = buildTimeData(history.ts, history.netRx.map(b => b / 1024)); // KB/s approx
  const txData = buildTimeData(history.ts, history.netTx.map(b => b / 1024));
  const ds = [
    lineDataset('RX', rxData, CRT.green,  CRT.greenFill),
    lineDataset('TX', txData, CRT.blue,   CRT.blueFill),
  ];
  const max = Math.max(
    ...history.netRx.map(b => b / 1024),
    ...history.netTx.map(b => b / 1024),
    100
  );
  return new Chart(canvas, baseTimeConfig(ds, Math.ceil(max * 1.2), ' KB', {
    plugins: { legend: { display: true, labels: { color: CRT.text, font: { family: CRT.fontMono, size: 9 } } } },
  }));
}

// ── Combined overview chart (CPU + MEM) ───────────────────────────
export function createOverviewChart(canvas, history) {
  const cpuData = buildTimeData(history.ts, history.cpu);
  const memData = buildTimeData(history.ts, history.mem);
  const ds = [
    lineDataset('CPU', cpuData, CRT.green, CRT.greenFill),
    lineDataset('MEM', memData, CRT.amber, CRT.amberFill),
  ];
  const cfg = baseTimeConfig(ds, 100, '%');
  cfg.options.plugins.legend.display = true;
  cfg.options.plugins.legend.labels  = {
    color:       CRT.textBright,
    font:        { family: CRT.fontMono, size: 9 },
    boxWidth:    10,
    boxHeight:   2,
    borderRadius: 0,
  };
  return new Chart(canvas, cfg);
}

// ── Doughnut / Pie Chart ──────────────────────────────────────────
export function createDoughnutChart(canvas, labels, data, colors) {
  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: '#091009',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: {
            color: CRT.textBright,
            font: { family: CRT.fontMono, size: 9 },
            boxWidth: 10,
            padding: 8,
          },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw}`,
          },
        },
      },
    },
  });
}

// ── Sparkline (tiny inline chart) ─────────────────────────────────
export function createSparkline(canvas, data, color = CRT.green) {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels: data.map((_, i) => i),
      datasets: [{
        data,
        borderColor:     color,
        backgroundColor: color.replace(')', ', 0.1)').replace('rgb', 'rgba'),
        borderWidth:     1,
        pointRadius:     0,
        tension:         0.4,
        fill:            true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 0 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: { display: false },
        y: { display: false, min: 0, max: 100 },
      },
    },
  });
}

// ── Update chart data ─────────────────────────────────────────────
export function updateChart(chart, history, field, transform) {
  if (!chart || !history) return;
  const data = buildTimeData(history.ts, transform ? history[field].map(transform) : history[field]);
  chart.data.datasets[0].data = data;
  chart.update('none');
}

export function updateDualChart(chart, history, fieldA, fieldB, transformA, transformB) {
  if (!chart || !history) return;
  chart.data.datasets[0].data = buildTimeData(history.ts, transformA ? history[fieldA].map(transformA) : history[fieldA]);
  chart.data.datasets[1].data = buildTimeData(history.ts, transformB ? history[fieldB].map(transformB) : history[fieldB]);
  chart.update('none');
}

// ── Helper: build {x: timestamp, y: value} pairs ─────────────────
function buildTimeData(timestamps, values) {
  if (!timestamps || !values) return [];
  const len = Math.min(timestamps.length, values.length);
  const result = [];
  for (let i = 0; i < len; i++) {
    result.push({ x: timestamps[i], y: values[i] ?? 0 });
  }
  return result;
}

// ── Slicing helpers for time ranges ──────────────────────────────
export function sliceHistory(history, seconds) {
  const cutoff = Date.now() - seconds * 1000;
  const idx = history.ts.findIndex(t => t >= cutoff);
  if (idx <= 0) return history;
  return {
    ts:    history.ts.slice(idx),
    cpu:   history.cpu.slice(idx),
    mem:   history.mem.slice(idx),
    netRx: history.netRx.slice(idx),
    netTx: history.netTx.slice(idx),
  };
}

export const TIME_RANGES = [
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
  { label: '15m', seconds: 900 },
  { label: '1h',  seconds: 3600 },
];
