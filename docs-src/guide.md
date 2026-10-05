## Getting started

Open **[Reckon]({{site}})** and start typing. Each line is a calculation; its answer appears on the
right as you type. Click an answer to copy it.

- Write naturally: `3 apples + 2 apples`, `rent: 1,200`, `20% of $50`.
- Name values with `=` (`hourly rate = $85/h`) and use them below.
- `sum` totals the lines above it, back to the last heading or blank line.
- Notes are saved in your browser as you type. Open the notes list with the ☰ button.
- Press <kbd>⌘/Ctrl</kbd> <kbd>K</kbd> for every command, or <kbd>?</kbd> for the keyboard shortcuts.

Reckon works offline after the first visit, and you can install it as an app with its own icon and window:

- **iPhone and iPad (Safari):** tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open the menu (⋮), then **Install app** or **Add to Home screen**.
- **Chrome or Edge on a computer:** click the install icon in the address bar, or **Install Reckon** in the
  <kbd>⌘/Ctrl</kbd> <kbd>K</kbd> menu.
- **Safari on a Mac:** choose **File → Add to Dock**.

The tip at the bottom of the notes list shows the right steps for your device. Tips cycle each visit; turn
them off in Settings.

## Seeing how a note works

- **Why this answer?** Hover an answer to see how the line was read, with the values it used
  ("rent ($1,200.00) + utilities ($150.00)"), and which lines it uses or is used by.
- **No answer?** A "?" appears where the answer would be (once you leave the line). Hover or tap it for the reason.
- **What depends on what:** the line with the cursor marks the lines it uses (green) and the lines that use it (orange).
- **Try other numbers:** on a line like `rent = $1,200`, tap **⇆** for a slider and watch every answer below change.
  With *Drag numbers to change them* on (Settings), hold <kbd>⌥/Alt</kbd> and drag any number. Undo puts it back.
  While you adjust, each answer that moves shows by how much next to it (`+$120.00`, `−3 days`), and so does the total.
- **Totals:** the bar under the note shows the total of the section you're in; select lines for their sum and average.

## Notes, sharing and backups

- **Many notes**: create, search, pin and trash them in the notes list. Trashed notes can be restored.
- **Tutorial and examples**: new users start with a tutorial, a monthly budget and a trip plan. Bring them
  back any time with *Add the tutorial and example notes* (in Settings, or the <kbd>⌘/Ctrl</kbd> <kbd>K</kbd> menu).
- **Share link** (the ↗ button): copies a link with the whole note compressed into it, labelled with the
  note's name (`…/reckon/#/share/monthly-budget/…`). Whoever opens it sees a read-only copy and can save their
  own. The address bar always shows just the app's address, so copying it shares Reckon, never your note.
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
