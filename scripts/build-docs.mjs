// Builds the docs page, llms.txt, llms-full.txt, prompt.txt and the agent skill into dist/, from
// docs-src/ and the tested syntax reference (tests/fixtures/reference.calc). Also refreshes the
// repo copy of the skill in skills/reckon/SKILL.md. Runs as part of `npm run build`.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';
import { createServer } from 'vite';

const read = (path) => readFileSync(path, 'utf8');
/** Markdown to HTML, with ids on headings so the page's navigation can link to them. */
const markdown = (text) =>
  marked.parse(text).replace(/<h([23])>(.*?)<\/h\1>/g, (_, level, inner) => {
    const id = inner
      .replace(/<[^>]+>/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
const write = (path, text) => {
  mkdirSync(path.slice(0, path.lastIndexOf('/')), { recursive: true });
  writeFileSync(path, text);
};

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const gen = await server.ssrLoadModule('/src/docs/generate.ts');
  const { noteLink, SITE_URL } = await server.ssrLoadModule('/src/links.ts');

  const sections = gen.parseReference(read('tests/fixtures/reference.calc'));
  // Reusable notes, tested like the reference (one document per file), in file-name order.
  const templateDir = 'tests/fixtures/templates';
  const templates = readdirSync(templateDir)
    .filter((f) => f.endsWith('.calc'))
    .sort()
    .map((f) => gen.parseTemplate(read(`${templateDir}/${f}`)));
  const { glossary, unitCatalog } = await server.ssrLoadModule('/src/engine/glossary.ts');
  const { evaluateDocument } = await server.ssrLoadModule('/src/engine/index.ts');
  // Same fixed clock and sample rates as the tests, so the docs show the tested answers.
  const sampleSettings = {
    locale: 'en-US',
    now: Date.parse('2026-01-15T12:00:00Z'),
    timeZone: 'UTC',
    rates: JSON.parse(read('tests/fixtures/rates.json')),
  };
  const answer = (example) => evaluateDocument(example, sampleSettings).at(-1)?.display;
  const groups = glossary();
  const units = unitCatalog();
  const site = SITE_URL;
  const exampleNote =
    '# Trip budget\nflights: $420 × 2\nhotel = 3 nights × $135\nfood: 25% of hotel\nsum';
  const values = {
    site,
    cheatsheet: gen.cheatSheet(sections),
    exampleNote,
    exampleLink: noteLink(exampleNote),
  };

  const prompt = gen.fill(read('docs-src/prompt.md'), values);
  const skill = gen.fill(read('docs-src/skill.md'), values);
  const llms = gen.fill(read('docs-src/llms.md'), values);
  const guide = gen.fill(read('docs-src/guide.md'), values);
  const developers = gen.fill(read('docs-src/developers.md'), values);
  const reference = gen.referenceMarkdown(sections, (text) => noteLink(text));

  const llmsFull = [
    llms.split('\n## Docs')[0].trim(),
    guide,
    `## Templates\n\nReady-made notes to open and adapt. Every answer is tested.\n\n${gen.templatesMarkdown(templates, (text) => noteLink(text))}`,
    `## Syntax reference\n\nEvery line below is tested. Answers use sample exchange rates, and dates assume it is\nThursday, Jan 15, 2026, 12:00 in UTC.\n\n${reference}`,
    `## Glossary\n\nEvery word and symbol Reckon understands. ↵ separates lines of a multi-line example.\n\n${gen.glossaryMarkdown(groups, answer)}`,
    `## Units\n\nEvery unit, with all the ways to write it. Symbols match exactly; names ignore case.\n\n${gen.unitsMarkdown(units)}`,
    developers,
    `## Prompt for chat assistants\n\n\`\`\`\n${prompt}\n\`\`\``,
  ].join('\n\n');

  write('dist/llms.txt', llms);
  write('dist/llms-full.txt', llmsFull);
  write('dist/prompt.txt', prompt);
  write('dist/skill/SKILL.md', skill);
  write('skills/reckon/SKILL.md', skill);

  // The docs page links into the app relatively, so it works locally and on Pages.
  const relative = (text) => noteLink(text, '../');
  const nav = gen.sectionLinks(sections);
  const html = read('docs-src/page.html')
    .replace('{{guide}}', markdown(guide))
    .replace('{{templates}}', gen.templatesHtml(templates, relative))
    .replace('{{syntaxNav}}', nav.map((s) => `<a href="#${s.id}">${s.title}</a>`).join(''))
    .replace('{{reference}}', gen.referenceHtml(sections, relative))
    .replace(
      '{{glossaryNav}}',
      gen
        .glossaryNav(groups)
        .map((g) => `<a href="#${g.id}">${g.title}</a>`)
        .join(''),
    )
    .replace('{{glossary}}', gen.glossaryHtml(groups, answer))
    .replace('{{units}}', gen.unitsHtml(units))
    .replace('{{developers}}', markdown(developers))
    .replace(
      '{{prompt}}',
      prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'),
    );
  write('dist/docs/index.html', html);
  console.log(
    `Docs built: ${templates.length} templates, ${sections.length} syntax sections, ${sections.flatMap((s) => s.blocks).flat().length} examples`,
  );
} finally {
  await server.close();
}
