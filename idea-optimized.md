# NordFly — Detaljert plan og videreutviklet idé

Dokumentet bygger på `idea.md` og utdyper visjonen med en konkret, teknisk gjennomførbar plan.
Målet er et gratis, keyless og open source-verktøy for dronepiloter, publisert på GitHub Pages.

---

## 1. Visjon og mål

NordFly skal gi dronepiloten et komplett pre-flight-bilde på ett sted:

- **Kart**: ikke bare din egen drone, men også annen lufttrafikk og notamer.
- **Vær**: relevante parametere for flyging, vurdert opp mot den valgte dronen.
- **Pre-flight checklist**: strukturert risikoanalyse før avgang.

Alle funksjoner skal operere med open source-API-er uten nøkler, slik at prosjektet kan
kjøres statisk på GitHub Pages uten backend.

---

## 2. Teknologivalg

| Behov | Valg | Begrunnelse |
|---|---|---|
| Hosting | GitHub Pages (statisk) | Gratis, ingen server |
| Språk | HTML + CSS + JavaScript (ES modules) | Ingen byggesteg nødvendig |
| Kart | Leaflet + OpenStreetMap-tiles | Open source, free, ingen nøkkel |
| Værdata | Open-Meteo | Free og open, ingen API-nøkkel |
| Flytrafikk | OpenSky Network / Avinor (XML/JSON) | Open data, keyless |
| Notam | Åpen notamkilde (se §5) | Må verifiseres |
| Bygg (valgfritt) | Vite + deploy til Pages | Gir modulær struktur senere |

> Statisk hosting betyr at all "server-logikk" må skje i nettleseren. Dette er mulig for
> vær og åpne kart, men setter føringer for hvordan notam/hensyn hentes.

---

## 3. Arkitektur — tre uavhengige «lag»

```
┌─────────────────────────────────────────────────────────────┐
│                     UI (en side, tre paneler)               │
│  ┌──────────────┬─────────────────────────────┬───────────┐ │
│  │ Verktøylinje │       Kart (Leaflet)        │  Sidebar   │ │
│  │ (verktøy,    │  • drone-posisjon           │  (høyre)   │ │
│  │  dronevalg)  │  • notamer (sirkler)        │  • vær     │ │
│  │              │  • luftfartøy (ikoner)      │  • drone   │ │
│  │              │  • værlag (verktøylinje)    │  • sjekkl. │ │
│  └──────────────┴─────────────────────────────┴───────────┘ │
└─────────────────────────────────────────────────────────────┘
        │                 │                      │
   ┌────▼─────┐     ┌─────▼──────┐        ┌─────▼──────┐
   │ Drone-   │     │ Kart-      │        │ Data-      │
   │ katalog  │     │ services   │        │ services   │
   │ (lokal)  │     │ (vær++)    │        │ (traffic)  │
   └──────────┘     └────────────┘        └────────────┘
```

- **Lokal katalog** (statiske JSON-filer i repoet): alle DJI-droner.
- **Data-services**: henter og normaliserer eksterne API-er i nettleseren.
- **UI**: holder seg helt uavhengig av datakildene (enkel å bytte til backend senere).

---

## 4. Del 1 — Kart

### 4.1 Drone-posisjon
- Vis valgt drone som et ikon på kartet.
- Valgfri «simulert» meny for testing (rediger lat/lon), siden nettleseren ikke har
  telemetri fra en ekte drone.
- Rettledningsteam (RLS) og beskyttelsessirkel tegnes rundt posisjonen.

### 4.2 Notamer (NOTAM)
- Notamer hentes fra åpen kilde og tegnes som fargede sirkler/firkanter på kartet.
- Legg-forklaring (legend) forklarer typene:
  - Rød = fareområde / aktivt forbudt
  - Gul = midlertidig begrenset
  - Blå = informasjonsmeldig («check NOTAM»)
- Klikk på en notam for detaljer (sted, tid, gyldighet, ei meldingstekst).

### 4.3 Bemannet luftfart
- Fly (ADS-B via OpenSky Network) vist som ikoner som beveger seg på kartet.
- Ikonet viser høyde/flightnummer ved hover.
- Filtreringsknapp: «vis kun lavtflygende» (under valgt høyde), «vis kun i nærheten».
- Varsel (fargeblink/push-lignende) når trafikk kommer innenfor drone-området.

### 4.4 Værlag på kart
- Toggle for værlag hentet fra Open-Meteo:
  - Nedbørradar (regn/snø)
  - Vind (piler / fargelag)
  - Skydekke
  - Vindkast
- Laget tones semi-transparent slik at kartet forblir lesbart.

---

## 5. Del 2 — Sidebar (pre-flight checklist)

### 5.1 Dronekatalog (lokal JSON)
Struktur for hver modell:

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

Felt som er relevante for vær-vurdering:
- `maksVindMotstand` → brukes i vind-terskler
- `vektGram` → vindfølsomhet kombinert med vind
- `intelliFlying` → gjør-check på varslinger (e.g. kompassfeil ved nedbør)

Katalogen er enkel å utvide for andre merker senere.

### 5.2 Værparametere med fargekoding
For hver parameter vises nåverdi med bakgrunnsfarge; terskler tilpasses **valgt drone**:

| Parameter | Grønn (OK) | Gul (moderat) | Rød (høy risiko) |
|---|---|---|---|
| Vindfart | < 60 % av dronevind | 60–90 % | > 90 % |
| Vindkast | < 70 % av vindfart | 70–90 % | > 90 % |
| Regn | 0 mm/t | 0–2 mm/t | > 2 mm/t |
| Tåke/sikt | > 5 km | 1–5 km | < 1 km |
| Skydekke | > 0 (fint) | delvis | full overskyet |
| Lufttrykk | 1013 ± 5 hPa | ± 5–15 hPa | ± > 15 hPa |
| Lys (sol/UV) | godt lys | overskyet | mørkt/kveldslys |
| PK (punktsky / celle) | ingen | spredte byger | nærliggende torden |

- Fargekoden vises som bakgrunnsfarge på radene i lista.
- Hver rad viser verdi, enhet og evt. kommentar («maks vind for denne drona er X»).
- Data hentes for valgt lokasjon (fra kart eller søk).

### 5.3 Pre-flight checklist
- Interaktiv sjekkliste med avkrysnings-ruter:
  - Drone (batteri, rotorer, GPS, kamera)
  - Batterier/utstyr
  - Luftromsklarering (varsling av RLS/NAV)
  - Vær
  - Notamer
  - **Sjekk dronesoner.no** — bekreft at flyststedet ikke ligger i et forbuds-/restriksjonsområde
  - **Registrert i Ninox** (Luftfartstilsynets drone-register) og oppgitt operator-ID på dronen
- Sjekklister kan «sees som ok» / lagres lokalt i nettleseren (localStorage).
- Avhengig av risiko-nivå foreslås ekstra trinn.

### 5.4 Risikovurdering
- Egen seksjon der piloten velger risiko-nivå for kategoriene:

| Risikokategori | Lav | Middels | Høy |
|---|---|---|---|
| Luftrom / trafikk | Ingen trafikk | Liten trafikk nær | Tett trafikk |
| Vær | Gode forhold | Moderat | Høy vind/nedbør/tåke |
| Område/terreng | Åpent | Skuger/bygninger | Tett bebyggelse |
| Person-/dyrtetthet | Øde | Spredt | Mennesker i nærhet |
| Erfaring/kompetanse | Mange flytimer | Noe | Nybegynner |

- Samlet risikoklassifisering = høyeste nivå blant kategoriene (eller egendefinert vekt).
- Resultatet skal vises tydelig (f.eks. «Risiko: HØY — vurder å avbryte»).

---

## 6. Fremtidig funksjon — Serverhosting / Oppdrag

> Skal komme senere, men planlegges nå så arkitekturen støtter det uten omskriving.

- **Lage oppdrag**: navn, valg av drone, lokasjon (punkt på kart), tidspunkt.
- **Automatisk loggføring** når oppdrag opprettes:
  - Vær-verdier
  - Notamer i området
  - Fly i nærheten
  - Valgt risikoanalyse
- **Manuell rapport** etter hendelse: skade på drone/personer, frivillig skjemafelt.
- **Lagring**: som utgangspunkt lokalt (localStorage + eksport til JSON).
- **Senere**: mot et frivillig backend (f.eks. serverless Firebase/Supabase) slik at
  oppdrag kan deles — beholdes keyless der det er mulig.

---

## 7. Datakilder (open source / keyless)

| Kilde | Bruk | Nøkkel? |
|---|---|---|
| Open-Meteo | Vær, radar, vind | Nei |
| Leaflet + OSM | Kart | Nei |
| OpenSky Network | ADS-B luftfartøy | Nei (rate-begrenset) |
| Avinor Åpne-API | Avgang/landingstider, evt. luftfartøy i Norge | Nei |
| NOTAM (kilde må verifiseres) | Notamer | Må avklares |

> **Viktig**: Notam-API-er har ofte krav om nøkkel/registrering. Før oppsett verifiseres
> hvilke keyless notam-kilder som faktisk er tilgjengelige (se §10 «Åpne punkter»).

---

## 8. Filer og mappestruktur (plan)

```
NordFly/
├── index.html              # Hovedside (layout + paneler)
├── style.css               # Tema, fargekoding
├── app.js                  # Oppstart, sammenkobling av moduler
├── data/
│   ├── drones.json         # DJI-katalog
│   └── thresholds.json     # Standard varslinger
├── js/
│   ├── weather.js          # Open-Meteo-integrasjon
│   ├── traffic.js          # OpenSky / Avinor
│   ├── notam.js            # Notam-normalisering
│   ├── map.js              # Leaflet-oppsett + lag
│   ├── sidebar.js          # Værliste + sjekkliste + risiko
│   ├── risk.js             # Risiko-beregning
│   └── storage.js          # localStorage
└── idea.md / idea-optimized.md
```

---

## 9. Milepæler (kjøreplan)

- **M1 — Skjelett**: `index.html` + Leaflet-kart + tom sidebar-layout.
- **M2 — Vær**: Open-Meteo-integrasjon + værliste med fargekoding (statiske terskler).
- **M3 — Dronekatalog**: `drones.json` + dronevalg som endrer tersklene.
- **M4 — Kart-innhold**: notam-visning + ADS-B-luftfartøy.
- **M5 — Checkilist & risiko**: sjekkliste, risikovurdering, localStorage.
- **M6 — Værlag**: radar/vindlag på kartet.
- **M7 — Oppdrag**: oppdrag-modul (manuelt + automatisk logging).
- **M8 — Publisering**: deploy til GitHub Pages, dokumentasjon, testing.

---

## 10. Åpne punkter som må verifiseres

1. Hvilken(keyless) NOTAM-kilde kan brukes i nettleser uten CORS/nøkkel?
   - Alternativ: integrere mot et åpent ARSOA/BVLOS-case eller bygge en liten parser
     for vedlagte tekstfiler piloten laster ned.
2. Hvor tett skal kartoppdatering for luftfartøy være (rate-limits i OpenSky)?
3. Hvor skal dronekatalog-kilden ligge — i repoet som egen fil eller felles repo?
4. Skal sjekklistene inkludere lovkrav (norsk regelverk, droner over 250 g)?
5. Kartprojeksjon/avgrensning — dekker NordFly hele Norden eller kun Norge?

---

## 11. Designprinsipper

- **Én side, tydelig hierarki**: kart = hovedfokus; sidebar støtter kartet.
- **Fargekoding konsekvent**: grønn/gul/rød brukes identisk i vær, notam og risiko.
- **Ingen nøkler**: all data skal hentes frem-enderens (browser) med åpne API-er.
- **Data → visning**: moduler returnerer normalisert data; UI er «dum» og tegner bare.
- **Utvidbar**: dronekatalog og terskler er data, ikke hardkodet logikk.
```