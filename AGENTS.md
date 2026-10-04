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
npm run test:e2e     # Playwright smoke tests
npm run lint         # ESLint + Prettier check
npm run typecheck    # tsc --noEmit
```
Before calling a task done, run `npm run lint && npm run typecheck && npm test`.

## Layout
```
src/
  engine/        PURE calculation engine. No DOM, fetch, Date.now, or navigator.
    lexer.ts       tokens with source ranges (also used for highlighting)
    parser.ts      Pratt parser, error tolerant
    ast.ts
    evaluate.ts    evaluates one line given a scope
    document.ts    evaluates a whole note: scope, line refs, sum/avg blocks, cache
    values/        Decimal, Quantity, Money, Percent, DateTime, Duration
    units/         unit registry + dimension vectors
    currency/      currency registry (symbols, codes, names)
    format.ts      result formatting (Intl.NumberFormat + settings)
  editor/        CodeMirror 6 setup, highlighting, results column, autocomplete
  storage/       IndexedDB (idb): notes repo, settings, rates cache, migrations
  data/          rate fetching (open.er-api.com → Frankfurter fallback), bundled snapshot
  app/           UI shell: sidebar, search, command palette, settings, routing (hash based)
  main.ts
tests/
  fixtures/*.calc  golden files: `input => expected`
  e2e/             Playwright
public/            icons, manifest assets
```

## Rules
1. **Keep the engine pure.** Anything in `src/engine` must run in Node with no browser globals. Inject the clock,
   rates, locale, and settings through the evaluation context. This keeps tests deterministic and lets the engine move into a Web Worker later.
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
9. **Accessibility.** Interactive elements are keyboard reachable, have labels, and meet AA contrast in both themes.
10. **Keep PLAN.md current.** Tick milestone checkboxes as work lands, and record decisions that change the plan.

## Recipes
- **Add a unit**: add it to `src/engine/units/registry.ts` with its dimension vector, factor (and offset for
  temperature), and its names (singular, plural, abbreviations). Add conversion lines to `tests/fixtures/units.calc`.
- **Add a function**: register it in `src/engine/functions.ts` with its arity and a Decimal implementation, then add fixtures.
- **Add a keyword or phrase** (for example `x% off y`): update the parser and the PLAN.md §3 table, then add fixtures.
- **Add a setting**: add the type and default in `src/storage/settings.ts`, add the UI in `src/app/settings`, and thread it through the
  engine context if it affects results.

## Golden fixture format
```
// comments start with //, blank lines separate independent cases unless marked
20% of 50 => 10
5 km in miles => 3.106856 mi
x = 4
x * 2 => 8
```
The runner evaluates each file as one document, compares the formatted result per line, and uses locale `en-US`, a fixed
clock (`2026-01-15T12:00:00Z`), and the fixed rates in `tests/fixtures/rates.json`.

## Git
- Use small, focused commits with imperative messages (`engine: support "x% off y"`).
- Don't commit `dist/`. CI builds and deploys to Pages on pushes to `main`.
