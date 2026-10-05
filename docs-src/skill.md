---
name: reckon
description: Write notes for Reckon, a notepad calculator, and give the user a link that opens them. Use when the user wants a budget, invoice, recipe scaling, unit conversion, time zone plan or any calculation laid out as a Reckon note, or asks for a Reckon link.
---

# Reckon

Reckon ({{site}}) is a notepad calculator: each line of a note is a calculation and the app shows
its answer beside it. You write the note; Reckon computes the answers. Notes live in the user's
browser, so you hand them over as a link.

## Write the note

- One calculation per line; descriptive words are ignored (`flights: $420 × 2`).
- `# Heading` starts a section; `//` starts a comment.
- `name = value` defines a variable (names can have spaces); reuse it on later lines.
- `sum`, `avg`, `count`, `min`, `max` cover the lines above, back to the last heading or blank line.
- Define functions (`tip(bill, rate) = bill × rate`) and units (`1 sprint = 2 weeks`) for reuse.
- Conditions: `if total > $100 then 10% off total else total`; comparisons give true/false.
- Convert with `in`: `5 km in miles`, `$30 in EUR`, `3pm PST in London`.
- Numbers use a dot for decimals: `1,234.5`.

The full syntax, with every supported form and its answer, is in {{site}}llms-full.txt.

## Check it (optional)

The engine is a single ES module. Evaluate the note to make sure every line has an answer:

```sh
curl -sO {{site}}engine.js
node --input-type=module -e "
  import { evaluate } from './engine.js';
  const note = process.argv[1];
  for (const l of evaluate(note)) console.log(l.input.padEnd(40), l.result ?? '(no answer)');
" "$NOTE"
```

Lines showing `(no answer)` need fixing: usually an undefined name, two numbers in a row, or units
that don't convert.

## Give the user a link

Prefer a compressed share link when you can run code:

```python
import base64, zlib
c = zlib.compressobj(9, zlib.DEFLATED, -15)  # raw DEFLATE
payload = base64.urlsafe_b64encode(c.compress(note.encode()) + c.flush()).rstrip(b"=").decode()
link = "{{site}}#/share/" + payload
```

Or a plain-text link, which works anywhere:

```python
from urllib.parse import quote
link = "{{site}}#/new?text=" + quote(note, safe="")
```

In JavaScript, the engine has both: `noteLink(note)` and `await shareLink(note)`.

Reply with the link and the note in a code block. Both link types open a read-only preview with
"Save a copy", so they never change the user's existing notes.
