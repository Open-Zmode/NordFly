export const NOTAM_LEVEL_META = {
  forbidden: { color: "#e5484d", label: "Forbudt / fareområde" },
  restriction: { color: "#e5a500", label: "Midlertidig begrenset" },
  info: { color: "#4da3ff", label: "Informasjon" },
};

export const NOTAM_LABEL = { forbidden: "Forbudt", restriction: "Begrenset", info: "Info" };

export function normalizeNotams(input) {
  const list = Array.isArray(input) ? input : input?.notams ?? [];
  return list.map((n) => ({
    id: n.id ?? n.title ?? `notam-${list.indexOf(n)}`,
    title: n.title ?? n.name ?? "NOTAM uten tittel",
    level: normalizeLevel(n.type ?? n.level ?? "info"),
    lat: n.lat ?? n.latitude,
    lon: n.lon ?? n.longitude,
    radiusM: n.radiusM ?? n.radius ?? 5000,
    start: n.start ?? n.validFrom,
    end: n.end ?? n.validTo,
    message: n.message ?? n.description ?? "",
    source: n.source ?? "ukjent",
  }));
}

function normalizeLevel(value) {
  const v = String(value ?? "").toLowerCase();
  if (v.includes("forb") || v.includes("forbidden") || v === "red" || v === "fare" || v === "danger")
    return "forbidden";
  if (v.includes("begr") || v.includes("restrict") || v === "yellow" || v === "limitert")
    return "restriction";
  return "info";
}

export async function loadNotams() {
  const res = await fetch("./data/notam.json");
  if (!res.ok) throw new Error(`Kunne ikke laste data/notam.json (${res.status})`);
  const data = await res.json();
  return normalizeNotams(data);
}

export function parseNotamUpload(text) {
  const data = JSON.parse(text);
  if (Array.isArray(data)) return normalizeNotams(data);
  if (data?.type === "FeatureCollection") {
    const features = (data.features ?? []).map((f) => {
      const g = f.geometry ?? {};
      const coords = g.type === "Point" ? g.coordinates : null;
      const p = f.properties ?? {};
      return {
        id: p.id ?? p.score ?? f.id,
        title: p.name ?? p.title ?? p.type ?? "Soner",
        type: p.type ?? p.color ?? "info",
        lat: coords ? coords[1] : null,
        lon: coords ? coords[0] : null,
        radiusM: p.radiusM ?? p.radius ?? (g.type === "Point" ? 5000 : undefined),
        start: p.start ?? p.validFrom,
        end: p.end ?? p.validTo,
        message: p.message ?? p.description ?? "",
        source: p.source ?? "fil",
      };
    });
    return normalizeNotams(features);
  }
  return normalizeNotams(data.notams ?? []);
}