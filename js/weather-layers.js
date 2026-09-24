import { loadThresholds } from "./thresholds.js";

export const LAYER_KEYS = ["rain", "wind", "cloud", "gust"];
export const LAYER_LABELS = { rain: "Regn", wind: "Vind", cloud: "Skydekke", gust: "Vindkast" };

const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";
const CURRENT_PARAMS = "precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m";

const RISK_COLORS = { ok: "#3fb950", moderate: "#d29922", critical: "#e5484d" };

export function sampleGrid(bounds, steps = 6) {
  const latSpan = (bounds.north - bounds.south) / steps;
  const lonSpan = (bounds.east - bounds.west) / steps;
  const points = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      points.push({
        lat: bounds.south + (i + 0.5) * latSpan,
        lon: bounds.west + (j + 0.5) * lonSpan,
        latSpan,
        lonSpan,
      });
    }
  }
  return points;
}

export async function fetchWeatherGrid(bounds, options = {}) {
  const steps = options.steps ?? 6;
  const points = sampleGrid(bounds, steps);
  const lats = points.map((p) => p.lat.toFixed(4)).join(",");
  const lons = points.map((p) => p.lon.toFixed(4)).join(",");
  const url = `${OPEN_METEO_BASE}?latitude=${lats}&longitude=${lons}&current=${CURRENT_PARAMS}&wind_speed_unit=ms&timezone=UTC`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo svarte ${res.status}`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];

  return points.map((p, i) => {
    const c = arr[i]?.current ?? {};
    return {
      ...p,
      precipitation: c.precipitation ?? 0,
      cloudCover: c.cloud_cover ?? 0,
      windMs: c.wind_speed_10m ?? 0,
      windDirDeg: c.wind_direction_10m ?? 0,
      gustMs: c.wind_gusts_10m ?? 0,
    };
  });
}

export async function drawWeatherLayer(layer, key, grid, options = {}) {
  layer.clearLayers();
  if (!grid?.length) return;
  const thresholds = options.thresholds ?? (await loadThresholds());
  const windTol = options.windToleranceMs ?? thresholds?.droneWindToleranceMs ?? 10.7;

  for (const cell of grid) {
    if (key === "wind") {
      layer.addLayer(arrowMarker(cell, windTol, thresholds));
    } else {
      const style = cellStyle(key, cell, thresholds, windTol);
      if (!style) continue;
      const rect = L.rectangle(cellBounds(cell), {
        stroke: false,
        fillColor: style.color,
        fillOpacity: style.opacity,
        interactive: false,
      });
      layer.addLayer(rect);
    }
  }
}

function cellStyle(key, cell, thresholds, windTol) {
  if (key === "rain") {
    if (cell.precipitation <= 0) return null;
    const heavy = cell.precipitation > (thresholds.rain?.yellowMaxMmPerH ?? 2);
    return { color: heavy ? "#1d6fd0" : "#4da3ff", opacity: heavy ? 0.45 : 0.28 };
  }
  if (key === "cloud") {
    if (cell.cloudCover < 3) return null;
    return { color: "#e8eef4", opacity: 0.06 + (cell.cloudCover / 100) * 0.44 };
  }
  if (key === "gust") {
    const ratio = windTol > 0 ? cell.gustMs / windTol : 0;
    return { color: RISK_COLORS[ratioLevel(ratio, thresholds)], opacity: 0.3 };
  }
  return null;
}

function arrowMarker(cell, windTol, thresholds) {
  const ratio = windTol > 0 ? cell.windMs / windTol : 0;
  const color = RISK_COLORS[ratioLevel(ratio, thresholds)];
  const heading = ((cell.windDirDeg ?? 0) + 180) % 360;
  const svg =
    `<svg width="22" height="22" viewBox="0 0 24 24" style="transform:rotate(${heading}deg)">` +
    `<path d="M12 2 L16 20 L12 16 L8 20 Z" fill="${color}"/></svg>`;
  return L.marker([cell.lat, cell.lon], {
    interactive: false,
    icon: L.divIcon({
      html: `<span class="wind-arrow">${svg}</span>`,
      className: "wind-arrow-wrap",
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    }),
  });
}

function ratioLevel(ratio, thresholds) {
  const g = thresholds.wind?.greenRatio ?? 0.6;
  const y = thresholds.wind?.yellowRatio ?? 0.9;
  if (ratio < g) return "ok";
  if (ratio <= y) return "moderate";
  return "critical";
}

function cellBounds(cell) {
  const halfLat = cell.latSpan / 2;
  const halfLon = cell.lonSpan / 2;
  return [
    [cell.lat - halfLat, cell.lon - halfLon],
    [cell.lat + halfLat, cell.lon + halfLon],
  ];
}