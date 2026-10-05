# Reckon

> Reckon is a free, open-source notepad calculator that runs in the browser. Each line of a note is a
> calculation (units, currencies, percentages, dates, time zones, variables, totals) and its answer shows
> beside it. Notes stay in the browser; there is no server or account.

Reckon has no HTTP API. To open a note for someone, build a link: `{{site}}#/new?text=` plus the note
percent-encoded (encodeURIComponent), or a compressed `#/share/` link (raw DEFLATE, then base64url without
padding). Both open a read-only preview with "Save a copy". To compute answers in code, import
`{{site}}engine.js` and call `evaluate(note)`.

## Docs

- [Full syntax reference and link formats]({{site}}llms-full.txt): every supported line, with its answer
- [Docs]({{site}}docs/): guide, syntax, links, engine module, privacy
- [Prompt for chat assistants]({{site}}prompt.txt): teaches an LLM to write notes and reply with a link

## Optional

- [Agent skill]({{site}}skill/SKILL.md): for coding agents
- [Engine module]({{site}}engine.js): ES module exporting evaluate, noteLink, shareLink
- [Source code](https://github.com/parmsam/reckon)
