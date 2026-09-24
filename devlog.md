# NordFly — Devlog & Handoff Document

> **READ THIS FIRST.** This file is the single entry point for any AI session or developer
> starting work on NordFly. Always start here before writing code. It summarizes the plan,
> build order, and current progress so a fresh session can pick up where the last one left off.

---

## 1. Project overview

NordFly is a **free, keyless, open-source drone pre-flight tool** for drone pilots,
targeting Nordic / Norwegian conditions. It runs **100% static** on GitHub Pages — all
"server logic" happens in the browser. No API keys anywhere.

The full product vision and requirements live in:

- **`idea-optimized.md`** — THE detailed spec/plan. Read this file fully and follow it.
- `idea.md` — original raw notes (Norwegian). Background context only.

If anything in this file contradicts `idea-optimized.md`, the spec wins — but flag the
contradiction in the session log.

### Core features (one page, three panels)

1. **Map** (mid) — Leaflet + OSM tiles.
   - Your drone position + RLS rule lines / protection circle (simulated position for now)
   - NOTAMs drawn as colored circles (red = forbidden, yellow = limited, blue = info)
   - Manned air traffic (ADS-B via OpenSky Network), filterable by altitude/distance
   - Toggleable weather layers (rain radar, wind, cloud cover, gusts) from Open-Meteo
2. **Sidebar** (right) — pre-flight checklist.
   - Local DJI drone catalog (`data/drones.json`) with drone-dependent thresholds
   - Weather parameters color-coded green/yellow/red based on the **selected drone**
   - Interactive pre-flight checklist (batteries, airspace, NOTAM, dronesoner.no, Ninox reg.)
   - Risk assessment (Low/Medium/High per category → overall risk level)
3. **Toolbar** (top) — tools, drone selection, weather-layer toggles.

### Future (design now, build later)
- Mission creation with automatic logging of weather/NOTAM/traffic/risk.
- Optional export to JSON / later optional backend (Firebase/Supabase). Keep keyless where possible.

---

## 2. Hard constraints (do not break these)

Target: **GitHub Pages**, statically served from the repo root.

- **No backend server.** Static hosting only → all data fetching happens in the browser.
- **No API keys.** Only open, keyless sources (see `idea-optimized.md` §7).
- **No build step required** to run the base app (plain HTML + CSS + ES modules).
  Vite is acceptable later for modularity, but must keep deploying to static Pages.
- Folders under `/home/ruben/Work/NordFly` must remain the **root directory** for GitHub Pages.
  Push the repo so Pages is served **from the root** (Settings → Pages → Deploy from branch → `/ (root)`).

### GitHub Pages rules (critical)
- **Relative paths ONLY.** Pages may serve under a subpath like
  `https://<user>.github.io/NordFly/`, so never use absolute paths like `/js/map.js`
  or `/data/drones.json` — always `./js/map.js`, `../`, etc. This applies to
  `<script src>`, `<link href>`, `fetch(...)`, and Leaflet tile/layer config.
- **No server-side logic.** No PHP, Node, env vars, or build-time secrets. Everything runs
  in the browser.
- **External APIs must allow CORS** (`Access-Control-Allow-Origin: *`). If a keyless source
  lacks CORS, document it and propose a client-side fallback (see Open Questions #1).
- **ES modules & fetch work fine on Pages** as long as all paths are relative and every
  imported file is actually served (committed to the repo).

### Data sources
All from `idea-optimized.md` §7: Open-Meteo (no key), Leaflet + OSM (no key), OpenSky
Network (no key, rate-limited), Avinor open data (no key). NOTAM source still TBD — see Open Questions.

---

## 3. Architecture (from `idea-optimized.md` §3)

Three independent layers. UI must stay ignorant of data sources:

```
UI (index.html): toolbar | map (Leaflet) | sidebar
        │               │               │
Drone catalog    Map services      Data services
(local JSON)     (weather layers)   (traffic, notam)
```

- **Local catalog** — static JSON in repo (`data/`): all DJI drones + thresholds.
- **Data services** — fetch + normalize external APIs in the browser.
- **UI** — draws normalized data, never talks to APIs directly.

### Planned file structure (`idea-optimized.md` §8)

```
NordFly/                 ← GitHub Pages root
├── index.html           # Main page (layout + panels)
├── style.css            # Theme, color coding (green/yellow/red)
├── app.js               # Startup, wiring modules together
├── data/
│   ├── drones.json      # DJI catalog
│   └── thresholds.json  # Standard warning thresholds
├── js/
│   ├── weather.js       # Open-Meteo integration
│   ├── traffic.js       # OpenSky / Avinor
│   ├── notam.js         # NOTAM normalization
│   ├── map.js           # Leaflet setup + layers
│   ├── sidebar.js       # Weather list + checklist + risk
│   ├── risk.js          # Risk calculation
│   └── storage.js       # localStorage
├── idea.md
├── idea-optimized.md
└── devlog.md            # ← this file
```

---

## 4. Build order & milestones (from `idea-optimized.md` §9)

Follow in order. Each milestone must be **functional** before moving on and note the
completion in the Session Log at the bottom of this file.

- **M1 — Skeleton**: `index.html` + Leaflet map + empty sidebar/toolbar layout. ✅ style.css wired up.
- **M2 — Weather**: Open-Meteo integration + weather list with static color thresholds (not drone-adjusted yet).
- **M3 — Drone catalog**: `data/drones.json` + drone select that changes the thresholds.
- **M4 — Map content**: NOTAM display + ADS-B aircraft (OpenSky).
- **M5 — Checklist & risk**: interactive checklist, risk assessment, localStorage persistence.
- **M6 — Weather layers**: rain/wind/cloud/gust layers on the map.
- **M7 — Missions**: mission module (manual + automatic logging), design-for-future in mind.
- **M8 — Release**: deploy to GitHub Pages, documentation, testing.

**Status:** All milestones M1–M8 complete (2026-09-24). **Ready to deploy** — user pushes to GitHub Pages (`Settings → Pages → Deploy from a branch → / (root)`).

---

## 5. Data model & behavior details

### Drone catalog entry (`data/drones.json`)
```json
{
  "id": "dji-mavic-3",
  "merk": "DJI",
  "modell": "Mavic 3",
  "vektGram": 895,
  "flytidMin": 46,
  "maksVindMotstand": 10.7,
  "maksHastighetMs": 19,
  "intelliFlying": ["GPS", "IMU", "barometer", "nedadrettede sensorer"],
  "opptaksKvalitet": "5.1K"
}
```
Verdi-relevant fields: `maksVindMotstand`, `vektGram`, `intelliFlying`. Catalog should be
easy to extend with other brands later.

### Weather color thresholds (`idea-optimized.md` §5.2) — adjusted to selected drone

| Parameter | Green | Yellow | Red |
|---|---|---|---|
| Wind speed | < 60% of drone wind tolerance | 60–90% | > 90% |
| Gusts | < 70% of wind speed | 70–90% | > 90% |
| Rain | 0 mm/h | 0–2 mm/h | > 2 mm/h |
| Fog/visibility | > 5 km | 1–5 km | < 1 km |
| Cloud cover | clear | partly | overcast |
| Pressure | 1013 ± 5 hPa | ± 5–15 hPa | ± > 15 hPa |
| Light (sun/UV) | good light | overcast | dark/evening |
| Cells (cloud/cell) | none | scattered showers | nearby thunder |

Color = row background; each row shows value + unit + comment (e.g., "max wind for this
drone is X"). Weather fetched for the selected location (map click or search).

### Color coding conventions
- **Green** = OK, **Yellow** = moderate/caution, **Red** = high risk/stop.
- Used identically across weather rows, NOTAM legend, and risk result.
- Define CSS classes (e.g., `.ok`, `.moderate`, `.critical`) in `style.css`.

### NOTAM visualization
Circles/squares colored: red = active forbidden / danger area, yellow = temporary
restriction, blue = info ("check NOTAM"). Click for details (place, time, validity, message).

### Risk assessment (`idea-optimized.md` §5.4)
Categories: airspace/traffic, weather, area/terrain, people/animal density,
experience/competence. Each Low/Medium/High. **Overall = highest level among categories.**
Show result prominently (e.g., "Risiko: HØY — vurder å avbryte").

---

## 6. Coding conventions

- **Plain JS ES modules, no framework** for the base app (Matches `idea.md` intent + no build step).
  Don't add dependencies unless a milestone explicitly needs them.
- Follow the existing file layout above; one concern per module under `js/`.
- Modules return **normalized data**; UI code only renders. Keep UI "dumb".
- Data & thresholds are **data files, not hardcoded logic**.
- Don't add code comments unless they clarify a non-obvious decision.
- Keep everything keyless — never store or request credentials.
- Cooperate with CORS: prefer JSON APIs with `Access-Control-Allow-Origin: *`.
  If a source lacks CORS, document it and propose a fallback in the session log.

---

## 7. Open questions (from `idea-optimized.md` §10) — resolve during dev

1. Which **keyless NOTAM source** works from the browser (CORS/no key)?
   - Fallbacks: open ARSOA/BVLOS case proxy, or a parser for user-downloaded text files.
   - **2026-09-24 finding (M4):** no keyless, CORS-enabled Norwegian NOTAM/UAS-zone feed
     found. dronesoner.no is an interactive checker (Mapbox GL), not a data API; Avinor's
     drone map is an ArcGIS experience; true NOTAM requires registration (IPPC/CFMU).
     Implemented the documented fallback: bundled `data/notam.json` sample + a client-side
     upload parser (`parseNotamUpload`, JSON/GeoJSON). **Still open** — revisit a live feed.
2. How dense should **map updates** for aircraft be (OpenSky rate limits)?
   - **2026-09-24 finding (M4):** refresh every 15 s (`thresholds.traffic.refreshSec`).
     **Blocker:** OpenSky now pins `Access-Control-Allow-Origin` to
     `https://opensky-network.org`, so browser fetches from localhost/GitHub Pages are
     CORS-blocked. `js/traffic.js` therefore falls back to generated demodata and labels
     the source. Integration code is kept for when/if CORS is relaxed.
3. Where should the **drone catalog** live — in-repo file (yes, for now).
4. Should checklists include **legal requirements** (Norwegian rules, drones > 250 g)?
5. **Coverage**: all of Norden or just Norway? (Start Norway-centric; keep it swappable.)

---

## 8. How to run / verify

- Serve the folder locally: `python3 -m http.server 8000` from `/home/ruben/Work/NordFly`,
  open http://localhost:8000 (Leaflet + fetch APIs need http, not file://).
- Verify with **relative paths** exactly as Pages will serve them. A good sanity check:
  serve locally and confirm the site works at `http://localhost:8000/NordFly/` with the
  folder renamed/copied into a `NordFly/` subdirectory (mirrors the `/NordFly/` Pages path).
  Or temporarily edit nothing — just always reference assets with `./` and test accordingly.
- Deployment: push the repo to GitHub → enable Pages from the branch → root. No build step.
- Before every milestone handoff, confirm in the Session Log that the app builds and runs statically.

---

## 9. Session Log — append your work here

> Each AI session or developer MUST append a dated entry below after making changes:
> what was done, what milestone it maps to, what's next, and any open questions/decisions.

### 2026-09-24 — initial setup
- Created this `devlog.md` as the handoff/handbook for all sessions.
- Added explicit GitHub Pages rules: relative paths only, no server-side logic,
  CORS-aware sources; repo root must be Pages root.
- No application code yet. Next step: **M1 — skeleton** (`index.html` + Leaflet + layout).

### 2026-09-24 — M1 skeleton complete
- **M1 done.** Built `index.html` (toolbar + map + sidebar panels), `style.css`
  (Nordic dark theme, `.ok`/`.moderate`/`.critical` color classes defined for M2+),
  `js/map.js` (Leaflet + OSM tiles, simulated drone marker at Trondheim), `app.js`
  (wiring; clicking the map moves the simulated drone marker).
- Leaflet loaded from unpkg CDN (keyless); our own assets use `./` relative paths.
- Verified: all assets serve 200 from `/NordFly/` subpath with `python3 -m http.server`
  (mirrors the GitHub Pages path); JS passes `node --check`; no absolute paths in
  HTML/JS/CSS.
- **Next:** M2 — Open-Meteo integration + weather list with static color thresholds
  (`js/weather.js` + sidebar rendering; drone-adjusted thresholds in M3).
- Note: `.ok/.moderate/.critical` CSS classes now exist in `style.css` (devlog §5 convention).

### 2026-09-24 — M2 weather complete
- **M2 done.** Added `data/thresholds.json` (data-driven thresholds, not hardcoded),
  `js/weather.js`, `js/sidebar.js` (`renderWeather`), wired into `app.js`.
- Open-Meteo (`forecast` + `current=...`, `wind_speed_unit=ms`) is CORS-enabled
  (`Access-Control-Allow-Origin: *`, verified). Vær-list fargekodes mot statisk
  referanse (`droneWindToleranceMs: 10.7`); M3 bytter til valgt drone.
- Decisions flagged for the log:
  - **Gust at low wind**: with wind ≤ 2 m/s the kast:vind-ratio is meaningless, so gusts
    are judged against drone wind tolerance instead; otherwise max(wind-ratio, tolerance-ratio).
  - **Visibility**: Open-Meteo `visibility` is `null` in many models — then level is derived
    from fog weather codes (45/48).
  - **Cloud thresholds**: green ≤ 25 %, yellow ≤ 80 %, red > 80 % ("full overskyet").
  - **Light**: critical only at night; overcast (> 80 %) = moderate.
- Verified: live API test (Trondheim, Trondheim center), boundary cases, `node --check`,
  and all assets serve 200 under `/NordFly/`.
- **Next:** M3 — `data/drones.json` (DJI catalog) + drone select that swaps the wind
  tolerance used by the weather rows.

### 2026-09-24 — M3 drone catalog complete
- **M3 done.** Added `data/drones.json` (7 DJI models; `merk`/`modell`/`vektGram`/
  `flytidMin`/`maksVindMotstand`/`maksHastighetMs`/`intelliFlying`/`opptaksKvalitet`),
  `js/drones.js` (`loadDrones`/`findDrone`), and `js/storage.js` (lightweight
  localStorage wrapper, reused in M5).
- Toolbar drone select (`#drone-select`) now populated and enabled; selection persists
  via localStorage and restores on load.
- Selected drone's `maksVindMotstand` is passed as `windToleranceMs` into
  `getWeather`/`evaluateWeather`; `thresholds.json` `droneWindToleranceMs` remains the
  static fallback when no drone is chosen. Wind-row comment now shows
  "Maks vind for <modell>: X m/s".
- `#panel-drone` shows selected drone details (vekt, flytid, maks vind, etc.), or a
  "statiske terskler" note when none selected.
- Verified: syntax checks, drone-dependent threshold test (vind 7 m/s → Mavic 3
  moderate / Air 3 ok, PASS), all assets 200 under `/NordFly/`.
- **Next:** M4 — map content: NOTAM display + ADS-B aircraft (OpenSky). NOTAM source
  still blocked by open question #1; expect a documented fallback (see §7).

### 2026-09-24 — M4 map content complete
- **M4 done.** New data services `js/traffic.js` (OpenSky fetch + normalize + distance/
  altitude filters) and `js/notam.js` (normalize + JSON/GeoJSON upload parser +
  `NOTAM_LEVEL_META`). New `js/thresholds.js` (shared thresholds loader; `weather.js` now
  imports it). `js/map.js` gained `notamLayer`/`trafficLayer`, `drawNotams` (colored
  circles + popups) and `drawAircraft` (rotated divIcon + popups).
- Toolbar: **Trafikk** / **Lavtfly** / **Notamer** toggles + **Last opp** (NOTAM
  JSON/GeoJSON, persisted in localStorage). Map legend + traffic source note added.
- Fallbacks (documented in §7): OpenSky is CORS-blocked from browser origins → demodata
  fallback; no keyless NOTAM feed → bundled sample + upload parser.
- Verified: syntax, NOTAM normalize/upload-parse, risk calc, traffic filter/distance,
  live OpenSky fetch via node (returned real state, e.g. WIF7E), all assets 200 under
  `/NordFly/`.
- **Next:** M5 — checklist & risk (was done in the same session, see below).

### 2026-09-24 — M5 checklist & risk complete
- **M5 done.** New `data/checklist.json` (grouped items incl. dronesoner.no + Ninox),
  `data/risk.json` (5 categories with per-level descriptions), `js/risk.js`
  (`overallRisk` = highest category level). `js/sidebar.js` renders checklist with
  progress counter and risk radio groups; both persist via `js/storage.js`
  (`checklist`, `risk`) and restore on load. Result box shows
  "Risiko: LAV/MIDDELS/HØY — <anbefaling>".
- **Structure note:** `js/` now also contains `drones.js`, `thresholds.js`, `storage.js`,
  `traffic.js`, `notam.js`, `risk.js` — a superset of the §3 plan; one concern per module.
- Verified: syntax, `overallRisk(['lav','hoy','middels']) === hoy`, JSON validity, all
  assets 200.
- **Next:** M6 — weather layers on the map (rain/wind/cloud/gust) from Open-Meteo.

### 2026-09-24 — M6 weather layers complete
- **M6 done.** New `js/weather-layers.js`: `fetchWeatherGrid` samples a 6×6 Open-Meteo
  grid (`current=precipitation,cloud_cover,wind_speed_10m,wind_direction_10m,
  wind_gusts_10m`, `wind_speed_unit=ms`) and `drawWeatherLayer` renders each layer.
- **Design decision:** Open-Meteo has no raster/tile service, so layers are a
  semi-transparent sampled **grid overlay** (rectangles for regn/skydekke/vindkast,
  rotated arrows for vind) — stays 100 % Open-Meteo, keyless, CORS `*`.
- Wind + gust colors are **relative to the selected drone's wind tolerance** (falls back
  to the static tolerance); rain uses a blue scale, cloud a grayscale by %.
- UI: `#btn-layers` is now a dropdown (`#layer-menu`) with Regn/Vind/Skydekke/Vindkast
  checkboxes, persisted (`weatherLayers`). Grid refreshes on `moveend` (debounced 700 ms),
  on toggle, and recolors when the drone changes. Legend shows active layers.
- Verified: syntax; live 36-point grid fetch; all four render branches via a Leaflet mock
  (found + fixed an out-of-scope `windTol` bug in `cellStyle`); all assets 200 under
  `/NordFly/`.
- **Next:** M7 — missions (create + automatic weather/NOTAM/traffic/risk logging,
  localStorage + JSON export; design for future backend).

### 2026-09-24 — M7 missions complete
- **M7 done.** New `js/missions.js`: mission model + store (`listMissions`, `getMission`,
  `saveMission`, `removeMission`, `buildMission`, `withReport`, `nearbyNotams`,
  `exportMissionsJson`). Store API is **async on purpose** — a future keyless backend
  (Supabase/Firebase or similar) can implement the same interface without touching the UI.
- **Automatic logging:** `buildMissionContext()` in `app.js` snapshots the selected drone,
  location, the last fetched weather (`rows` + raw values), NOTAMs within 30 km, nearby
  traffic, overall risk + per-category levels, and checklist progress.
- **Manual report:** each mission has a report form (hendelse, skade på drone, skade på
  personer, notater) saved back onto the mission with a timestamp.
- **UI:** new sidebar panel «Oppdrag» with «Nytt oppdrag» (inline name form) and
  «Eksporter» (downloads all missions as JSON). Missions list shows name/date/risk badge,
  expandable detail, and delete. `renderWeather` now returns `{ rows, current }` so the app
  can log the weather snapshot.
- **Storage:** `localStorage` key `missions` (newest first); export is a client-side Blob
  download (no backend, no keys).
- Verified: syntax; node tests for the full store lifecycle, default naming, report update,
  30 km NOTAM filtering, and JSON export; all assets 200 under `/NordFly/`.
- **Next:** M8 — release: documentation (README), final cross-browser/testing pass, and
  GitHub Pages deploy notes (`.nojekyll`, relative paths already enforced). User deploys.

### 2026-09-24 — M8 release complete
- **M8 done.** Added `README.md` (Norwegian: features, data sources, lokal kjøring,
  GitHub Pages deploy, filstruktur, known limitations) and `.nojekyll` at repo root.
- **Testing pass — headless Chromium smoke test** (served under `/NordFly/`) caught and
  fixed **three real bugs** that node logic tests could not:
  1. `DEFAULT_CENTER` was an array `[lat, lon]` → no `.lat/.lng`, so the **first load**
     sent `undefined` coordinates to Open-Meteo and OpenSky (weather error until the user
     clicked the map). Changed to `{ lat, lng }` — still a valid Leaflet center.
  2. `demoTraffic` used `t.lat` (undefined) in the drift term → NaN latitude for every
     aircraft → `Invalid LatLng object: (NaN, …)`. Fixed to `t.dLat`.
  3. `renderWeather` never removed its loading row, and two overlapping startup renders
     (setup + drone applySelection) **duplicated the whole list**. Added a `weatherSeq`
     staleness guard + `loading.remove()` on completion.
- **Verified (final pass):** syntax sweep of all modules; every asset 200/204 under
  `/NordFly/` (incl. `.nojekyll`, README); headless load shows 8 weather rows + traffic
  note with demo fallback + risk result with no console errors; all relative paths (no
  absolute), no build step.
- **Deploy (user):** push repo root, enable Pages from `main` at `/ (root)`. `.nojekyll`
  ready. Known runtime notes: OpenSky is CORS-blocked from GitHub Pages (auto-falls back
  to demo — flag in UI), Open-Meteo works (CORS `*`).
- **Open items §7** remain for future work: keyless NOTAM feed, OpenSky live via Pages,
  PWA/offline, Vite path (if ever needed).

### 2026-09-24 — License added (source-available)
- Added `LICENSE` (custom **NordFly License**): use allowed for personal, non-commercial
  purposes; copying, redistribution, modification, embedding, and commercial use require
  written permission. Chosen deliberately over standard FOSS licenses (MIT/Apache/GPL/CC
  all permit copying). Documented in README under «Lisens».
- Added `logo.png` as toolbar logo + favicon earlier in the session.