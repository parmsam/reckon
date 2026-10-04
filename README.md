# Reckon

**A notepad that does the math.** Type text and numbers naturally, and see answers line by line.
Reckon is a free, open-source, offline-first take on [Numi](https://numi.app) and [Soulver](https://soulver.app), built
as an installable web app.

> 🚧 **Status: planning.** See [PLAN.md](PLAN.md) for the spec and roadmap.
> Live (once deployed): https://parmsam.github.io/reckon/

```
# Trip budget
flights: $420 × 2                    $840
hotel = 3 nights × $135              $405
food: 25% of hotel                   $101.25
sum                                  $1,346.25

# Misc
$30 in EUR                           €25.80
5 km in miles                        3.11 mi
today + 2 weeks                      Jan 29, 2026
now in Tokyo                         9:00 PM
1.5k + 250                           1,750
0xFF in bin                          0b11111111
```

## Features (planned)
- **Line-by-line results** that update as you type. Click a result to copy it.
- **Natural syntax**: `20% of 50`, `$30 in EUR`, `10% off 80`, `5 as % of 20`, `3 apples + 2 apples`
- **Variables and references**: `rent = 1200`, `prev`, `line3`, `sum`, `avg`, `count`, `min`, `max`
- **Units**: length, mass, volume, temperature, time, speed, data, angles, CSS (`px`/`pt`/`em`), and compound units like `km/h`
- **Currencies and crypto** with cached rates that keep working offline
- **Dates and time zones**: `days until Dec 25`, `3pm PST in London`
- **Precise decimals**: `0.1 + 0.2 = 0.3`
- **Many notes** stored locally in IndexedDB, with search, pinning, trash, and import/export
- **Share links**: the note is compressed into the URL, with no server involved
- **Installable PWA** that works fully offline, on desktop or mobile
- **Private by default**: no accounts and no analytics. The only network calls fetch exchange rates, and you can turn those off.

## Development
Requires Node 22+.

```sh
npm install
npm run dev        # http://localhost:5173/reckon/
npm test
npm run build && npm run preview
```

Project structure, conventions, and recipes are in [AGENTS.md](AGENTS.md).

## Deployment
Every push to `main` runs CI, which builds the app and deploys `dist/` to GitHub Pages through GitHub Actions
(**Settings → Pages → Source: GitHub Actions**).

## Tech
TypeScript · Vite · CodeMirror 6 · decimal.js-light · Temporal (with polyfill) · IndexedDB (`idb`) · vite-plugin-pwa · Vitest · Playwright

## Inspiration
[Numi](https://github.com/nikolaeu/numi) ·
[numbr](https://github.com/antonmedv/numbr) ·
[Soulver](https://soulver.app) ·
[Parsify](https://parsify.app) ·
[Notes Calculator](https://notescalculator.com) ·
[Antinote](https://antinote.io) ·
[Figr](https://www.figr.app) ·
[Calcator](https://calcator.app) ·
[Ganaka](https://github.com/spdeepak/Ganaka)

## License
MIT
