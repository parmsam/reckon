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
    const example = { input: line.slice(0, at), result: line.slice(at + 4).trim() };
    if (example.result === '(none)') continue;
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
    .map((e) => `${e.input}${' '.repeat(width - [...e.input].length)}  → ${e.result}`)
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
