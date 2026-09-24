import { get as storageGet, set as storageSet } from "./storage.js";
import { distanceKm } from "./traffic.js";

const MISSIONS_KEY = "missions";

export async function listMissions() {
  return storageGet(MISSIONS_KEY, []) ?? [];
}

export async function getMission(id) {
  return (await listMissions()).find((m) => m.id === id) ?? null;
}

export async function saveMission(mission) {
  const all = await listMissions();
  const idx = all.findIndex((m) => m.id === mission.id);
  if (idx >= 0) all[idx] = mission;
  else all.unshift(mission);
  storageSet(MISSIONS_KEY, all);
  return mission;
}

export async function removeMission(id) {
  const all = await listMissions();
  storageSet(MISSIONS_KEY, all.filter((m) => m.id !== id));
}

export function newMissionId() {
  return `msn-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function buildMission(context) {
  return {
    id: newMissionId(),
    createdAt: new Date().toISOString(),
    name: context.name?.trim() || defaultName(context.location),
    drone: context.drone ?? null,
    location: context.location ?? null,
    weather: context.weather ?? null,
    notams: context.notams ?? [],
    traffic: context.traffic ?? [],
    risk: context.risk ?? null,
    checklist: context.checklist ?? null,
    report: null,
  };
}

export function withReport(mission, report) {
  return { ...mission, report: { ...report, at: new Date().toISOString() } };
}

export function nearbyNotams(notams, location, maxKm = 30) {
  if (!location) return [];
  return notams
    .map((n) => ({
      ...n,
      distanceKm:
        n.lat != null && n.lon != null
          ? distanceKm(location.lat, location.lon, n.lat, n.lon)
          : null,
    }))
    .filter((n) => n.distanceKm != null && n.distanceKm <= maxKm)
    .sort((a, b) => a.distanceKm - b.distanceKm);
}

export function exportMissionsJson(missions, filename = "nordfly-oppdrag.json") {
  const blob = new Blob([JSON.stringify(missions, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function defaultName(location) {
  if (!location) return "Oppdrag";
  return `Oppdrag ${location.lat.toFixed(3)}, ${location.lon.toFixed(3)}`;
}