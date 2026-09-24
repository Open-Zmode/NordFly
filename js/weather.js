import { loadThresholds } from "./thresholds.js";

export const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

const CURRENT_PARAMS = [
  "temperature_2m",
  "relative_humidity_2m",
  "is_day",
  "precipitation",
  "weather_code",
  "cloud_cover",
  "pressure_msl",
  "wind_speed_10m",
  "wind_gusts_10m",
  "visibility",
].join(",");

const THUNDER_CODES = new Set([95, 96, 99]);
const SHOWER_CODES = new Set([
  51, 52, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 85, 86,
]);
const CELL_TEXT = {
  95: "Tordenvær", 96: "Torden m/ hagl", 99: "Torden m/ hagl",
  51: "Duskregn", 52: "Duskregn", 53: "Duskregn", 55: "Tett duskregn",
  56: "Isdusk", 57: "Isdusk", 61: "Regn", 63: "Regn", 65: "Kraftig regn",
  66: "Isregn", 67: "Isregn", 80: "Byger", 81: "Byger", 82: "Kraftige byger",
  85: "Snøbyger", 86: "Snøbyger",
};

export async function fetchCurrent(lat, lon) {
  const url =
    `${OPEN_METEO_BASE}?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}&current=${CURRENT_PARAMS}` +
    `&wind_speed_unit=ms&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo svarte ${res.status}`);
  const data = await res.json();
  const c = data.current ?? {};
  if (!c.time) throw new Error("Open-Meteo: ingen nåværende observasjon");

  return {
    time: new Date(c.time),
    temperatureC: c.temperature_2m,
    humidityPct: c.relative_humidity_2m,
    isDay: c.is_day === 1,
    precipitationMmH: c.precipitation,
    weatherCode: c.weather_code,
    cloudCoverPct: c.cloud_cover,
    pressureHpa: c.pressure_msl,
    windMs: c.wind_speed_10m,
    gustMs: c.wind_gusts_10m,
    visibilityKm: c.visibility != null ? c.visibility / 1000 : null,
  };
}

function ratioLevel(ratio, greenRatio, yellowRatio) {
  if (ratio < greenRatio) return "ok";
  if (ratio <= yellowRatio) return "moderate";
  return "critical";
}

function num(value, decimals = 1) {
  return value == null ? "--" : value.toFixed(decimals).replace(/\.0+$/, "");
}

export function evaluateWeather(current, thresholds, options = {}) {
  const t = thresholds;
  const windTol = options.windToleranceMs ?? t?.droneWindToleranceMs ?? 10.7;
  const std = t?.pressureHpa?.std ?? 1013;
  const rows = [];

  const windMs = current.windMs ?? 0;
  const windRatio = windTol > 0 ? windMs / windTol : 0;
  rows.push({
    key: "wind",
    label: "Vindfart",
    value: `${num(windMs)} m/s`,
    level: ratioLevel(windRatio, t.wind.greenRatio, t.wind.yellowRatio),
    comment: options.droneName
      ? `Maks vind for ${options.droneName}: ${num(windTol, 1)} m/s`
      : `Dronevindtoleranse: ${num(windTol, 1)} m/s`,
  });

  const gustMs = current.gustMs ?? 0;
  const gustRank = { ok: 0, moderate: 1, critical: 2 };
  const gustWindRatio = windMs > 0 ? gustMs / windMs : 0;
  const gustTolRatio = windTol > 0 ? gustMs / windTol : 0;
  const gustTolLevel = ratioLevel(gustTolRatio, t.gust.greenRatio, t.gust.yellowRatio);
  let gustLevel;
  let gustComment;
  if (windMs <= 2) {
    gustLevel = gustTolLevel;
    gustComment = "Sammenlignet mot dronevindtoleranse (lav vind)";
  } else {
    const gustWindLevel = ratioLevel(gustWindRatio, t.gust.greenRatio, t.gust.yellowRatio);
    gustLevel = gustRank[gustTolLevel] >= gustRank[gustWindLevel] ? gustTolLevel : gustWindLevel;
    gustComment = `Kast = ${Math.round(gustWindRatio * 100)} % av vindfart`;
  }
  rows.push({
    key: "gust",
    label: "Vindkast",
    value: `${num(gustMs)} m/s`,
    level: gustLevel,
    comment: gustComment,
  });

  const rain = current.precipitationMmH ?? 0;
  rows.push({
    key: "rain",
    label: "Regn",
    value: `${num(rain)} mm/t`,
    level: rain === 0 ? "ok" : rain <= t.rain.yellowMaxMmPerH ? "moderate" : "critical",
    comment: rain === 0 ? "Ingen nedbør" : rain <= t.rain.yellowMaxMmPerH ? "Lett nedbør" : "Mye nedbør",
  });

  const visKm = current.visibilityKm;
  let visLevel;
  let visComment;
  if (visKm == null) {
    const fog = current.weatherCode === 45 || current.weatherCode === 48;
    visLevel = fog ? "critical" : "ok";
    visComment = fog ? "Tåke (fra værkode)" : "Sikt ikke tilgjengelig";
  } else {
    visLevel =
      visKm > t.visibilityKm.greenMin
        ? "ok"
        : visKm >= t.visibilityKm.yellowMin
          ? "moderate"
          : "critical";
    visComment = visLevel === "ok" ? "God sikt" : visLevel === "moderate" ? "Redusert sikt" : "Svært dårlig sikt";
  }
  rows.push({
    key: "vis",
    label: "Sikt",
    value: `${visKm == null ? "--" : num(visKm)} km`,
    level: visLevel,
    comment: visComment,
  });

  const cc = current.cloudCoverPct ?? 0;
  const cloudText = cc <= t.cloudCoverPct.greenMax ? "Klar himmel" : cc <= t.cloudCoverPct.yellowMax ? "Delvis skyet" : "Overskyet";
  rows.push({
    key: "cloud",
    label: "Skydekke",
    value: `${num(cc, 0)} %`,
    level: ratioLevel(cc / 100, t.cloudCoverPct.greenMax / 100, t.cloudCoverPct.yellowMax / 100),
    comment: cloudText,
  });

  const p = current.pressureHpa;
  const pDiff = p == null ? 0 : Math.abs(p - std);
  rows.push({
    key: "pressure",
    label: "Lufttrykk",
    value: `${p == null ? "--" : num(p, 0)} hPa`,
    level: pDiff <= t.pressureHpa.greenBand ? "ok" : pDiff <= t.pressureHpa.yellowBand ? "moderate" : "critical",
    comment: p == null ? "Ikke tilgjengelig" : `±${num(pDiff, 0)} hPa fra ${std} hPa`,
  });

  const cloud = current.cloudCoverPct ?? 0;
  let lightLevel;
  let lightComment;
  if (!current.isDay) {
    lightLevel = "critical";
    lightComment = "Mørkt / kveld";
  } else if (cloud > t.cloudCoverPct.yellowMax) {
    lightLevel = "moderate";
    lightComment = "Overskyet";
  } else {
    lightLevel = "ok";
    lightComment = "Godt lys";
  }
  rows.push({
    key: "light",
    label: "Lys",
    value: current.isDay ? "Dag" : "Natt",
    level: lightLevel,
    comment: lightComment,
  });

  const code = current.weatherCode;
  let cellLevel;
  let cellComment;
  if (THUNDER_CODES.has(code)) {
    cellLevel = "critical";
    cellComment = "Torden i nærheten";
  } else if (SHOWER_CODES.has(code)) {
    cellLevel = "moderate";
    cellComment = "Nedbørs-/bygceller";
  } else {
    cellLevel = "ok";
    cellComment = "Ingen celler";
  }
  rows.push({
    key: "cells",
    label: "Celler",
    value: code != null && CELL_TEXT[code] ? CELL_TEXT[code] : "Ingen",
    level: cellLevel,
    comment: cellComment,
  });

  return rows;
}

export async function getWeather(lat, lon, options = {}) {
  const thresholds = options.thresholds ?? (await loadThresholds());
  const current = await fetchCurrent(lat, lon);
  const rows = evaluateWeather(current, thresholds, options);
  return { current, rows, thresholds };
}