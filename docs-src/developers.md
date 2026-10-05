## Links that open a note

Reckon has no server API, because it's a static site. Instead, three kinds of links open notes:

| Link | Use |
|---|---|
| `{{site}}#/new?text=<note>` | **Plain-text link.** The note is [percent-encoded](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent): space `%20`, new line `%0A`, `$` `%24`, `%` `%25`, `+` `%2B`, `#` `%23`, `&` `%26`. Easy to write by hand, by an LLM, or in any language. |
| `{{site}}#/share/<payload>` | **Share link.** The note as raw DEFLATE, then base64url without padding. Shorter for long notes. |
| `{{site}}#/note/<id>` | A note already saved in this browser. |

Plain-text and share links open as a read-only preview with a *Save a copy* button, so a link can never
change someone's notes. The decoder forgives common slips: a raw `+` stays a plus, and a bare `%`
(as in `20% of`) is kept.

```js
const link = '{{site}}#/new?text=' + encodeURIComponent(note);
```

```python
from urllib.parse import quote
link = "{{site}}#/new?text=" + quote(note, safe="")

# Shorter share link, same format the app uses:
import base64, zlib
c = zlib.compressobj(9, zlib.DEFLATED, -15)  # raw DEFLATE
payload = base64.urlsafe_b64encode(c.compress(note.encode()) + c.flush()).rstrip(b"=").decode()
link = "{{site}}#/share/" + payload
```

## The engine module

[`engine.js`]({{site}}engine.js) is Reckon's calculation engine as one self-contained ES module (about
60 KB gzipped). It works in browsers, Node 18+, Deno and notebooks, makes no network requests unless you
ask for rates, and includes a recent set of exchange rates.

```js
import { evaluate, noteLink, shareLink } from '{{site}}engine.js'; // Deno, browsers
// Node: download it first (curl -O {{site}}engine.js), then import('./engine.js')

evaluate('hourly rate = $85/h\n37.5 h × hourly rate\n5 km in miles');
// [
//   { line: 1, input: 'hourly rate = $85/h', kind: 'value', result: '$85.00/h', variable: 'hourly rate' },
//   { line: 2, input: '37.5 h × hourly rate', kind: 'value', result: '$3,187.50' },
//   { line: 3, input: '5 km in miles', kind: 'value', result: '3.1069 mi' },
// ]
```

| Export | What it does |
|---|---|
| `evaluate(text, options?)` | Evaluates a note; returns one `{ line, input, kind, result?, error?, variable? }` per line. Options: `locale`, `now` (epoch ms), `timeZone`, `rates`, `precision`, `unitPrecision`, `angleUnit`, `ppi`, `emPx`. |
| `noteLink(text)` | A plain-text link that opens `text` in Reckon. |
| `shareLink(text)` | A compressed share link (async). |
| `decodeShare(payload)` | The note inside a share link (async). |
| `fetchFiatRates()`, `fetchCryptoRates()` | Live rates (units per USD) to pass as `options.rates`. |
| `bundledRates` | The rates built into this version, with `fetchedAt`. |
| `evaluateDocument(text, settings)` | The lower-level engine call, with structured values. |

## For LLMs and agents

- **[llms.txt]({{site}}llms.txt)** and **[llms-full.txt]({{site}}llms-full.txt)** describe Reckon for language
  models ([llmstxt.org](https://llmstxt.org)). The full file contains the whole syntax reference.
- **[The prompt]({{site}}prompt.txt)** (below) teaches any chat assistant to write Reckon notes and answer with
  a link you can click.
- **[The agent skill]({{site}}skill/SKILL.md)** teaches coding agents (such as Claude Code) to write notes, build
  links and check answers with the engine. Install it by copying `skills/reckon/` from the
  [repository](https://github.com/parmsam/reckon) into your agent's skills folder.
