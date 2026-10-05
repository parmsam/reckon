import { h, svg } from './dom';
import { LOGO } from './icons';
import { DEFAULT_PREFERENCES, type Preferences } from './preferences';

const LOCALES = [
  'en-US',
  'en-GB',
  'en-IN',
  'de-DE',
  'fr-FR',
  'es-ES',
  'it-IT',
  'nl-NL',
  'pt-BR',
  'sv-SE',
  'pl-PL',
  'ja-JP',
  'zh-CN',
  'ko-KR',
];
const SAMPLE = 1234.5;

function localeLabel(tag: string): string {
  const sample = new Intl.NumberFormat(tag || undefined).format(SAMPLE);
  if (!tag) return `Browser default (${sample})`;
  let name = tag;
  try {
    name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag) ?? tag;
  } catch {
    // Keep the tag.
  }
  return `${name} (${sample})`;
}

type Field = HTMLInputElement | HTMLSelectElement;

/** The Settings dialog. Changes apply as you make them. */
export class SettingsDialog {
  readonly el: HTMLDialogElement;
  private fields: Partial<Record<keyof Preferences, Field>> = {};
  private ratesNote = h('p', { class: 'field-hint', id: 'rates-hint' });
  private prefs: Preferences = { ...DEFAULT_PREFERENCES };

  constructor(
    private onChange: (prefs: Preferences) => void,
    onAddExamples: () => void,
  ) {
    const select = (key: keyof Preferences, options: [string, string][]) =>
      this.register(
        key,
        h(
          'select',
          { id: `pref-${key}` },
          ...options.map(([v, label]) => h('option', { value: v }, label)),
        ),
      );
    const number = (key: keyof Preferences, min: number, max: number) =>
      this.register(
        key,
        h('input', { id: `pref-${key}`, type: 'number', min, max, step: 1, inputmode: 'numeric' }),
      );
    const row = (label: string, field: Field, hint?: string) =>
      h(
        'div',
        { class: 'field' },
        h('label', { for: field.id }, label),
        field,
        hint ? h('p', { class: 'field-hint' }, hint) : null,
      );

    const fontSize = this.register(
      'fontSize',
      h('input', { id: 'pref-fontSize', type: 'range', min: 12, max: 24, step: 1 }),
    );
    const showSplash = this.register(
      'showSplash',
      h('input', { id: 'pref-showSplash', type: 'checkbox' }),
    );
    const showTips = this.register(
      'showTips',
      h('input', { id: 'pref-showTips', type: 'checkbox' }),
    );
    const showTotals = this.register(
      'showTotals',
      h('input', { id: 'pref-showTotals', type: 'checkbox' }),
    );
    const showLineNumbers = this.register(
      'showLineNumbers',
      h('input', { id: 'pref-showLineNumbers', type: 'checkbox' }),
    );
    const fetchRates = this.register(
      'fetchRates',
      h('input', { id: 'pref-fetchRates', type: 'checkbox', 'aria-describedby': 'rates-hint' }),
    );

    this.el = h(
      'dialog',
      { class: 'dialog settings', 'aria-labelledby': 'settings-title' },
      h(
        'form',
        { method: 'dialog' },
        // Focus starts on the title, so no control (like the Theme picker on phones) opens by itself.
        h('h2', { id: 'settings-title', tabindex: -1, autofocus: true }, 'Settings'),
        h(
          'fieldset',
          {},
          h('legend', {}, 'Appearance'),
          row(
            'Theme',
            select('theme', [
              ['system', 'Match system'],
              ['light', 'Light'],
              ['dark', 'Dark'],
            ]),
          ),
          row('Font size', fontSize),
          h(
            'div',
            { class: 'field checkbox' },
            showSplash,
            h('label', { for: 'pref-showSplash' }, 'Show the splash screen when Reckon opens'),
          ),
          h(
            'div',
            { class: 'field checkbox' },
            showTips,
            h('label', { for: 'pref-showTips' }, 'Show tips in the notes list'),
          ),
          h(
            'div',
            { class: 'field checkbox' },
            showTotals,
            h('label', { for: 'pref-showTotals' }, 'Show the total bar under the note'),
          ),
          h(
            'div',
            { class: 'field checkbox' },
            showLineNumbers,
            h('label', { for: 'pref-showLineNumbers' }, 'Show line numbers'),
          ),
        ),
        h(
          'fieldset',
          {},
          h('legend', {}, 'Numbers'),
          row(
            'Number and date format',
            select('locale', [
              ['', localeLabel('')],
              ...LOCALES.map((l): [string, string] => [l, localeLabel(l)]),
            ]),
            'Changes how answers look. Type numbers with a dot for decimals: 1,234.5',
          ),
          row('Decimal places', number('precision', 0, 20)),
          row('Decimal places with units', number('unitPrecision', 0, 20)),
          row(
            'Angles in sin, cos and tan',
            select('angleUnit', [
              ['deg', 'Degrees'],
              ['rad', 'Radians'],
            ]),
          ),
        ),
        h(
          'fieldset',
          {},
          h('legend', {}, 'CSS units'),
          row('Pixels per inch', number('ppi', 50, 600)),
          row('1em in pixels', number('emPx', 4, 64)),
        ),
        h(
          'fieldset',
          {},
          h('legend', {}, 'Privacy'),
          h(
            'div',
            { class: 'field checkbox' },
            fetchRates,
            h('label', { for: 'pref-fetchRates' }, 'Fetch exchange rates'),
          ),
          this.ratesNote,
        ),
        h(
          'fieldset',
          {},
          h('legend', {}, 'Help and about'),
          h(
            'div',
            { class: 'about' },
            svg(LOGO),
            h(
              'div',
              {},
              h('strong', {}, 'Reckon'),
              ` ${__APP_VERSION__}`,
              h('br'),
              h('span', { class: 'field-hint' }, 'A notepad that does the math.'),
            ),
          ),
          h(
            'p',
            { class: 'about-links' },
            ...(
              [
                ['Docs', `${import.meta.env.BASE_URL}docs/`],
                ['Privacy', `${import.meta.env.BASE_URL}docs/#privacy`],
                ['Source on GitHub', 'https://github.com/parmsam/reckon'],
                ['MIT license', 'https://github.com/parmsam/reckon/blob/main/LICENSE'],
              ] as const
            ).map(([label, href]) => h('a', { href, target: '_blank', rel: 'noopener' }, label)),
          ),
          h(
            'div',
            { class: 'field' },
            h(
              'button',
              {
                type: 'button',
                class: 'text-btn',
                onclick: () => {
                  this.el.close();
                  onAddExamples();
                },
              },
              'Add the tutorial and example notes',
            ),
            h(
              'p',
              { class: 'field-hint' },
              'Adds them as new notes; your notes are left as they are.',
            ),
          ),
        ),
        h(
          'div',
          { class: 'dialog-actions' },
          h(
            'button',
            { type: 'button', class: 'text-btn', onclick: () => this.reset() },
            'Reset to defaults',
          ),
          h('button', { class: 'primary-btn', value: 'done' }, 'Done'),
        ),
      ),
    );
    this.el.addEventListener('click', (e) => {
      // Clicking the backdrop closes the dialog.
      if (e.target === this.el) this.el.close();
    });
  }

  private register<T extends Field>(key: keyof Preferences, field: T): T {
    this.fields[key] = field;
    field.addEventListener(field.type === 'number' ? 'change' : 'input', () => this.read());
    return field;
  }

  open(prefs: Preferences, ratesAsOf?: number): void {
    this.write(prefs);
    const when = ratesAsOf
      ? new Date(ratesAsOf).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
      : 'never';
    this.ratesNote.textContent =
      `Rates are fetched at most hourly and never include your notes. When off, Reckon makes no network requests ` +
      `and keeps using saved rates (from ${when}).`;
    this.el.showModal();
  }

  private write(prefs: Preferences): void {
    this.prefs = { ...prefs };
    for (const [key, field] of Object.entries(this.fields) as [keyof Preferences, Field][]) {
      const value = prefs[key];
      if (field instanceof HTMLInputElement && field.type === 'checkbox')
        field.checked = Boolean(value);
      else field.value = String(value);
    }
  }

  private read(): void {
    const next = { ...this.prefs } as Record<keyof Preferences, unknown>;
    for (const [key, field] of Object.entries(this.fields) as [keyof Preferences, Field][]) {
      if (field instanceof HTMLInputElement && field.type === 'checkbox') next[key] = field.checked;
      else if (field instanceof HTMLInputElement) {
        const n = Number(field.value);
        const min = Number(field.min);
        const max = Number(field.max);
        if (field.value === '' || !Number.isFinite(n)) continue;
        next[key] = Math.min(max, Math.max(min, Math.round(n)));
        field.value = String(next[key]);
      } else next[key] = field.value;
    }
    this.prefs = next as Preferences;
    this.onChange(this.prefs);
  }

  /** Applies preferences from outside the dialog (the palette's theme switch). */
  apply(prefs: Preferences): void {
    this.write(prefs);
    this.onChange({ ...prefs });
  }

  private reset(): void {
    this.write(DEFAULT_PREFERENCES);
    this.onChange({ ...DEFAULT_PREFERENCES });
  }
}
