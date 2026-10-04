<p align="center">
  <a href="https://parmsam.github.io/reckon/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
      <img src="docs/logo-light.svg" alt="Reckon" width="300">
    </picture>
  </a>
</p>

<p align="center"><strong>A notepad that does the math.</strong><br>
Type text and numbers naturally, and see the answers line by line.</p>

<p align="center">
  <a href="https://parmsam.github.io/reckon/"><strong>Open Reckon →</strong></a>
</p>

<p align="center">
  <a href="https://github.com/parmsam/reckon/actions/workflows/ci.yml"><img src="https://github.com/parmsam/reckon/actions/workflows/ci.yml/badge.svg" alt="CI status"></a>
  <a href="https://github.com/parmsam/reckon/actions/workflows/deploy.yml"><img src="https://github.com/parmsam/reckon/actions/workflows/deploy.yml/badge.svg" alt="Deploy status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-f2a541" alt="License: MIT"></a>
  <img src="https://img.shields.io/badge/PWA-works%20offline-1c1b22" alt="PWA: works offline">
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/screenshot-dark.png">
    <img src="docs/screenshot-light.png" alt="Reckon showing a freelance invoice note: each line's answer appears in a column on the right, with a sidebar listing other notes." width="900">
  </picture>
</p>

Reckon is a free, open-source take on notepad calculators like [Numi](https://numi.app) and
[Soulver](https://soulver.app). It runs in any browser, installs as an app, works offline, and keeps your notes on your
own device.

## Features

**Available now**
- **Answers as you type**, aligned beside each line. Click an answer, or press <kbd>⌘/Ctrl</kbd> <kbd>⇧</kbd> <kbd>C</kbd>, to copy it.
- **Natural syntax**: `20% of 50`, `10% off 80`, `5 as % of 20`, `3 apples + 2 apples`
- **Variables and references**: `hourly rate = 85`, `prev`, `line3`, `sum`, `avg`, `count`, `min`, `max`
- **Precise decimals**: `0.1 + 0.2` is `0.3`, not `0.30000000000000004`
- **Many notes** with search, pinning, trash and undo
- **Share links**: the note is compressed into the URL itself, so no server ever sees it
- **Backup and restore** as JSON, plus import of `.txt` and `.md` files
- **Syncs between open tabs** and works offline once loaded
- **Light and dark themes**, a phone layout, and screen reader support

**Coming next** (see the [roadmap](PLAN.md#7-milestones))
- **Units**: `5 km in miles`, `60 km/h in m/s`, `1 m + 20 cm`, data sizes, temperatures, CSS `px`/`em`
- **Currencies and crypto**: `$30 in EUR`, with cached rates that keep working offline
- **Dates and time zones**: `today + 2 weeks`, `days until Dec 25`, `3pm PST in London`
- **Settings, autocomplete and a command palette**

## Syntax at a glance

| What | Examples |
|---|---|
| Numbers | `1,000` · `1_000` · `1.5e3` · `1.5k` · `2M` · `3bn` · `2 million` · `0xFF` · `0b1010` · `½` |
| Operators | `+ - * / ^ mod !` · `× ÷ −` · `plus`, `times`, `divided by` · `3 x 4` · `2(3 + 4)` · `2pi` |
| Percentages | `20% of 50` · `50 + 10%` · `10% off 50` · `10% on 50` · `5 as % of 20` · `5 is what % of 20` · `20% of what is 5` |
| Variables | `rent = 1,200` · multi-word names: `monthly rent * 12` |
| References | `prev` / `ans` (last answer) · `line3` (answer on line 3) |
| Totals | `sum` / `total` · `avg` · `count` · `min` · `max` (each covers the lines since the last heading or blank line) |
| Functions | `sqrt` · `cbrt` · `root(x, n)` · `round(x, 2)` · `floor` · `ceil` · `abs` · `sin` / `cos` / `tan` (degrees) · `log` · `ln` · `exp` · `fact` |
| Constants | `pi` / `π` · `e` · `tau` · `phi` |
| Output formats | `255 in hex` · `10 in binary` · `8 as oct` · `1500 in sci` |
| Structure | `# Heading` · `// comment` · `label: 42` (text before a colon is ignored) |

A line Reckon can't make sense of shows no answer, never a wrong one.

## Your data
- Notes are stored in your browser (IndexedDB). There are no accounts, no servers and no analytics.
- Clearing site data deletes your notes, so use **Export all notes** (sidebar footer) for a backup.
- A share link holds the whole note in the part of the URL after `#`, which browsers never send to a server.

## Development
Requires Node 22+.

```sh
npm install
npm run dev          # http://localhost:5173/reckon/
npm test             # unit and golden tests (Vitest)
npm run test:e2e     # browser tests (Playwright, desktop and mobile)
npm run lint && npm run typecheck
npm run screenshots  # regenerate the README screenshots
```

Every push to `main` runs CI and deploys to GitHub Pages.

- [PLAN.md](PLAN.md) has the product spec, full syntax reference and roadmap.
- [AGENTS.md](AGENTS.md) covers project structure, conventions and how-to recipes (adding a unit, a function, or new syntax).

Built with TypeScript, Vite, CodeMirror 6, decimal.js, IndexedDB (via `idb`) and vite-plugin-pwa.

## How Reckon compares
Reckon builds on ideas from these notepad calculators. Details come from each project's site or repo as of
October 2026. "See site" means we didn't confirm the detail.

| App | Platforms | Open source | Price | Ideas Reckon borrows |
|---|---|---|---|---|
| **Reckon** | Any browser; installable PWA | ✅ [MIT](LICENSE) | Free | Works offline, stores everything locally, shares notes by link |
| [Numi](https://numi.app) | macOS, Windows, Linux CLI, Alfred | CLI only ([repo](https://github.com/nikolaeu/numi)) | See site | Natural phrases (`$20 in euro - 5% discount`), `#` headers, `prev`/`sum`/`avg`, CSS units, JS extensions |
| [numbr](https://numbr.dev) | Web, Chrome extension | ✅ ([repo](https://github.com/antonmedv/numbr)) | Free | TypeScript parser/evaluator split, share by URL, `k`/`M` suffixes, ignores surrounding text |
| [Soulver](https://soulver.app) | macOS, iOS, iPadOS | ❌ | Paid | Live line references, subtotals and totals, multi-word variables, percentage phrasing, calendar math |
| [Parsify](https://parsify.app) | macOS, Windows, web | ❌ | Free (5 lines) or €30 one-time | Over 200 currencies with hourly rates, time zones, plugins, theming |
| [Notes Calculator](https://notescalculator.com) | Mac, Windows, Linux, iOS, Android, web | ❌ | One free note; lifetime purchase for more | Large-number shorthand, hex/binary, conditionals, offline-first |
| [Antinote](https://antinote.io) | macOS | ❌ | See site | Scratchpad feel, `sum`/`average`/`count`, reactive variables, local-only privacy |
| [Calcator](https://calcator.app) | macOS, Windows, Linux | See site | Free | Variable autocomplete, multi-cursor editing, number-format settings, tabs |
| [Ganaka](https://github.com/spdeepak/Ganaka) | macOS 14+ | ✅ | Free | `$1`/`$last` line refs, `min`/`max`/`count`, Unicode `× ÷ −`, tabbed workspaces |
| [Figr](https://www.figr.app) | See site | See site | See site | The minimal notepad-calculator framing |

Thanks to all of them for the inspiration. PLAN.md §2 has a longer breakdown, including what Reckon avoids.

## License
Reckon is released under the [MIT License](LICENSE). © 2026 Sam Parmar.
