import { h } from './dom';

export interface Command {
  id: string;
  label: string;
  /** Shown on the right: a shortcut or extra detail. */
  hint?: string;
  /** Extra words to match: "preferences" finds Settings. */
  keywords?: string;
  run: () => void;
}

/**
 * Scores a fuzzy match: every query character must appear in order. Matches at word starts and
 * runs of consecutive characters score higher. Returns -1 for no match.
 */
export function fuzzyScore(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase().replace(/\s+/g, '');
  if (!q) return 0;
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of q) {
    const at = t.indexOf(ch, from);
    if (at === -1) return -1;
    if (at === 0 || /[\s\-_/:]/.test(t[at - 1]!)) score += 3;
    if (at === previous + 1) score += 2;
    score += 1;
    previous = at;
    from = at + 1;
  }
  // Prefer shorter labels for equal matches.
  return score - t.length / 100;
}

/**
 * Scores a word match: every query word must appear in the label or keywords. Matches at the
 * start of a label word score highest. Returns -1 for no match.
 */
export function wordScore(command: Command, query: string): number {
  const label = command.label.toLowerCase();
  const keywords = (command.keywords ?? '').toLowerCase();
  let score = 0;
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const words = label.split(/[\s\-/]+/);
    if (words.some((w) => w.startsWith(word))) score += 10;
    else if (label.includes(word)) score += 5;
    else if (keywords.includes(word)) score += 3;
    else return -1;
  }
  return score - label.length / 100;
}

/** Commands matching the query, best first. Falls back to loose matching for typos. */
export function filterCommands(commands: Command[], query: string): Command[] {
  if (!query.trim()) return commands;
  const rank = (score: (c: Command) => number) =>
    commands
      .map((c) => ({ c, score: score(c) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c);
  const byWords = rank((c) => wordScore(c, query));
  return byWords.length ? byWords : rank((c) => fuzzyScore(c.label, query));
}

/** Command palette: a searchable list of commands and notes (Mod-K). */
export class Palette {
  readonly el: HTMLDialogElement;
  private input: HTMLInputElement;
  private list: HTMLUListElement;
  private items: Command[] = [];
  private active = 0;

  constructor(private commands: () => Command[]) {
    this.input = h('input', {
      type: 'text',
      class: 'palette-input',
      placeholder: 'Type a command or note name',
      role: 'combobox',
      'aria-expanded': 'true',
      'aria-controls': 'palette-list',
      'aria-autocomplete': 'list',
      'aria-label': 'Command',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    this.list = h('ul', {
      class: 'palette-list',
      id: 'palette-list',
      role: 'listbox',
      'aria-label': 'Commands',
    });
    this.el = h(
      'dialog',
      { class: 'dialog palette', 'aria-label': 'Command palette' },
      this.input,
      this.list,
    );

    this.input.addEventListener('input', () => {
      this.active = 0;
      this.render();
    });
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el) this.el.close();
    });
  }

  get isOpen(): boolean {
    return this.el.open;
  }

  open(query = ''): void {
    this.input.value = query;
    this.active = 0;
    this.render();
    this.el.showModal();
    this.input.focus();
  }

  close(): void {
    this.el.close();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = this.items.length;
      if (n) this.active = (this.active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n;
      this.render();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.runAt(this.active);
    }
  }

  private runAt(index: number): void {
    const command = this.items[index];
    if (!command) return;
    this.close();
    command.run();
  }

  private render(): void {
    this.items = filterCommands(this.commands(), this.input.value);
    this.list.replaceChildren(
      ...this.items.map((c, i) =>
        h(
          'li',
          {
            id: `palette-${i}`,
            role: 'option',
            class: 'palette-item',
            'aria-selected': i === this.active ? 'true' : 'false',
            onmousedown: (e: Event) => e.preventDefault(),
            onclick: () => this.runAt(i),
          },
          h('span', { class: 'palette-label' }, c.label),
          c.hint ? h('span', { class: 'palette-hint' }, c.hint) : null,
        ),
      ),
      ...(this.items.length ? [] : [h('li', { class: 'palette-empty' }, 'No matches')]),
    );
    this.input.setAttribute(
      'aria-activedescendant',
      this.items.length ? `palette-${this.active}` : '',
    );
    this.list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
}
