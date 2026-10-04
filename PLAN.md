# Reckon — Project Plan

Reckon is a notepad calculator (in the spirit of Numi and Soulver) that ships as an
installable, offline-first **PWA hosted on GitHub Pages**. No server, no account:
notes live in the browser (IndexedDB), and the app works fully offline after the first visit.

Status: **planning**. Progress is tracked with the checkboxes in [Milestones](#milestones).

---

## 1. Goals and non-goals

**Goals**
- Type freeform text and math line by line, and see each line's answer instantly in a right-hand column.
- Natural syntax: units, currencies, percentages, dates, time zones, variables, line references, totals.
- Runs offline after the first visit and installs as a PWA on desktop and mobile.
- Keeps many notes, with fast search, stored locally in IndexedDB.
- Starts fast, with a small bundle (target: under 200 KB gzipped JS for the first load, excluding lazy chunks).
- Static hosting only (GitHub Pages) and zero backend.

**Non-goals (for now)**
- Accounts, cloud sync, and collaboration. Sync may come later; see §9.
- A symbolic algebra or CAS (solving equations, calculus).
- Spreadsheet features (cells, grids, charts).
- Wolfram-style live data (stocks, weather).

---

## 2. What we learned from the references

| Reference | What to borrow | What to avoid |
|---|---|---|
| **Numi** (numi.app, nikolaeu/numi) | Natural phrases (`$20 in euro - 5% discount`, `today + 2 weeks`), `#` headers, `//` comments, `prev`/`sum`/`avg` tokens, CSS units (px/pt/em with configurable ppi), extensions written in JS | macOS-first, closed source; the CLI version lacks most features |
| **numbr** (antonmedv/numbr, numbr.dev) | TypeScript engine split into parser / nodes / operators / results; **share by URL** (the doc is encoded in the link); `k`/`M` suffixes; text filtering, so surrounding words are ignored; unit tests on nodes and results | Little doc management, with one doc per URL |
| **Soulver** | Line references that update live; subtotals and totals; multi-word variables; percentage phrasing (`x% of y`, `x% off y`, `x as % of y`); calendar math; time zones; headings and dividers; export to text/HTML | Apple-only, paid |
| **Parsify** | Variables; 200+ currencies with hourly rates; time zones by city name; plugins; theming (fonts and colours) | Paywall at 5 lines |
| **Notes Calculator** | Large-number shorthand (`1.5M`, `250k`); hex and binary; conditionals; offline-first design; Markdown-style headings | — |
| **Antinote** | Temporary-first scratchpad feel; `sum`/`average`/`count` keywords; reactive variables; local-only privacy stance; themes | — |
| **Calcator** | Variable autocomplete; IDE-grade editing (multi-cursor, find/replace); number-format settings (separators, precision, rounding mode); tabs with session restore | — |
| **Ganaka** | `$1`, `$last`, `prev` line references; `sum`/`average`/`count`/`min`/`max`; `#` comments; Unicode operators `× ÷ −`; undo/redo; tabs | — |
| **Figr** | A minimal notepad-calculator framing | — |

**Takeaways**
1. The editor *is* the product. CodeMirror 6 gives us multi-cursor, undo, search and autocomplete for free.
2. The parser has to be **forgiving**. A line that doesn't parse shows no result and no error banner. Words it doesn't recognise are treated as labels or context.
3. Answers must be **stable and precise**: decimal arithmetic, so `0.1 + 0.2 = 0.3`.
4. Privacy and offline support are a selling point. Everything is local, and the only network calls fetch exchange rates.

---

## 3. Syntax specification (v1 target)

Each line is evaluated independently, with access to the variables and results of the lines
above it. A line with no recognizable expression produces no result.

### 3.1 Lines and structure
| Input | Meaning |
|---|---|
| `# Groceries` | Heading. It renders bold and resets the `sum` block. |
| `// note to self` | Comment line, never evaluated |
| `rent: $1,200` | Label. Text before `:` is ignored and the rest is evaluated. |
| `3 apples + 2 apples` | Free words are ignored, so this evaluates to `5` |
| `cost = 12 * 4` | Variable assignment. Multi-word names like `monthly rent = 1200` are allowed. |
| (blank line) | Ends the current `sum`/`avg` block |

### 3.2 Numbers
`1,000` · `1_000` · `1.5e3` · `1.5k` · `2M` · `3bn` / `3B` · `0xFF` · `0b1010` · `0o17` · `½` (Unicode fractions)

### 3.3 Operators
| Kind | Forms |
|---|---|
| Arithmetic | `+ - * / ^ mod` · `× ÷ −` · `plus minus times divided by multiplied by` |
| Grouping | `( )` |
| Bitwise (later) | `& \| xor << >>` |
| Factorial | `5!` |
| Implicit multiplication | `2(3+4)`, `2pi`, `3 x 4` (`x` between numbers means times) |

### 3.4 Percentages
| Input | Result |
|---|---|
| `20% of 50` | `10` |
| `50 + 10%` / `50 - 10%` | `55` / `45` |
| `10% off 50` / `10% on 50` | `45` / `55` |
| `5 as % of 20` / `5 is what % of 20` | `25%` |
| `20% of what is 5` | `25` |

### 3.5 References and aggregates
| Token | Meaning |
|---|---|
| `prev` / `ans` | Result of the previous non-empty line |
| `line3` / `$3` | Result of line 3 |
| `sum` / `total` | Sum of results since the last heading or blank line |
| `avg` / `average` | Mean of the same block |
| `count`, `min`, `max` | Same block |
| `subtotal` / `grand total` (later) | Soulver-style nested totals |

### 3.6 Units
- Conversion keywords: `in`, `to`, `as`, `into`, for example `5 km in miles`
- Categories: length, area, volume, mass, temperature, time/duration, speed, data (`KB`/`KiB`/`MB`/`MiB`…), angle, frequency, energy, power, pressure
- CSS: `px`, `pt`, `em`, `rem`, `%`, configurable via `ppi = 96` and `em = 16px`
- Mixed arithmetic: `1 m + 20 cm` = `1.2 m`. Compound units: `60 km/h in m/s`.
- Unit spelling: singular, plural, and abbreviation (`meter`, `meters`, `m`)

### 3.7 Currency
- Symbols and codes: `$`, `€`, `£`, `¥`, `₹`, `USD`, `eur`, `bitcoin`/`BTC`, `ETH`
- `$30 in EUR`, `€20 + $5` (the result uses the first currency), `100 GBP to yen`
- Rates are fetched at most hourly and cached in IndexedDB. When offline, the last known rates are used, and the result shows a "rates as of …" hint.

### 3.8 Dates and times
- `today`, `now`, `tomorrow`, `yesterday`, `next friday`
- `today + 2 weeks`, `Dec 25 - today` (as a duration), `days until Dec 25`, `3 business days from today` (later)
- Time zones: `now in Tokyo`, `3pm PST in London`, `9:00 EST to CET`
- Durations: `2h 30min in minutes`, `90 days in weeks`

### 3.9 Functions and constants
`sqrt cbrt abs round floor ceil sin cos tan asin acos atan log ln exp min max root fact`
· `round(x, 2)` · angles default to degrees (configurable) · `pi`, `e`, `tau`, `phi`

### 3.10 Output formats
`… in hex` · `in bin` · `in oct` · `in sci` / `scientific` · `in fraction` (later)
· `to 2 dp` (later)

### 3.11 Conditionals (later)
`if x > 10 then 5 else 0`

---

## 4. Architecture

```
┌──────────────────────── UI shell (src/app) ─────────────────────────┐
│ sidebar: note list + search │ editor (CodeMirror 6) │ results column │
└───────────────┬────────────────────────┬────────────────────────────┘
                │ text                   │ per-line results
        ┌───────▼────────────────────────┴────────┐
        │  engine (src/engine) — pure TS, no DOM  │
        │  lexer → Pratt parser → AST → evaluator │
        │  values: Decimal · Quantity(unit) ·     │
        │          Money · DateTime · Duration    │
        │  registries: units · currencies · fns   │
        └───────▲─────────────────────────────────┘
                │ rates (injected)
        ┌───────┴──────────┐     ┌────────────────────────┐
        │ src/data/rates   │     │ src/storage (IndexedDB) │
        │ fetch + cache    │     │ notes · settings · rates│
        └──────────────────┘     └────────────────────────┘
```

### 4.1 Tech stack
| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Engine correctness |
| Build | Vite | Fast, simple static output, first-class PWA plugin |
| UI | Vanilla TS with small modules (no framework) | The UI surface is small, and this keeps the bundle tiny. Revisit Preact or Svelte only if UI state gets hairy. |
| Editor | CodeMirror 6 | Multi-cursor, undo, search, autocomplete, decorations, mobile support |
| Numbers | `decimal.js-light` (or `big.js`) | Exact decimal arithmetic |
| Dates | `Temporal`, with `temporal-polyfill` loaded only when needed | Time zones and calendar math done right |
| Storage | IndexedDB via `idb` | Async, indexed, large capacity. `localStorage` holds tiny UI prefs only. |
| Search | In-memory index built from IndexedDB, with MiniSearch if needed | Fuzzy search across note titles and bodies |
| PWA | `vite-plugin-pwa` (Workbox, `generateSW`) | Precache the app shell; runtime-cache rate APIs |
| Sharing | `lz-string` compressed text in the URL hash | numbr-style links that need no backend |
| Tests | Vitest (engine and storage), Playwright (e2e smoke) | |
| Lint/format | ESLint + Prettier, or Biome | |
| Hosting | GitHub Pages via GitHub Actions | |

### 4.2 Engine design
- **Lexer**: emits tokens with source ranges. Those ranges also drive syntax highlighting, so one tokenizer serves both the evaluator and the editor.
- **Parser**: a Pratt (precedence-climbing) parser that is error tolerant. When a line fails to parse, it retries on the longest parseable substring once unknown words are stripped, which gives "text filtering".
- **Values**: a tagged union, `Num | Quantity | Money | Percent | DateTime | Duration | Bool | Error`. Quantity is a Decimal plus a unit-dimension vector, so conversions and compound units come for free.
- **Document evaluation**: `evaluateDocument(lines, ctx) → LineResult[]`. Scope (variables, line results, current block) flows top to bottom. Results are cached by `(lineText, depsHash)`, so editing line 40 doesn't re-evaluate lines 1–39.
- **Context injection**: rates, the clock, locale, and settings are passed in. The engine never calls `fetch`, `Date.now()`, or `navigator`, which keeps it deterministic in tests.
- **Formatting**: `Intl.NumberFormat` with the user's settings (precision, separators, notation).
- Optionally run in a Web Worker later. The pure API makes that a drop-in change.

### 4.3 Editor integration
- The results column is a ViewPlugin that reads `view.lineBlockAt()` so each result lines up with its source line, wrapped lines included.
- Clicking a result copies it, and the UI shows a toast. Pressing `Mod-Shift-C` copies the current line's result.
- Highlighting uses a custom `StreamLanguage`, or decorations built from engine tokens: numbers, units, variables, keywords, comments, headings.
- Autocomplete covers variables, units, currencies, and functions.
- Mobile gets an accessory row with `+ − × ÷ % ( ) =` and unit and currency shortcuts.

### 4.4 Storage and data model (IndexedDB `reckon`, version 1)
```ts
// store "notes", keyPath "id"
interface Note {
  id: string;          // ULID, sortable
  title: string;       // derived: first heading or first non-empty line
  body: string;
  createdAt: number;
  updatedAt: number;   // index
  pinned: boolean;     // index
  deletedAt?: number;  // soft delete / trash, index
  tags?: string[];     // multiEntry index (later)
}
// store "settings", keyPath "key"  → { key, value }
// store "rates",    keyPath "base" → { base, fetchedAt, rates: Record<string, number> }
```
- Saves are debounced (about 300 ms) and also flushed on `visibilitychange` and `pagehide`.
- Tabs stay in sync through a `BroadcastChannel`, so editing in one tab updates the others.
- On first load the app calls `navigator.storage.persist()` to ask the browser not to evict data.
- Backup and restore use a JSON export of every note. Single notes export as `.txt` or `.md`.
- Schema migrations go in `src/storage/migrations.ts`, keyed by DB version.

### 4.5 Exchange-rate sources (free, CORS-enabled, keyless)
- Fiat: `https://open.er-api.com/v6/latest/USD` (daily), with Frankfurter (`api.frankfurter.app`, ECB data) as the fallback.
- Crypto: CoinGecko simple price API, fetched lazily the first time a crypto unit appears.
- A bundled snapshot of rates (`src/data/rates.snapshot.json`), refreshed at build time, so the very first offline use still works.

### 4.6 Routing and hosting
- Routing is hash based (`#/note/<id>`, `#/share/<payload>`), so GitHub Pages never returns a 404 for deep links.
- Vite sets `base: '/reckon/'`, and the PWA `scope` and `start_url` match it.
- `.github/workflows/deploy.yml` runs build, test, then `actions/upload-pages-artifact` and `actions/deploy-pages` on every push to `main`.

---

## 5. UX
- Two panes on desktop: text on the left, results on the right, with a thin divider. A collapsible sidebar holds the note list.
- Phones get a single column, with each result right-aligned on the same row.
- Light, dark, and system themes, plus an adjustable font size.
- A command palette (`Mod-K`) for new note, search, export, share, and settings.
- Shortcuts: `Mod-N` new note, `Mod-P` or `Mod-K` palette, `Mod-/` toggle comment, `Mod-Shift-C` copy result.
- An empty first-run note doubles as an interactive tutorial (sample lines the user can edit).
- Accessibility: results are readable by screen readers (`aria-live` on the focused line's result), keyboard reachable, and meet WCAG AA contrast.

---

## 6. Settings
Locale; decimal and thousands separators; precision (max decimals); rounding mode;
angle unit (deg or rad); default currency; ppi and em size for CSS units; theme; font size;
rate source on or off (privacy: allow turning off all network calls).

---

## 7. Milestones

### M0 — Scaffold
- [ ] Vite + TS (strict) project, ESLint/Prettier, Vitest
- [ ] GitHub Actions: CI (lint, typecheck, test) and Pages deploy
- [ ] PWA manifest and icons, service worker precaching the shell
- [ ] Hello-world page live at `https://parmsam.github.io/reckon/`
- [ ] Add a `LICENSE` file (MIT)

### M1 — Engine core
- [ ] Lexer with source ranges; Pratt parser; AST; Decimal evaluator
- [ ] Numbers (separators, suffixes `k/M/bn`, hex/bin/oct, scientific)
- [ ] Operators, including word and Unicode forms; implicit multiplication
- [ ] Variables (multi-word), labels, comments, headings, free-text filtering
- [ ] `prev`, `lineN`, `sum`/`total`, `avg`, `count`, `min`, `max`
- [ ] Percentages (all forms in §3.4)
- [ ] Functions and constants (§3.9)
- [ ] Output formats (hex/bin/oct/sci)
- [ ] Golden test suite (`tests/fixtures/*.calc`)

### M2 — Editor
- [ ] CodeMirror 6 setup and theme
- [ ] Aligned results column; click to copy
- [ ] Syntax highlighting from engine tokens
- [ ] Incremental evaluation cache
- [ ] Persist a single note to IndexedDB

### M3 — Notes and storage
- [ ] Multiple notes: create, rename (derived title), pin, delete to trash, restore
- [ ] Sidebar list sorted by pinned, then updatedAt
- [ ] Search across notes
- [ ] Export and import (JSON backup, `.txt`/`.md`)
- [ ] Share link (`#/share/<lz>`) with read-only view and a "Save a copy" action
- [ ] Multi-tab sync via BroadcastChannel; `storage.persist()`

### M4 — Units and currency
- [ ] Unit registry with a dimension vector; conversions; compound units
- [ ] CSS units with ppi and em settings
- [ ] Currency registry (symbols, codes, names); rate fetching and caching; offline snapshot
- [ ] Crypto (lazy)

### M5 — Dates and time
- [ ] Temporal (with polyfill), date and duration values
- [ ] Relative phrases (`today`, `next friday`, `days until …`)
- [ ] Time zones via an IANA city/abbreviation table

### M6 — Polish and v1.0
- [ ] Settings panel (§6)
- [ ] Autocomplete; command palette; keyboard shortcuts; mobile accessory row
- [ ] First-run tutorial note
- [ ] Lighthouse: PWA installable, Performance ≥ 95, Accessibility ≥ 95
- [ ] Playwright smoke tests (type, see result, reload, persisted, offline reload works)

### Later
- [ ] Conditionals and comparisons; bitwise ops
- [ ] Subtotals and grand totals; tag-based sums (Soulver)
- [ ] Custom functions and units defined in a note (`f(x) = x^2 + 1`, `1 sprint = 2 weeks`)
- [ ] Plugin API (sandboxed JS, Numi-style) for user-defined units and functions
- [ ] Optional sync: File System Access API folder, or a GitHub Gist with a user token
- [ ] Workspace tabs (Calcator/Ganaka)
- [ ] Export the note with results as Markdown or HTML

---

## 8. Testing strategy
- **Golden files**: `tests/fixtures/*.calc` hold lines such as `20% of 50 => 10`. One Vitest runner loads them all. Adding syntax means adding fixture lines first.
- **Unit tests** for the lexer, parser, unit conversions, formatting, and the storage repo (`fake-indexeddb`).
- **Determinism**: tests inject a fixed clock, locale `en-US`, and fixed rates.
- **E2E**: Playwright against `vite preview`, covering editing, persistence, and offline behaviour (service worker).

---

## 9. Risks and open questions
| Risk / question | Mitigation / default |
|---|---|
| Ambiguity, e.g. `in` is both "inches" and the conversion keyword, and `m` is both meters and minutes | Context rules: `in` after a quantity, followed by a unit, means convert. `m` means meters and `min` means minutes. Every resolved ambiguity gets a fixture. |
| Free-text filtering hides real mistakes | Show results only when the line parses with confidence. Add an optional "explain" tooltip showing how the line was interpreted. |
| Rate APIs change or rate-limit | Two providers plus a bundled snapshot; failures are non-fatal |
| The browser evicts IndexedDB | `storage.persist()`, export reminders, JSON backup |
| Bundle size creep | Lazy-load the Temporal polyfill, crypto, and the time-zone table. Keep a size budget check in CI. |
| Temporal support varies by browser | Feature-detect and load the polyfill only when needed |
| Sync later? | Out of scope for v1. The data model (ULIDs, `updatedAt`, soft deletes) is sync-friendly by design. |
