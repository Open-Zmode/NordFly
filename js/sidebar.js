import { getWeather } from "./weather.js";
import { overallRisk, RISK_LABEL, RISK_MESSAGE, RISK_LEVELS } from "./risk.js";
import { get as storageGet, set as storageSet } from "./storage.js";
import { NOTAM_LEVEL_META } from "./notam.js";
import {
  listMissions,
  saveMission,
  removeMission,
  buildMission,
  withReport,
} from "./missions.js";

let checklistGroups = null;
let riskCategories = null;
let weatherSeq = 0;
const expandedMissions = new Set();

export async function renderWeather(lat, lon, options = {}) {
  const listEl = document.getElementById("weather-list");
  if (!listEl) return null;
  const locEl = document.getElementById("weather-loc");
  const seq = ++weatherSeq;

  listEl.textContent = "";
  const loading = loadingRow();
  listEl.appendChild(loading);

  try {
    const { rows, current } = await getWeather(lat, lon, options);
    if (seq !== weatherSeq) return null;
    loading.remove();
    const temp = current.temperatureC != null ? `${Math.round(current.temperatureC)}°C · ` : "";
    if (locEl) locEl.textContent = `${temp}${lat.toFixed(3)}, ${lon.toFixed(3)}`;
    for (const row of rows) listEl.appendChild(weatherRow(row));
    return { rows, current };
  } catch (err) {
    if (seq !== weatherSeq) return null;
    loading.remove();
    listEl.appendChild(infoRow("Kunne ikke hente værdata"));
    if (locEl) locEl.textContent = "";
    return null;
  }
}

export function renderDroneInfo(drone) {
  const el = document.getElementById("drone-info");
  if (!el) return;
  el.textContent = "";

  if (!drone) {
    const note = makeEl("div", "placeholder", "Ingen drone valgt — statiske terskler brukes.");
    el.appendChild(note);
    return;
  }

  const name = makeEl("div", "drone-name", `${drone.merk} ${drone.modell}`);

  const table = document.createElement("dl");
  table.className = "drone-meta";
  const meta = [
    ["Vekt", `${drone.vektGram} g`],
    ["Flytid", `${drone.flytidMin} min`],
    ["Maks vind", `${drone.maksVindMotstand} m/s`],
    ["Maks hast.", `${drone.maksHastighetMs} m/s`],
    ["Video", drone.opptaksKvalitet],
  ];
  for (const [label, value] of meta) {
    table.append(makeEl("dt", "", label), makeEl("dd", "", value));
  }

  const flight = makeEl("div", "drone-flight", `Styring: ${(drone.intelliFlying ?? []).join(", ")}`);
  el.append(name, table, flight);
}

export async function renderChecklist() {
  const root = document.getElementById("checklist-root");
  if (!root) return;
  root.textContent = "";

  try {
    if (!checklistGroups) {
      const res = await fetch("./data/checklist.json");
      if (!res.ok) throw new Error(`status ${res.status}`);
      checklistGroups = (await res.json()).groups ?? [];
    }
  } catch {
    root.appendChild(makeEl("div", "placeholder", "Kunne ikke laste sjekkliste"));
    return;
  }

  const state = storageGet("checklist", {}) ?? {};
  for (const group of checklistGroups) {
    root.appendChild(makeEl("div", "ck-group-title", group.title));
    for (const item of group.items) {
      const label = document.createElement("label");
      label.className = `ck-item${state[item.id] ? " done" : ""}`;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!state[item.id];
      checkbox.addEventListener("change", () => {
        state[item.id] = checkbox.checked;
        storageSet("checklist", state);
        label.classList.toggle("done", checkbox.checked);
        updateChecklistProgress();
      });

      label.append(checkbox, makeEl("span", "", item.text));
      root.appendChild(label);
    }
  }
  updateChecklistProgress();
}

export async function renderRisk() {
  const root = document.getElementById("risk-root");
  if (!root) return;
  root.textContent = "";

  try {
    if (!riskCategories) {
      const res = await fetch("./data/risk.json");
      if (!res.ok) throw new Error(`status ${res.status}`);
      riskCategories = (await res.json()).categories ?? [];
    }
  } catch {
    root.appendChild(makeEl("div", "placeholder", "Kunne ikke laste risikovurdering"));
    return;
  }

  const state = storageGet("risk", {}) ?? {};
  for (const cat of riskCategories) {
    const wrap = makeEl("div", "risk-cat");
    wrap.appendChild(makeEl("div", "risk-cat-title", cat.title));
    const opts = makeEl("div", "risk-opts");
    for (const level of RISK_LEVELS) {
      const label = document.createElement("label");
      label.title = cat.options?.[level] ?? "";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = `risk-${cat.id}`;
      input.value = level;
      input.checked = (state[cat.id] ?? "lav") === level;
      input.addEventListener("change", () => {
        state[cat.id] = level;
        storageSet("risk", state);
        updateRiskResult(state);
      });
      label.append(input, document.createTextNode(RISK_LABEL[level]));
      opts.appendChild(label);
    }
    wrap.appendChild(opts);
    root.appendChild(wrap);
  }
  updateRiskResult(state);
}

function updateRiskResult(state) {
  const box = document.getElementById("risk-result");
  if (!box || !riskCategories) return;
  const { level } = overallRisk(riskCategories.map((c) => state[c.id] ?? "lav"));
  box.className = `risk-result ${level}`;
  box.textContent = "";
  box.append(
    makeEl("strong", "", `Risiko: ${RISK_LABEL[level]}`),
    makeEl("span", "explain", RISK_MESSAGE[level]),
  );
}

function updateChecklistProgress() {
  const el = document.getElementById("checklist-progress");
  if (!el) return;
  const boxes = [...document.querySelectorAll("#checklist-root input[type=checkbox]")];
  const done = boxes.filter((b) => b.checked).length;
  el.textContent = `${done} / ${boxes.length} fullført`;
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function loadingRow() {
  return makeEl("li", "weather-row", "Henter vær…");
}

function infoRow(text) {
  return makeEl("li", "weather-row", text);
}

function weatherRow(row) {
  const li = document.createElement("li");
  li.className = `weather-row ${row.level}`;

  const main = makeEl("div", "w-main");
  main.append(makeEl("span", "w-label", row.label), makeEl("span", "w-value", row.value));
  li.appendChild(main);

  if (row.comment) li.appendChild(makeEl("div", "w-comment", row.comment));
  return li;
}

export async function renderMissions() {
  const list = document.getElementById("missions-list");
  const count = document.getElementById("missions-count");
  if (!list) return;

  const missions = await listMissions();
  if (count) count.textContent = missions.length ? String(missions.length) : "";
  list.textContent = "";

  if (!missions.length) {
    list.appendChild(makeEl("div", "placeholder", "Ingen oppdrag logget ennå."));
    return;
  }
  for (const mission of missions) list.appendChild(missionItem(mission));
}

export function promptNewMission(getContext) {
  const form = document.getElementById("mission-form");
  if (!form) return;
  form.hidden = false;
  form.textContent = "";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "mission-name-input";
  input.placeholder = "Navn på oppdrag (valgfritt)";

  const saveBtn = makeEl("button", "", "Logg oppdrag");
  saveBtn.type = "button";
  const cancelBtn = makeEl("button", "ghost", "Avbryt");
  cancelBtn.type = "button";

  const row = makeEl("div", "mission-form-row");
  row.append(input, saveBtn, cancelBtn);
  form.appendChild(row);

  const close = () => {
    form.hidden = true;
    form.textContent = "";
  };
  cancelBtn.addEventListener("click", close);
  saveBtn.addEventListener("click", async () => {
    const mission = buildMission({ ...getContext(), name: input.value });
    await saveMission(mission);
    expandedMissions.add(mission.id);
    close();
    await renderMissions();
  });
  input.focus();
}

function missionItem(mission) {
  const item = makeEl("div", "mission-item");
  const head = makeEl("div", "mission-head");

  const title = makeEl("div", "mission-title");
  title.append(
    makeEl("span", "mission-name", mission.name),
    makeEl("span", "mission-date", formatDate(mission.createdAt)),
  );

  const riskLevel = mission.risk?.overall ?? "lav";
  const badge = makeEl("span", `mission-risk ${riskLevel}`, RISK_LABEL[riskLevel] ?? riskLevel);

  const toggle = makeEl("button", "ghost mission-toggle", expandedMissions.has(mission.id) ? "Skjul" : "Vis");
  toggle.type = "button";
  toggle.addEventListener("click", () => {
    if (expandedMissions.has(mission.id)) expandedMissions.delete(mission.id);
    else expandedMissions.add(mission.id);
    renderMissions();
  });

  const del = makeEl("button", "ghost mission-del", "Slett");
  del.type = "button";
  del.addEventListener("click", async () => {
    if (!confirm(`Slette oppdraget «${mission.name}»?`)) return;
    await removeMission(mission.id);
    expandedMissions.delete(mission.id);
    await renderMissions();
  });

  head.append(title, badge, toggle, del);
  item.appendChild(head);

  if (expandedMissions.has(mission.id)) item.appendChild(missionDetail(mission));
  return item;
}

function missionDetail(mission) {
  const wrap = makeEl("div", "mission-detail");

  const meta = makeEl("div", "mission-meta");
  meta.append(
    metaRow("Drone", mission.drone ? `${mission.drone.merk} ${mission.drone.modell}` : "Ingen drone valgt"),
    metaRow(
      "Posisjon",
      mission.location ? `${mission.location.lat.toFixed(4)}, ${mission.location.lon.toFixed(4)}` : "—",
    ),
    metaRow(
      "Sjekkliste",
      mission.checklist ? `${mission.checklist.done} / ${mission.checklist.total} fullført` : "—",
    ),
  );
  wrap.appendChild(meta);

  wrap.appendChild(
    sectionTitle(`Vær (${mission.weather?.time ? formatDateTime(mission.weather.time) : "ikke logget"})`),
  );
  if (mission.weather?.rows?.length) {
    const ul = makeEl("ul", "weather-list mission-weather");
    for (const row of mission.weather.rows) ul.appendChild(weatherRow(row));
    wrap.appendChild(ul);
  } else {
    wrap.appendChild(makeEl("div", "placeholder", "Ingen værdata logget."));
  }

  wrap.appendChild(sectionTitle(`NOTAM i området (${mission.notams?.length ?? 0})`));
  if (mission.notams?.length) {
    const ul = makeEl("ul", "mission-list");
    for (const n of mission.notams) {
      const li = makeEl("li", "mission-row");
      li.append(
        dot(NOTAM_LEVEL_META[n.level]?.color ?? "#888"),
        makeEl("span", "mr-main", n.title ?? n.id ?? "NOTAM"),
        makeEl("span", "mr-side", n.distanceKm != null ? `${n.distanceKm.toFixed(1)} km` : ""),
      );
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  } else {
    wrap.appendChild(makeEl("div", "placeholder", "Ingen NOTAM innenfor 30 km."));
  }

  wrap.appendChild(sectionTitle(`Lufttrafikk i nærheten (${mission.traffic?.length ?? 0})`));
  if (mission.traffic?.length) {
    const ul = makeEl("ul", "mission-list");
    for (const t of mission.traffic.slice(0, 5)) {
      const alt = t.altitudeBaroM ?? t.altitudeGeoM;
      const li = makeEl("li", "mission-row");
      li.append(
        makeEl("span", "mr-main", t.callsign || "?"),
        makeEl("span", "mr-side", alt != null ? `${Math.round(alt)} m` : ""),
        makeEl("span", "mr-side", t.distanceKm != null ? `${t.distanceKm.toFixed(1)} km` : ""),
      );
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
  } else {
    wrap.appendChild(makeEl("div", "placeholder", "Ingen registrerte fly."));
  }

  wrap.appendChild(sectionTitle("Rapport"));
  wrap.appendChild(reportForm(mission));

  return wrap;
}

function reportForm(mission) {
  const form = makeEl("div", "mission-report");
  const r = mission.report ?? {};

  const incident = document.createElement("label");
  incident.className = "report-incident";
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!r.incident;
  incident.append(cb, makeEl("span", "", "Hendelse inntruffet"));

  const droneDmg = reportField("Skade på drone", r.droneDamage);
  const personDmg = reportField("Skade på personer", r.personDamage);
  const notes = reportField("Notater", r.notes);

  const save = makeEl("button", "", "Lagre rapport");
  save.type = "button";
  save.addEventListener("click", async () => {
    const updated = withReport(mission, {
      incident: cb.checked,
      droneDamage: droneDmg.input.value,
      personDamage: personDmg.input.value,
      notes: notes.input.value,
    });
    await saveMission(updated);
    await renderMissions();
  });

  form.append(incident, droneDmg.label, personDmg.label, notes.label, save);
  return form;
}

function reportField(labelText, value) {
  const label = document.createElement("label");
  label.className = "report-field";
  label.appendChild(makeEl("span", "report-label", labelText));
  const input = document.createElement("textarea");
  input.rows = 2;
  input.value = value ?? "";
  label.appendChild(input);
  return { label, input };
}

function metaRow(label, value) {
  const row = makeEl("div", "mission-meta-row");
  row.append(makeEl("span", "mm-label", label), makeEl("span", "mm-value", value));
  return row;
}

function sectionTitle(text) {
  return makeEl("div", "mission-section-title", text);
}

function dot(color) {
  const s = makeEl("span", "lg-dot");
  s.style.background = color;
  return s;
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("nb-NO", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("nb-NO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}