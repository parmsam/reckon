type Child = Node | string | false | null | undefined;
type Attrs = Record<string, string | number | boolean | EventListener | undefined>;

/** Tiny element builder: h('button', { class: 'x', onclick: fn }, 'Label'). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2), value);
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children) if (child) el.append(child);
  return el;
}

/** Parses a trusted inline SVG string from icons.ts. */
export function svg(markup: string): SVGElement {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild as SVGElement;
}

export function download(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Opens a file picker and resolves with the chosen files' names and contents. */
export function pickFiles(accept: string): Promise<{ name: string; text: string }[]> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, multiple: true });
    input.addEventListener('change', async () => {
      const files = [...(input.files ?? [])];
      resolve(await Promise.all(files.map(async (f) => ({ name: f.name, text: await f.text() }))));
    });
    input.click();
  });
}

export function relativeTime(timestamp: number, now = Date.now(), locale?: string): string {
  const seconds = Math.round((timestamp - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 45) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 7) return rtf.format(Math.round(seconds / 86400), 'day');
  return new Date(timestamp).toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}
