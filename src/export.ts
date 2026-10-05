import type { LineResult } from './engine';

/**
 * Exports a note with its answers, as aligned text, Markdown or a standalone HTML page. Pure
 * functions over the note and its evaluated results, shared by the app and engine.js.
 */

const HEADING = /^\s*(#{1,6})\s+(.*)$/;
const COMMENT = /^\s*\/\/\s?(.*)$/;

/** "5 km in miles   → 3.1069 mi", answers aligned. */
export function toText(source: string, results: LineResult[]): string {
  const lines = source.split('\n');
  const width = Math.max(
    0,
    ...lines.filter((_, i) => results[i]?.display !== undefined).map((l) => [...l].length),
  );
  return lines
    .map((line, i) => {
      const display = results[i]?.display;
      return display === undefined
        ? line
        : `${line}${' '.repeat(width - [...line].length)}  → ${display}`;
    })
    .join('\n');
}

type Part =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'comment'; text: string }
  | { kind: 'rows'; rows: { line: string; answer?: string }[] };

/** Groups a note into headings, comments, and runs of calculation lines (split by blank lines). */
function parts(source: string, results: LineResult[]): Part[] {
  const out: Part[] = [];
  let rows: { line: string; answer?: string }[] | undefined;
  source.split('\n').forEach((line, i) => {
    const heading = HEADING.exec(line);
    const comment = COMMENT.exec(line);
    if (line.trim() === '' || heading || comment) {
      rows = undefined;
      if (heading)
        out.push({ kind: 'heading', level: heading[1]!.length, text: heading[2]!.trim() });
      else if (comment) out.push({ kind: 'comment', text: comment[1]!.trim() });
      return;
    }
    if (!rows) {
      rows = [];
      out.push({ kind: 'rows', rows });
    }
    rows.push({ line: line.trim(), answer: results[i]?.display });
  });
  return out;
}

const markdownCell = (s: string) => s.replace(/\|/g, '\\|');

/** Markdown: headings stay headings, comments become text, calculations become tables. */
export function toMarkdown(source: string, results: LineResult[]): string {
  return (
    parts(source, results)
      .map((p) => {
        if (p.kind === 'heading') return `${'#'.repeat(p.level)} ${p.text}`;
        if (p.kind === 'comment') return p.text;
        const rows = p.rows.map(
          (r) => `| ${markdownCell(r.line)} | ${markdownCell(r.answer ?? '')} |`,
        );
        return ['| Line | Answer |', '|---|---:|', ...rows].join('\n');
      })
      .join('\n\n') + '\n'
  );
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A standalone, printable HTML page. */
export function toHtml(source: string, results: LineResult[], title = 'Reckon note'): string {
  const body = parts(source, results)
    .map((p) => {
      if (p.kind === 'heading') return `<h${p.level}>${escapeHtml(p.text)}</h${p.level}>`;
      if (p.kind === 'comment') return `<p class="comment">${escapeHtml(p.text)}</p>`;
      const rows = p.rows
        .map((r) => `<tr><td>${escapeHtml(r.line)}</td><td>${escapeHtml(r.answer ?? '')}</td></tr>`)
        .join('');
      return `<table>${rows}</table>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; --fg: light-dark(#1c1b22, #f4f1ea); --bg: light-dark(#ffffff, #1c1b22);
    --muted: light-dark(#5f5c69, #a19dab); --accent: light-dark(#995900, #f2a541); --line: light-dark(#e3dfd6, #36343f); }
  body { max-width: 44rem; margin: 2rem auto; padding: 0 1rem; background: var(--bg); color: var(--fg);
    font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif; }
  table { width: 100%; margin: 0.75rem 0 1.25rem; border-collapse: collapse;
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace; font-size: 0.95rem; }
  td { padding: 0.3rem 0.5rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  td:last-child { text-align: right; color: var(--accent); font-weight: 600; white-space: nowrap; }
  .comment { color: var(--muted); font-style: italic; }
  footer { margin-top: 2rem; color: var(--muted); font-size: 0.8rem; }
</style>
</head>
<body>
${body}
<footer>Made with <a href="https://parmsam.github.io/reckon/">Reckon</a></footer>
</body>
</html>
`;
}
