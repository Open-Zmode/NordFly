# NordFly

Pre-flight-kontroll for droner. Perfekt for norske / nordiske forhold. Kjører **100 % statisk** på GitHub Pages — ingen backend, ingen API-nøkler.

## Funksjoner

- **Vær** — sanntidsforhold fra [Open-Meteo](https://open-meteo.com) (vind, vindkast, regn, skydekke, sikt, lufttrykk, lys, celler), fargekodet mot valgt drone.
- **Dronekatalog** — lokalt kartotek (`data/drones.json`). Å velge drone setter vindtoleransen for hele vurderingen.
- **Kart-innhold** — NOTAM-/sonesoner med alvorlighetsnivå, og ADS-B-lufttrafikk i nærheten.
- **Værlag** — regn-, vind-, skydekke- og vindkastlag som rute over kartet (samplingsrute fra Open-Meteo).
- **Sjekkliste & risiko** — interaktiv pre-flight-sjekkliste med grupper, og risikovurdering som regnes sammen til en totalrisiko.
- **Oppdrag** — logg et oppdrag med automatisk snapshot (drone, posisjon, vær, NOTAM, trafikk, risiko, sjekkliste) og manuell rapport etter hendelse. Eksport til JSON.

## Teknologi & datakilder

| Del | Kilde |
| --- | --- |
| Kart | Leaflet + OpenStreetMap-tiles |
| Vær (punkt + rute) | Open-Meteo (`current=`, `wind_speed_unit=ms`) |
| Lufttrafikk | OpenSky Network (fritt, rate-limited) |
| NOTAM | Bundlet demosett + opplasting av egen JSON/GeoJSON (se kjente begrensninger) |

### Kjente begrensninger

- **OpenSky blokkeres av CORS** fra nettleseren. Appen faller da tilbake til demodata (`source: "demo"`). Live-hending koden ligger igjen i `js/traffic.js`.
- **Ingen keyless NOTAM-kilde med CORS** er funnet. Appen bruker et bundlet sett (`data/notam.json`) + parser for opplastede filer.

## Lokal kjøring

```sh
python3 -m http.server 8000 --directory .
# åpne http://localhost:8000
```

Ingen byggesteg — ren HTML + CSS + ES-moduler.

## Deploy til GitHub Pages

1. Push denne mappen som repo-rot.
2. På GitHub: **Settings → Pages → Deploy from a branch → `main` / (root)**.
3. Klart — alt bruker relative stier, så det fungerer under `https://<bruker>.github.io/NordFly/`.

`.nojekyll` ligger i roten.

## Filstruktur

```
NordFly/
├── index.html            # Layout (toolbar + kart + sidebar)
├── style.css             # Tema + fargekoding (ok/moderate/critical)
├── app.js                # Kobler sammen modulene
├── logo.png              # Logo (toolbar + favicon)
├── .nojekyll             # GitHub Pages
├── LICENSE               # NordFly License (source-available)
├── data/
│   ├── drones.json       # DJI-kartotek
│   ├── thresholds.json   # Terskler (data, ikke hardkodet)
│   ├── notam.json        # Bundlet demo-NOTAM
│   ├── checklist.json    # Sjekkliste-grupper
│   └── risk.json         # Risikokategorier
└── js/
    ├── map.js            # Leaflet + lag (notam, trafikk, værlag)
    ├── weather.js        # Open-Meteo hent/normaliser/vurder
    ├── weather-layers.js # Værlag-rute fra Open-Meteo
    ├── traffic.js        # OpenSky + demo-fallback
    ├── notam.js          # NOTAM-normalisering + opplasting
    ├── drones.js         # Dronekartotek
    ├── thresholds.js     # Innlasting av terskler
    ├── risk.js           # Risikoberegning
    ├── missions.js       # Oppdrag-modell/lagring/eksport
    ├── sidebar.js        # Sidebar-rendering
    └── storage.js        # localStorage-wrapper
```

## Design
- Fargekoding grønn/gul/rød er konsekvent i vær, kartlag, NOTAM og risiko.
- Data (dronekartotek, terskler, NOTAM, sjekkliste, risiko) bor i `data/`, ikke i kode.
- Moduler returnerer normalisert data; UI tegner «dumt».

## Lisens

NordFly bruker en **egen lisens** (`LICENSE`), ikke en standardåpen lisens.

- **Du kan:** bruke NordFly selv, uten modifisering, til personlige/ikke-kommersielle formål.
- **Du kan ikke:** kopiere, redistribuere, modifisere, putte koden i andre prosjekter,
  eller bruke den kommersielt — uten skriftlig tillatelse fra rettighetshaver.

Dette er en kilde-tilgjengelig (`source-available`) lisens: koden er synlig på GitHub,
men kopiering er ikke lisensiert. Skal du i stedet la folk gjenbruke fritt, bytt til MIT
eller Apache-2.0 — men da medgir du kopiering.