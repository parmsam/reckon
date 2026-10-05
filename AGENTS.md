# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo.
Read **PLAN.md** first. It holds the product spec, the syntax reference (§3), the architecture (§4), and the milestone checklist (§7).

## Project in one paragraph
Reckon is a notepad calculator PWA: the user types text and math line by line, and answers appear in a
right-hand column. It is a static site (Vite + TypeScript + CodeMirror 6) deployed to GitHub Pages, and it stores
notes in IndexedDB. There is no backend. The only network calls fetch exchange rates.

## Commands
Use Node 22+ and npm.

```sh
npm install
npm run dev          # Vite dev server
npm run build        # typecheck + production build to dist/
npm run preview      # serve dist/ (needed to test the service worker)
npm test             # Vitest (engine + storage)
npm run test:e2e     # Playwright against a production build (Chromium desktop + mobile)
npm run update-rates # refresh the bundled exchange-rate snapshot
npm run screenshots  # regenerate README screenshots
npm run lint         # ESLint + Prettier check
npm run typecheck    # tsc --noEmit
```
Before calling a task done, run `npm run lint && npm run typecheck && npm test`.

## Layout
```
src/
  engine/        PURE calculation engine. No DOM, fetch, Date.now, or navigator.
    lexer.ts       raw tokens with source ranges (also used for highlighting)
    resolve.ts     classifies words: variables, keywords, functions; drops descriptive text
    parser.ts      Pratt parser over resolved tokens
    ast.ts
    evaluate.ts    evaluates one line's AST given an Env (vars, prev, block, settings)
    document.ts    evaluates a whole note: labels, comments, headings, assignments, blocks
    values.ts      Decimal constructor `D`, the Value union, CalcError
    functions.ts   functions and constants
    format.ts      result formatting (Intl.NumberFormat + settings)
    context.ts     engine Settings and defaults
    dates.ts       date phrase grammar (DateSpec), months/weekdays, time zone names
    datetime.ts    date math with Temporal: resolve specs, add durations, differences, formatting
    units/         units as data: dims.ts (dimension vectors), registry.ts (physical units),
                   currency.ts (fiat + crypto), quantity.ts (conversion, unit algebra, formatting)
    line.ts        parses one line (label, assignment, tokens, AST, highlights), with a cache
  editor/        CodeMirror 6
    index.ts       createEditor(): extensions and keymap
    results.ts     results StateField, aligned result widgets, highlight marks, copy, live region
    theme.ts       editor chrome, driven by CSS variables in styles.css
    completion.ts  autocomplete (Tab accepts, never Enter); commands.ts toggle comment
  storage/       IndexedDB (idb)
    db.ts          schema types + getDB()
    migrations.ts  versioned upgrades (DB_VERSION comes from here)
    notes.ts       note CRUD; settings.ts key/value settings; autosave.ts debounced saver
  data/          rate fetching (open.er-api.com → Frankfurter fallback, CoinGecko), bundled snapshot
  app/           UI shell (vanilla TS + the `h()` helper in dom.ts)
    app.ts         controller: routing, opening notes, autosave, share, import/export, tab sync
    store.ts       NotesStore: in-memory notes, written through to IndexedDB, BroadcastChannel sync
    sidebar.ts     note list, search, pin/trash actions, trash view
    router.ts      hash routes (#/note/<id>, #/share/<payload>)
    share.ts       share-link encoding (deflate-raw + base64url)
    backup.ts      JSON backup format, import merge rules
    search.ts      sorting and search; title.ts derived titles; welcome.ts first-run note
    preferences.ts settings: defaults, validation, storage, applying theme and engine settings
    settings-dialog.ts, palette.ts (command palette + matching), accessory.ts (phone math keys)
    rates.ts       RatesManager: cached rates, hourly refresh, crypto on demand, off switch
  main.ts
tests/
  fixtures/*.calc  golden files: `input => expected`
  e2e/             Playwright specs (*.spec.ts)
  *.test.ts        Vitest: golden runner, highlights/perf, storage (fake-indexeddb)
public/            icons, manifest assets
```

## Rules
1. **Keep the engine pure.** Anything in `src/engine` must run in Node with no browser globals. Inject the clock
   (`settings.now`, `settings.timeZone`), rates, locale, and settings through the evaluation context. Use the global
   `Temporal` (natively or from the polyfill) for dates, never `Date`. This keeps tests deterministic and lets the engine move into a Web Worker later.
2. **Spec, then fixture, then code.** New syntax goes into PLAN.md §3 first, then gets golden-fixture lines, then
   the implementation. Each ambiguity you resolve (for example `in` as inches vs. the conversion keyword) gets a fixture line.
3. **Never use floats for user math.** Use the Decimal type. `0.1 + 0.2` must be `0.3`.
4. **Fail quietly.** A line the parser can't understand shows no result. It never throws to the UI and never
   shows an error banner. Engine errors are values (`{ kind: 'error' }`), not exceptions.
5. **Respect the bundle budget.** Ask before adding a runtime dependency. Lazy-load heavy pieces such as
   the Temporal polyfill, crypto rates, and the time-zone table. No UI framework unless PLAN.md is updated to say so.
6. **Stay offline-first.** Every feature must work offline, using cached rates where needed. Network failures are non-fatal.
7. **Never break stored data.** IndexedDB schema changes need a version bump and a migration in
   `src/storage/migrations.ts`, plus a test that upgrades from the previous version.
8. **Paths must work under GitHub Pages.** The app is served from `/reckon/`. Use `import.meta.env.BASE_URL` for asset
   URLs and hash routes (`#/note/<id>`) for navigation. Never assume the app lives at `/`.
9. **Accessibility.** Interactive elements are keyboard reachable, have labels, and meet AA contrast (4.5:1) in both
   themes against `--bg`, `--panel` and `--results-bg`. Colors are `light-dark()` pairs in `styles.css`.
10. **Keep PLAN.md current.** Tick milestone checkboxes as work lands, and record decisions that change the plan.

## Recipes
- **Add a unit**: add a `unit(id, DIM, factor, 'symbols', 'names')` line to `src/engine/units/registry.ts`.
  The factor converts to the base unit (m, kg, s, K, byte, rad). Symbols match exactly and names case-insensitively.
  Add `offset` for affine scales, `plural` for word-like symbols ("cups"), and `expand` for area/volume units.
  Check that new names don't swallow common words in prose, then add lines to `tests/fixtures/units.calc`.
- **Add a currency name**: extend `NAMES` (or `CRYPTO`) in `src/engine/units/currency.ts`, then add a line to
  `tests/fixtures/currency.calc`. Fixtures use the fixed rates in `tests/fixtures/rates.json`.
- **Browser tests** import `test`/`expect` from `tests/e2e/fixtures.ts`, which mocks every rate API.
- **Add a function**: register it in `src/engine/functions.ts` with its arity and a Decimal implementation, then add fixtures.
- **Add a keyword or phrase** (for example `x% off y`): update the parser and the PLAN.md §3 table, then add fixtures.
- **Add a setting**: add the type and default in `src/storage/settings.ts`, add the UI in `src/app/settings`, and thread it through the
  engine context if it affects results.

## Golden fixture format
```
// comment lines are part of the document too (they evaluate to nothing)
20% of 50 => 10
x = 4
x * 2 => 8
1 / 0 => (none)
```
`tests/golden.test.ts` evaluates each file as **one document**, so variables, blank lines and headings
affect the lines below them. The ` => expected` part is stripped before evaluation and compared with the
formatted result. `=> (none)` asserts that the line shows no result, and lines without `=>` aren't checked.
Results use locale `en-US`, the fixed rates in `tests/fixtures/rates.json`, and a fixed clock: Thursday,
Jan 15, 2026, 12:00 in UTC. Vitest loads `temporal-polyfill` in `tests/setup.ts`, because Node has no native Temporal.

## Git
- Use small, focused commits with imperative messages (`engine: support "x% off y"`).
- Don't commit `dist/`. CI builds and deploys to Pages on pushes to `main`.
