## Getting started

Open **[Reckon]({{site}})** and start typing. Each line is a calculation; its answer appears on the
right as you type. Click an answer to copy it.

- Write naturally: `3 apples + 2 apples`, `rent: 1,200`, `20% of $50`.
- Name values with `=` (`hourly rate = $85/h`) and use them below.
- `sum` totals the lines above it, back to the last heading or blank line.
- Notes are saved in your browser as you type. Open the notes list with the ☰ button.
- Press <kbd>⌘/Ctrl</kbd> <kbd>K</kbd> for every command, or <kbd>?</kbd> for the keyboard shortcuts.

Reckon is a PWA: use your browser's **Install** option to get it in your dock or home screen. It works
offline after the first visit.

## Notes, sharing and backups

- **Many notes**: create, search, pin and trash them in the notes list. Trashed notes can be restored.
- **Tutorial and examples**: new users start with a tutorial, a monthly budget and a trip plan. Bring them
  back any time with *Add the tutorial and example notes* (in Settings, or the <kbd>⌘/Ctrl</kbd> <kbd>K</kbd> menu).
- **Share link** (the ↗ button): copies a link with the whole note compressed into it, labelled with the
  note's name (`…/reckon/#/share/monthly-budget/…`). Whoever opens it sees a read-only copy and can save their
  own. The address bar's `#/note/…` link only works in your own browser, so share with the button.
- **Backups**: *Export all notes* (in the notes list) saves a JSON file; *Import notes* restores it, or
  turns `.txt` and `.md` files into notes.
- **Download and export** (the ↓ button): the note as text, or with its answers as aligned text, Markdown
  (calculations become tables) or a web page you can print. *Copy with answers* puts the aligned text on
  the clipboard.

## Privacy

Notes never leave your browser. There are no accounts, no servers and no analytics. Share links keep
the note after the `#`, a part of the URL browsers never send to a server.

The only network requests fetch exchange rates (open.er-api.com, falling back to Frankfurter; CoinGecko
only if a note mentions crypto). They never include your notes, and you can turn them off in Settings.

## Questions

**Why does a line show no answer?** Reckon shows nothing rather than guess. Common causes: an unknown
name (`total cost + 1` before `total cost` is defined), two bare numbers in a row (`3 cats and 2 dogs`),
or mixing units that don't convert (`5 km + 3 kg`).

**How do I type decimals in another locale?** Always with a dot: `1,234.5`. The number format setting
only changes how answers look.

**Is `in` inches or "convert to"?** It converts when a unit follows (`5 km in miles`). Right after a
number with nothing after it, it's inches (`6 ft 2 in`). In ordinary text (`5 people in the room`) it's
ignored.

**Why did a word stop working after I defined a variable?** Variables win over units and keywords, so
after `F = 5`, `72 F` means 72 × 5. Pick a different name.
