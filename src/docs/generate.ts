/**
 * Builds the docs, llms.txt files, the LLM prompt and the agent skill from the syntax reference
 * (tests/fixtures/reference.calc). Pure functions; scripts/build-docs.mjs writes the files.
 */

export interface Example {
  input: string;
  result: string;
}

export interface Section {
  title: string;
  description: string[];
  /** Runs of consecutive example lines; each run is one small note. */
  blocks: Example[][];
}

/** Parses reference.calc: "// ## Title" sections, "//" descriptions, "input => result" lines. */
export function parseReference(text: string): Section[] {
  const sections: Section[] = [];
  let current: Section | undefined;
  let block: Example[] | undefined;
  for (const line of text.split('\n')) {
    const heading = /^\/\/ ## (.+)$/.exec(line);
    if (heading) {
      current = { title: heading[1]!.trim(), description: [], blocks: [] };
      sections.push(current);
      block = undefined;
      continue;
    }
    if (!current) continue;
    if (line.startsWith('//')) {
      current.description.push(line.replace(/^\/\/\s?/, ''));
      block = undefined;
      continue;
    }
    const at = line.lastIndexOf(' => ');
    if (at === -1) {
      block = undefined;
      continue;
    }
    // Lines without an answer (definitions) stay in the example, with an empty result.
    const result = line.slice(at + 4).trim();
    const example = { input: line.slice(0, at), result: result === '(none)' ? '' : result };
    if (!block) {
      block = [];
      current.blocks.push(block);
    }
    block.push(example);
  }
  return sections;
}

const slug = (title: string) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One example per line, answers aligned: "5 km in miles   → 3.1069 mi". */
export function exampleText(block: Example[]): string {
  const width = Math.max(...block.map((e) => [...e.input].length));
  return block
    .map((e) =>
      e.result ? `${e.input}${' '.repeat(width - [...e.input].length)}  → ${e.result}` : e.input,
    )
    .join('\n');
}

/** The reference as Markdown, for llms-full.txt and the skill. */
export function referenceMarkdown(sections: Section[], link: (text: string) => string): string {
  return sections
    .map((s) => {
      const parts = [`### ${s.title}`, ...s.description];
      for (const block of s.blocks) {
        parts.push('```\n' + exampleText(block) + '\n```');
        parts.push(`[Open in Reckon](${link(block.map((e) => e.input).join('\n'))})`);
      }
      return parts.join('\n\n');
    })
    .join('\n\n');
}

/** The reference as HTML: each example block looks like a small Reckon note. */
export function referenceHtml(sections: Section[], link: (text: string) => string): string {
  return sections
    .map((s) => {
      const blocks = s.blocks
        .map((block) => {
          const rows = block
            .map((e) => `<tr><td>${escapeHtml(e.input)}</td><td>${escapeHtml(e.result)}</td></tr>`)
            .join('');
          const href = escapeHtml(link(block.map((e) => e.input).join('\n')));
          return `<figure class="note"><table>${rows}</table><a class="try" href="${href}">Open in Reckon ↗</a></figure>`;
        })
        .join('\n');
      const description = s.description.map((d) => `<p>${escapeHtml(d)}</p>`).join('');
      return `<section id="${slug(s.title)}"><h3>${escapeHtml(s.title)}</h3>${description}${blocks}</section>`;
    })
    .join('\n');
}

/** A compact cheat sheet for the LLM prompt: every example, grouped by section. */
export function cheatSheet(sections: Section[]): string {
  return sections
    .map((s) => `${s.title}:\n${s.blocks.map((b) => exampleText(b)).join('\n')}`)
    .join('\n\n');
}

export function sectionLinks(sections: Section[]): { title: string; id: string }[] {
  return sections.map((s) => ({ title: s.title, id: slug(s.title) }));
}

/** Fills {{name}} placeholders. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match);
}

// ---- Glossary -------------------------------------------------------------------------------

export interface GlossaryEntryLike {
  terms: string[];
  meaning: string;
  example?: string;
}
export interface GlossaryGroupLike {
  id: string;
  title: string;
  intro?: string;
  entries: GlossaryEntryLike[];
}
export interface UnitKindLike {
  kind: string;
  units: { symbol: string; symbols: string[]; names: string[] }[];
}

/** Multi-line examples on one line: "10 ↵ 20 ↵ sum". */
const oneLine = (example: string) => example.split('\n').join(' ↵ ');
const cell = (s: string) => s.replace(/\|/g, '\\|');

export function glossaryMarkdown(
  groups: GlossaryGroupLike[],
  answer: (example: string) => string | undefined,
): string {
  return groups
    .map((g) => {
      const rows = g.entries.map((e) => {
        const example = e.example
          ? `\`${cell(oneLine(e.example))}\` → ${cell(answer(e.example) ?? '')}`
          : '';
        return `| ${e.terms.map((t) => `\`${cell(t)}\``).join(' ')} | ${cell(e.meaning)} | ${example} |`;
      });
      return [
        `### ${g.title}`,
        g.intro ?? '',
        '| Write | Meaning | Example |\n|---|---|---|\n' + rows.join('\n'),
      ]
        .filter(Boolean)
        .join('\n\n');
    })
    .join('\n\n');
}

export function glossaryHtml(
  groups: GlossaryGroupLike[],
  answer: (example: string) => string | undefined,
): string {
  return groups
    .map((g) => {
      const rows = g.entries
        .map((e) => {
          const terms = e.terms.map((t) => `<code>${escapeHtml(t)}</code>`).join(' ');
          const example = e.example
            ? `<code>${e.example.split('\n').map(escapeHtml).join('<br>')}</code> <span class="answer">→ ${escapeHtml(answer(e.example) ?? '')}</span>`
            : '';
          return `<tr><td>${terms}</td><td>${escapeHtml(e.meaning)}</td><td>${example}</td></tr>`;
        })
        .join('');
      const intro = g.intro ? `<p>${escapeHtml(g.intro)}</p>` : '';
      return `<section id="glossary-${g.id}"><h3>${escapeHtml(g.title)}</h3>${intro}<table class="glossary"><thead><tr><th>Write</th><th>Meaning</th><th>Example</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    })
    .join('\n');
}

const otherSpellings = (u: UnitKindLike['units'][number]) => [
  ...new Set([...u.symbols.filter((s) => s !== u.symbol), ...u.names]),
];

export function unitsMarkdown(kinds: UnitKindLike[]): string {
  return kinds
    .map(
      (k) =>
        `### ${k.kind}\n\n| Unit | Also written |\n|---|---|\n` +
        k.units
          .map((u) => `| \`${cell(u.symbol)}\` | ${otherSpellings(u).map(cell).join(', ')} |`)
          .join('\n'),
    )
    .join('\n\n');
}

export function unitsHtml(kinds: UnitKindLike[]): string {
  return kinds
    .map((k) => {
      const rows = k.units
        .map(
          (u) =>
            `<tr><td><code>${escapeHtml(u.symbol)}</code></td><td>${otherSpellings(u).map(escapeHtml).join(', ')}</td></tr>`,
        )
        .join('');
      return `<details><summary>${escapeHtml(k.kind)} <span class="count">${k.units.length}</span></summary><table class="glossary"><tbody>${rows}</tbody></table></details>`;
    })
    .join('\n');
}

export const glossaryNav = (groups: GlossaryGroupLike[]) =>
  groups.map((g) => ({ title: g.title, id: `glossary-${g.id}` }));

export interface Template {
  title: string;
  description: string;
  /** The note as it opens in Reckon: heading, description comment and lines, without answers. */
  text: string;
  examples: Example[];
}

/** Parses a template (tests/fixtures/templates/*.calc): "# Title", a "//" description, then lines. */
export function parseTemplate(source: string): Template {
  const lines = source.replace(/\n$/, '').split('\n');
  const title = lines[0]!.replace(/^#\s*/, '');
  const description = lines
    .filter((l) => l.startsWith('//'))
    .map((l) => l.replace(/^\/\/\s?/, ''))
    .join(' ');
  const examples = lines
    .filter((l) => !l.startsWith('#') && !l.startsWith('//'))
    .map((line) => {
      const at = line.lastIndexOf(' => ');
      return at === -1
        ? { input: line, result: '' }
        : { input: line.slice(0, at), result: line.slice(at + 4).trim() };
    });
  const text = lines
    .map((l) => (l.lastIndexOf(' => ') === -1 ? l : l.slice(0, l.lastIndexOf(' => '))))
    .join('\n');
  return { title, description, text, examples };
}

/** Templates as Markdown, for llms-full.txt. */
export function templatesMarkdown(templates: Template[], link: (text: string) => string): string {
  return templates
    .map((t) =>
      [
        `### ${t.title}`,
        t.description,
        '```\n' + exampleText(t.examples) + '\n```',
        `[Open in Reckon](${link(t.text)})`,
      ].join('\n\n'),
    )
    .join('\n\n');
}

/** Templates as HTML cards, each a small note with an "Open in Reckon" link. */
export function templatesHtml(templates: Template[], link: (text: string) => string): string {
  return templates
    .map((t) => {
      const rows = t.examples
        .map((e) => `<tr><td>${escapeHtml(e.input)}</td><td>${escapeHtml(e.result)}</td></tr>`)
        .join('');
      return (
        `<section class="template" id="template-${slug(t.title)}"><h3>${escapeHtml(t.title)}</h3>` +
        `<p>${escapeHtml(t.description)}</p><figure class="note"><table>${rows}</table>` +
        `<a class="try" href="${escapeHtml(link(t.text))}">Open in Reckon ↗</a></figure></section>`
      );
    })
    .join('\n');
}
