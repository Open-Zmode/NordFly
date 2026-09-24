import { loadThresholds } from "./thresholds.js";

const OPEN_SKY_BASE = "https://opensky-network.org/api/states/all";

const DEMO_TRACKS = [
  { cs: "NOZ4AB", alt: 1219, sp: 125, tr: 90, dLat: -0.09, dLon: 0.06 },
  { cs: "NAX8251", alt: 2134, sp: 148, tr: 45, dLat: 0.14, dLon: -0.05 },
  { cs: "SAS1487", alt: 792, sp: 96, tr: 270, dLat: 0.05, dLon: -0.12 },
  { cs: "DLH4PY", alt: 3048, sp: 165, tr: 85, dLat: -0.12, dLon: 0.12 },
  { cs: "WID7123", alt: 610, sp: 88, tr: 135, dLat: 0.09, dLon: 0.04 },
  { cs: "FIN9BY", alt: 1829, sp: 140, tr: 15, dLat: -0.15, dLon: -0.03 },
  { cs: "RYR31G", alt: 1524, sp: 133, tr: 315, dLat: 0.03, dLon: 0.09 },
  { cs: "ENT7XK", alt: 457, sp: 82, tr: 210, dLat: 0.11, dLon: 0.11 },
];

export function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export async function fetchTraffic(options = {}) {
  const { lat, lon, halfSpan = 0.4 } = options;
  let cfg = {};
  try {
    cfg = (await loadThresholds()).traffic ?? {};
  } catch {
    // bruk standardverdier
  }
  try {
    const params =
      `lamin=${(lat - halfSpan).toFixed(4)}&lomin=${(lon - halfSpan).toFixed(4)}` +
      `&lamax=${(lat + halfSpan).toFixed(4)}&lomax=${(lon + halfSpan).toFixed(4)}`;
    const res = await fetch(`${OPEN_SKY_BASE}?${params}`);
    if (!res.ok) throw new Error(`OpenSky svarte ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.states)) throw new Error("OpenSky: ingen fly i området");
    const aircraft = normalizeStates(data.states);
    if (aircraft.length === 0) throw new Error("OpenSky: ingen fly i luften");
    return { source: "opensky", aircraft };
  } catch (err) {
    return { source: "demo", reason: err.message, aircraft: demoTraffic({ lat, lon, halfSpan, cfg }) };
  }
}

function normalizeStates(states) {
  const list = [];
  for (const s of states) {
    if (s[8] === true || s[8] === 1) continue;
    if (s[5] == null || s[6] == null) continue;
    const baro = s[7];
    const geo = s[13];
    list.push({
      icao24: s[0],
      callsign: (s[1] ?? "").trim() || s[0],
      lat: s[6],
      lon: s[5],
      altitudeBaroM: baro,
      altitudeGeoM: geo,
      velocityMs: s[9],
      trackDeg: s[10],
      vertRateMs: s[11],
      category: s[17],
    });
  }
  return list;
}

export function filterAircraft(aircraft, options = {}) {
  const { lat, lon, maxDistanceKm = 40, lowOnly = false, lowAltitudeM = 300 } = options;
  return aircraft
    .filter((a) => {
      const dist = distanceKm(lat, lon, a.lat, a.lon);
      a.distanceKm = dist;
      if (dist > maxDistanceKm) return false;
      if (lowOnly) {
        const alt = a.altitudeBaroM ?? a.altitudeGeoM ?? 0;
        if (alt > lowAltitudeM) return false;
      }
      return true;
    })
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

function demoTraffic({ lat, lon, halfSpan, cfg }) {
  const now = Date.now() / 1000;
  const maxDist = cfg.maxDistanceKm ?? 40;
  const low = cfg.lowAltitudeM ?? 300;
  const list = [];
  for (const t of DEMO_TRACKS) {
    const cycle = now / (140 + t.tr);
    const drift = Math.sin(cycle * 0.7 + t.dLat) * halfSpan * 0.35;
    const aLat = lat + t.dLat * halfSpan * 1.8 + drift * 0.5;
    const aLon = lon + t.dLon * halfSpan * 1.8 + Math.cos(cycle * 0.5) * halfSpan * 0.3;
    list.push({
      icao24: "",
      callsign: t.cs,
      lat: aLat,
      lon: aLon,
      altitudeBaroM: t.alt,
      altitudeGeoM: Math.round(t.alt * 1.02),
      velocityMs: t.sp,
      trackDeg: t.tr,
      vertRateMs: 0,
      category: 0,
      distanceKm: distanceKm(lat, lon, aLat, aLon),
      demo: true,
    });
  }
  void low;
  return list;
}