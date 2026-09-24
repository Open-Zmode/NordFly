import { initMap, DEFAULT_CENTER, drawNotams, drawAircraft } from "./js/map.js";
import {
  renderWeather,
  renderDroneInfo,
  renderChecklist,
  renderRisk,
  renderMissions,
  promptNewMission,
} from "./js/sidebar.js";
import { loadDrones } from "./js/drones.js";
import { get as storageGet, set as storageSet } from "./js/storage.js";
import { fetchTraffic, filterAircraft } from "./js/traffic.js";
import { loadNotams, parseNotamUpload, NOTAM_LEVEL_META } from "./js/notam.js";
import { loadThresholds } from "./js/thresholds.js";
import { fetchWeatherGrid, drawWeatherLayer, LAYER_KEYS } from "./js/weather-layers.js";
import { overallRisk } from "./js/risk.js";
import { listMissions, exportMissionsJson, nearbyNotams } from "./js/missions.js";

const DRONE_STORAGE_KEY = "selectedDroneId";
const CUSTOM_NOTAM_KEY = "customNotams";
const WEATHER_LAYERS_KEY = "weatherLayers";

const DEFAULT_WEATHER_LAYERS = { rain: false, wind: false, cloud: false, gust: false };

const state = {
  map: null,
  droneMarker: null,
  latlng: DEFAULT_CENTER,
  drones: [],
  drone: null,
  notamLayer: null,
  trafficLayer: null,
  weatherLayers: null,
  weatherGrid: null,
  weatherOn: storageGet(WEATHER_LAYERS_KEY, DEFAULT_WEATHER_LAYERS) ?? DEFAULT_WEATHER_LAYERS,
  weatherDebounce: null,
  lastWeather: null,
  lastAircraft: [],
  notams: [],
  customNotams: storageGet(CUSTOM_NOTAM_KEY, []) ?? [],
  trafficOn: true,
  notamOn: true,
  lowOnly: false,
  trafficTimer: null,
};

async function refreshWeather() {
  state.lastWeather = await renderWeather(state.latlng.lat, state.latlng.lng, {
    windToleranceMs: state.drone?.maksVindMotstand,
    droneName: state.drone ? `${state.drone.merk} ${state.drone.modell}` : null,
  });
}

async function refreshTraffic() {
  clearTimeout(state.trafficTimer);

  let cfg = {};
  try {
    cfg = (await loadThresholds()).traffic ?? {};
  } catch {
    // fall back to defaults below
  }

  try {
    const { source, aircraft, reason } = await fetchTraffic({
      lat: state.latlng.lat,
      lon: state.latlng.lng,
    });
    const visible = filterAircraft(aircraft, {
      lat: state.latlng.lat,
      lon: state.latlng.lng,
      maxDistanceKm: cfg.maxDistanceKm ?? 40,
      lowOnly: state.lowOnly,
      lowAltitudeM: cfg.lowAltitudeM ?? 300,
    });
    if (state.trafficOn) drawAircraft(state.trafficLayer, visible);
    state.lastAircraft = visible;
    updateTrafficNote(source, visible.length, reason);
  } catch (err) {
    updateTrafficNote("error", 0, err.message);
  }

  state.trafficTimer = setTimeout(() => refreshTraffic(), (cfg.refreshSec ?? 15) * 1000);
}

function updateTrafficNote(source, count, reason) {
  const el = document.getElementById("traffic-note");
  if (!el) return;
  if (!state.trafficOn) {
    el.textContent = "";
    return;
  }
  if (source === "opensky") {
    el.textContent = `Lufttrafikk: ${count} fly (OpenSky live)`;
  } else if (source === "demo") {
    el.textContent = `Lufttrafikk: ${count} fly (demodata — OpenSky blokkert av CORS)`;
  } else {
    el.textContent = `Lufttrafikk utilgjengelig${reason ? `: ${reason}` : ""}`;
  }
}

async function refreshNotams() {
  let base = [];
  try {
    base = await loadNotams();
  } catch {
    base = [];
  }
  state.notams = [...base, ...state.customNotams];
  if (state.notamOn) drawNotams(state.notamLayer, state.notams);
}

function lgRow(color, label) {
  return `<div class="lg-row"><span class="lg-dot" style="background:${color}"></span>${label}</div>`;
}

function renderLegend() {
  const el = document.getElementById("map-legend");
  if (!el) return;
  const rows = Object.values(NOTAM_LEVEL_META).map((m) => lgRow(m.color, m.label));
  rows.push(lgRow("var(--accent)", "Luftfartøy (ADS-B)"));

  if (LAYER_KEYS.some((k) => state.weatherOn[k])) {
    rows.push('<div class="lg-title">Værlag</div>');
    if (state.weatherOn.rain) rows.push(lgRow("#1d6fd0", "Regn (mm/t)"));
    if (state.weatherOn.wind) rows.push(lgRow("var(--accent)", "Vind (rel. drone)"));
    if (state.weatherOn.gust) rows.push(lgRow("var(--critical)", "Vindkast (rel. drone)"));
    if (state.weatherOn.cloud) rows.push(lgRow("#e8eef4", "Skydekke (%)"));
  }

  el.innerHTML = `<div class="lg-title">Tegnforklaring</div>${rows.join("")}`;
}

function currentBounds() {
  const b = state.map.getBounds();
  return { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
}

async function refreshWeatherLayers() {
  if (!LAYER_KEYS.some((k) => state.weatherOn[k])) return;
  try {
    const thresholds = await loadThresholds();
    state.weatherGrid = await fetchWeatherGrid(currentBounds(), { steps: 6 });
    await applyWeatherLayers(thresholds);
  } catch (err) {
    console.warn("Værlag:", err.message);
    state.weatherGrid = null;
    applyWeatherLayers();
  }
}

async function applyWeatherLayers(thresholds) {
  if (!thresholds) {
    try {
      thresholds = await loadThresholds();
    } catch {
      thresholds = null;
    }
  }
  for (const key of LAYER_KEYS) {
    const layer = state.weatherLayers[key];
    if (state.weatherOn[key]) {
      if (!state.map.hasLayer(layer)) state.map.addLayer(layer);
      if (state.weatherGrid) {
        await drawWeatherLayer(layer, key, state.weatherGrid, {
          thresholds,
          windToleranceMs: state.drone?.maksVindMotstand,
        });
      }
    } else {
      layer.clearLayers();
      if (state.map.hasLayer(layer)) state.map.removeLayer(layer);
    }
  }
  renderLegend();
}

function syncLayerButton() {
  document
    .getElementById("btn-layers")
    ?.classList.toggle("active", LAYER_KEYS.some((k) => state.weatherOn[k]));
}

function bindLayerMenu() {
  const btn = document.getElementById("btn-layers");
  const menu = document.getElementById("layer-menu");
  if (!btn || !menu) return;

  syncLayerButton();

  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const willOpen = menu.hidden;
    menu.hidden = !willOpen;
    btn.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    }
  });

  menu.querySelectorAll("input[data-layer]").forEach((cb) => {
    cb.checked = !!state.weatherOn[cb.dataset.layer];
    cb.addEventListener("change", () => {
      state.weatherOn[cb.dataset.layer] = cb.checked;
      storageSet(WEATHER_LAYERS_KEY, state.weatherOn);
      syncLayerButton();
      if (cb.checked && !state.weatherGrid) refreshWeatherLayers();
      else applyWeatherLayers();
    });
  });
}

function syncToggles() {
  document.getElementById("btn-traffic")?.classList.toggle("active", state.trafficOn);
  document.getElementById("btn-notam")?.classList.toggle("active", state.notamOn);
  document.getElementById("btn-low")?.classList.toggle("active", state.lowOnly);
}

function bindToggles() {
  const trafficBtn = document.getElementById("btn-traffic");
  const notamBtn = document.getElementById("btn-notam");
  const lowBtn = document.getElementById("btn-low");

  syncToggles();

  trafficBtn?.addEventListener("click", () => {
    state.trafficOn = !state.trafficOn;
    if (state.trafficOn) {
      state.map.addLayer(state.trafficLayer);
      refreshTraffic();
    } else {
      state.map.removeLayer(state.trafficLayer);
      updateTrafficNote("off", 0);
    }
    syncToggles();
  });

  notamBtn?.addEventListener("click", () => {
    state.notamOn = !state.notamOn;
    if (state.notamOn) {
      state.map.addLayer(state.notamLayer);
      drawNotams(state.notamLayer, state.notams);
    } else {
      state.map.removeLayer(state.notamLayer);
    }
    syncToggles();
  });

  lowBtn?.addEventListener("click", () => {
    state.lowOnly = !state.lowOnly;
    syncToggles();
    refreshTraffic();
  });
}

function bindUpload() {
  const input = document.getElementById("file-notams");
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = parseNotamUpload(await file.text());
      state.customNotams = [...state.customNotams, ...parsed];
      storageSet(CUSTOM_NOTAM_KEY, state.customNotams);
      if (!state.notamOn) {
        state.notamOn = true;
        state.map.addLayer(state.notamLayer);
      }
      await refreshNotams();
      syncToggles();
    } catch (err) {
      alert(`Kunne ikke lese NOTAM-filen: ${err.message}`);
    }
    input.value = "";
  });
}

function buildMissionContext() {
  const riskState = storageGet("risk", {}) ?? {};
  const levels = Object.values(riskState);
  const boxes = [...document.querySelectorAll("#checklist-root input[type=checkbox]")];
  const w = state.lastWeather?.current ?? null;
  return {
    drone: state.drone,
    location: { lat: state.latlng.lat, lon: state.latlng.lng },
    weather: state.lastWeather
      ? {
          time: w?.time instanceof Date ? w.time.toISOString() : w?.time ?? new Date().toISOString(),
          temperatureC: w?.temperatureC ?? null,
          humidityPct: w?.humidityPct ?? null,
          isDay: w?.isDay ?? null,
          precipitationMmH: w?.precipitationMmH ?? null,
          weatherCode: w?.weatherCode ?? null,
          cloudCoverPct: w?.cloudCoverPct ?? null,
          pressureHpa: w?.pressureHpa ?? null,
          windMs: w?.windMs ?? null,
          gustMs: w?.gustMs ?? null,
          visibilityKm: w?.visibilityKm ?? null,
          rows: state.lastWeather.rows,
        }
      : null,
    notams: nearbyNotams(state.notams, { lat: state.latlng.lat, lon: state.latlng.lng }, 30),
    traffic: (state.lastAircraft ?? []).slice(0, 10),
    risk: { categories: riskState, overall: overallRisk(levels.length ? levels : ["lav"]).level },
    checklist: { done: boxes.filter((b) => b.checked).length, total: boxes.length },
  };
}

function bindMissions() {
  document
    .getElementById("btn-new-mission")
    ?.addEventListener("click", () => promptNewMission(buildMissionContext));
  document.getElementById("btn-export-missions")?.addEventListener("click", async () => {
    const missions = await listMissions();
    if (!missions.length) {
      alert("Ingen oppdrag å eksportere.");
      return;
    }
    exportMissionsJson(missions);
  });
}

async function initDrones() {
  try {
    state.drones = await loadDrones();
  } catch (err) {
    console.error(err);
    return;
  }

  const select = document.getElementById("drone-select");
  if (!select) return;

  for (const drone of state.drones) {
    select.add(new Option(`${drone.merk} ${drone.modell}`, drone.id));
  }
  select.disabled = false;

  const stored = storageGet(DRONE_STORAGE_KEY, "");
  select.value = stored;

  const applySelection = (id) => {
    state.drone = state.drones.find((d) => d.id === id) ?? null;
    storageSet(DRONE_STORAGE_KEY, id);
    renderDroneInfo(state.drone);
    refreshWeather();
    if (LAYER_KEYS.some((k) => state.weatherOn[k])) applyWeatherLayers();
  };

  select.addEventListener("change", () => applySelection(select.value));
  applySelection(select.value || "");
}

function setup() {
  const map = initMap("map");
  state.map = map.map;
  state.droneMarker = map.droneMarker;
  state.notamLayer = map.notamLayer;
  state.trafficLayer = map.trafficLayer;
  state.weatherLayers = map.weatherLayers;

  document.getElementById("btn-locate")?.addEventListener("click", () => {
    state.droneMarker.openPopup();
  });

  state.map.on("click", (e) => {
    state.latlng = e.latlng;
    state.droneMarker.setLatLng(e.latlng);
    refreshWeather();
    refreshTraffic();
  });

  state.map.on("moveend", () => {
    if (!LAYER_KEYS.some((k) => state.weatherOn[k])) return;
    clearTimeout(state.weatherDebounce);
    state.weatherDebounce = setTimeout(refreshWeatherLayers, 700);
  });

  renderLegend();
  bindToggles();
  bindUpload();
  bindLayerMenu();
  bindMissions();
  renderChecklist();
  renderRisk();
  renderMissions();
  refreshWeather();
  refreshNotams();
  refreshTraffic();
  initDrones();
  if (LAYER_KEYS.some((k) => state.weatherOn[k])) refreshWeatherLayers();
}

setup();