import { NOTAM_LEVEL_META } from "./notam.js";

export const DEFAULT_CENTER = { lat: 63.4305, lng: 10.3951 };
export const DEFAULT_ZOOM = 10;

const LAYER_OPTS = {
  forbidden: { color: "#e5484d", fillColor: "#e5484d", fillOpacity: 0.22, weight: 2 },
  restriction: { color: "#e5a500", fillColor: "#e5a500", fillOpacity: 0.22, weight: 2 },
  info: { color: "#4da3ff", fillColor: "#4da3ff", fillOpacity: 0.18, weight: 2 },
};

export function initMap(targetId = "map", options = {}) {
  const el = document.getElementById(targetId);
  if (!el) throw new Error(`Map element #${targetId} not found`);
  if (typeof L === "undefined") throw new Error("Leaflet not loaded");

  const map = L.map(el, {
    center: options.center ?? DEFAULT_CENTER,
    zoom: options.zoom ?? DEFAULT_ZOOM,
    zoomControl: true,
  });

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const droneMarker = L.marker(options.center ?? DEFAULT_CENTER, {
    title: "Drone (simulert posisjon)",
  })
    .addTo(map)
    .bindPopup("Simulert drone-posisjon");

  const notamLayer = L.layerGroup().addTo(map);
  const trafficLayer = L.layerGroup().addTo(map);

  const weatherLayers = {
    rain: L.layerGroup(),
    wind: L.layerGroup(),
    cloud: L.layerGroup(),
    gust: L.layerGroup(),
  };

  return { map, droneMarker, notamLayer, trafficLayer, weatherLayers };
}

export function drawNotams(layer, notams) {
  layer.clearLayers();
  for (const n of notams) {
    if (n.lat == null || n.lon == null) continue;
    const opts = { ...LAYER_OPTS[n.level], radius: n.radiusM ?? 3000 };
    const circle = L.circle([n.lat, n.lon], opts).addTo(layer);
    const line = `<b>${escapeHtml(n.title)}</b>` +
      (n.message ? `<br>${escapeHtml(n.message)}` : "") +
      (n.start || n.end ? `<br><i>${escapeHtml(n.start ?? "")} → ${escapeHtml(n.end ?? "")}</i>` : "") +
      `<br><span style="opacity:.7">${NOTAM_LEVEL_META[n.level].label} · kilde: ${escapeHtml(n.source)}</span>`;
    circle.bindPopup(line);
  }
}

export function drawAircraft(layer, aircraft) {
  layer.clearLayers();
  for (const a of aircraft) {
    const marker = L.marker([a.lat, a.lon], {
      icon: aircraftIcon(a.trackDeg),
      title: `${a.callsign} · ${altText(a)}`,
    }).addTo(layer);
    marker.bindPopup(aircraftPopup(a));
  }
}

function aircraftIcon(trackDeg = 0) {
  const svg =
    `<svg width="24" height="24" viewBox="0 0 24 24" style="transform:rotate(${trackDeg ?? 0}deg)">` +
    `<path d="M12 1 14.5 8.5 22 11.5 14.5 13 12 23 9.5 13 2 11.5 9.5 8.5Z" fill="currentColor"/></svg>`;
  return L.divIcon({
    html: `<span class="aircraft-icon">${svg}</span>`,
    className: "aircraft-wrap",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -14],
  });
}

function aircraftPopup(a) {
  const m = a.altitudeBaroM ?? a.altitudeGeoM;
  const ft = m != null ? Math.round(m * 3.2808).toLocaleString("no-NO") : "";
  const source = a.demo ? "demodata" : "OpenSky (CORS-blokkert)";
  return `<b>${escapeHtml(a.callsign)}</b><br>` +
    `Høyde: ${altText(a)}${ft ? ` (${ft} ft)` : ""}<br>` +
    `Fart: ${a.velocityMs != null ? `${a.velocityMs.toFixed(0)} m/s` : "n/a"} · Spor: ${a.trackDeg ?? "n/a"}°<br>` +
    `Avstand: ${a.distanceKm != null ? `${a.distanceKm.toFixed(1)} km` : "n/a"} fra drone` +
    `<br><span style="opacity:.7">${source}</span>`;
}

function altText(a) {
  const m = a.altitudeBaroM ?? a.altitudeGeoM;
  return m != null ? `${m.toLocaleString("no-NO")} m` : "n/a";
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}