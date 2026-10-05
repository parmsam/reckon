# Changelog

All notable changes to Reckon. Versions follow [semantic versioning](https://semver.org): new features
bump the minor version, fixes bump the patch version.

## Unreleased

- **What's new:** after an update, a one-time note links to this changelog. It's also in Settings → About
  and the command palette.

## 1.1.0 — 2026-10-05

The first GitHub release. Everything since 1.0.0, which shipped on the site without a release.

### Calculations
- **Comparisons and conditions:** `5 km > 3 miles`, `0.1 + 0.2 == 0.3`, `and` / `or` / `not`, `true` / `false`,
  and `if total > $100 then 10% off total else total`.
- **Bitwise operators:** `0xF0 | 0x0F`, `5 xor 3`, `1 << 10`.
- **Your own functions and units:** `tip(bill, rate) = bill × rate` (recursion works), `1 sprint = 2 weeks`,
  `1 dozen = 12`, and replacing built-ins like a metric `1 cup = 250 ml`.

### Seeing how a note works (inspired by Bret Victor's *Inventing on Principle*)
- **Why this answer?** Hover an answer for how the line was read, with the values it used, conversion
  factors, ignored words, and the lines it uses or is used by.
- **Why no answer?** Lines without one show a "?" with the reason.
- **Dependencies:** the cursor's line marks the lines it uses (green) and that use it (orange).
- **Slider for variables:** a ⇆ handle on `name = number` lines; answers update as you drag. One undo step.
- **⌥/Alt-drag scrubbing** of numbers (off by default; desktop).
- **Total bar** under the note: the total of the section you're in, or the sum and average of a selection.

### Sharing and exporting
- **Export with answers:** aligned text, Markdown tables, or a printable web page (also in `engine.js`:
  `toText`, `toMarkdown`, `toHtml`).
- **Share links show the note's name:** `…/reckon/#/share/monthly-budget/…`.
- **The address stays `…/reckon/`** while you use notes, so copying it shares the app, never a note.

### App
- **First-run notes:** a five-step tutorial plus a monthly budget and a weekend trip, and a button to add them back.
- **Branding:** splash screen (can be turned off), logo and version in the notes list, Settings → Help and about,
  and a browser bar that follows the theme.
- **Tips** in the notes list, starting with how to install on your device.
- **Update prompt:** "A new version of Reckon is available" with Reload; it saves your typing first.
- **More settings:** line numbers, the total bar, tips, splash screen, sliders and scrubbing.
- **Top bar:** docs, keyboard shortcuts and GitHub; a keyboard shortcuts dialog (press `?`).
- **Docs:** a glossary of every keyword and symbol, and a catalogue of every unit.

### Fixes
- iPhone: no more zooming in when you tap the editor; the math keys sit clear of Safari's floating bars;
  Settings no longer opens the theme picker by itself.
- The service worker no longer answers `/docs/` and `.txt` addresses with the app.
- The keyboard shortcuts dialog focuses Done instead of the docs link.

## 1.0.0 — 2026-10-04

The first complete version, on the site at https://parmsam.github.io/reckon/.

- **Calculator engine:** exact decimals, percentages, variables, `prev` and `sum`/`avg`/`count`/`min`/`max`,
  functions, number formats, and descriptive words ignored.
- **Units and currencies:** over 100 kinds of units, every published ISO currency plus crypto, with live
  rates cached for offline use.
- **Dates, times and time zones:** `today + 2 weeks`, `days until Dec 25`, `3pm PST in London`.
- **Notes:** many notes with search, pinning, trash, share links, backups, and sync between open tabs.
- **App:** installable and offline, settings, command palette (⌘/Ctrl K), autocomplete, phone keyboard row.
- **For developers and AI:** docs, `llms.txt`, an LLM prompt, an agent skill, and `engine.js`.
