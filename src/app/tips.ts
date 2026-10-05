import { h } from './dom';

/** Text with `backtick` code spans, rendered as nodes. */
function rich(text: string): (Node | string)[] {
  return text.split('`').map((part, i) => (i % 2 ? h('code', {}, part) : part));
}

export interface Tip {
  id: string;
  text: string;
  action?: { label: string; run: () => void };
}

export interface TipContext {
  /** "⌘" or "Ctrl+". */
  mod: string;
  touch: boolean;
  /** Running as an installed app already. */
  installed: boolean;
  /** Set when the browser offers its own install prompt (Chrome, Edge, Android). */
  install?: () => void;
}

const UA = typeof navigator === 'undefined' ? '' : navigator.userAgent;
const IOS =
  /iPad|iPhone|iPod/.test(UA) ||
  (/Macintosh/.test(UA) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
const ANDROID = /Android/.test(UA);
const MAC_SAFARI =
  /Macintosh/.test(UA) && /Safari/.test(UA) && !/Chrome|Chromium|Edg|Firefox/.test(UA) && !IOS;

/** How to install Reckon on this device, if it can be installed and isn't yet. */
export function installTip(ctx: TipContext): Tip | undefined {
  if (ctx.installed) return undefined;
  const why = 'it opens in its own window and works offline.';
  if (ctx.install) {
    return {
      id: 'install',
      text: `Install Reckon as an app: ${why}`,
      action: { label: 'Install', run: ctx.install },
    };
  }
  if (IOS)
    return {
      id: 'install',
      text: `Install Reckon on your iPhone or iPad: tap Share, then Add to Home Screen. ${why[0]!.toUpperCase()}${why.slice(1)}`,
    };
  if (ANDROID)
    return {
      id: 'install',
      text: 'Install Reckon: open the browser menu (⋮), then Install app or Add to Home screen.',
    };
  if (MAC_SAFARI)
    return {
      id: 'install',
      text: `Add Reckon to your Dock: in Safari, choose File → Add to Dock. ${why[0]!.toUpperCase()}${why.slice(1)}`,
    };
  return undefined;
}

/** Tips in the order they're shown: installing first (when it applies), then features. */
export function tips(ctx: TipContext): Tip[] {
  const palette = ctx.touch ? 'Tap ⌘ in the top bar' : `Press ${ctx.mod}K`;
  const list: Tip[] = [
    { id: 'palette', text: `${palette} for every command, including jumping to any note.` },
    { id: 'copy', text: `${ctx.touch ? 'Tap' : 'Click'} any answer to copy it.` },
    {
      id: 'sum',
      text: '`sum` adds up the lines above it, back to the last heading or blank line.',
    },
    {
      id: 'variables',
      text: 'Name things with `=` (`rent = $1,200`) and use them in the lines below.',
    },
    {
      id: 'convert',
      text: 'Convert anything with `in`: `5 km in miles`, `$30 in EUR`, `3pm PST in London`.',
    },
    {
      id: 'units',
      text: 'Make your own units and functions: `1 sprint = 2 weeks`, `tip(bill, rate) = bill × rate`.',
    },
    {
      id: 'share',
      text: 'Share a note with the ↗ button. The whole note travels in the link, read-only for others.',
    },
    {
      id: 'export',
      text: 'Download a note with its answers as Markdown or a web page from the ↓ menu.',
    },
  ];
  if (!ctx.touch)
    list.push({
      id: 'shortcuts',
      text: 'Press `?` (outside the editor) to see every keyboard shortcut.',
    });
  const install = installTip(ctx);
  return install ? [install, ...list] : list;
}

const INDEX_KEY = 'reckon.tip';

/**
 * One tip at a time at the bottom of the notes list. Each visit shows the next tip, and "Next"
 * cycles. Tips are turned off in Settings.
 */
export class TipStrip {
  readonly el: HTMLElement;
  private list: Tip[] = [];
  private index = 0;

  constructor() {
    this.el = h('aside', { class: 'tip', 'aria-label': 'Tip', hidden: true });
    try {
      this.index = Number(localStorage.getItem(INDEX_KEY) ?? 0) || 0;
      // Next visit, next tip.
      localStorage.setItem(INDEX_KEY, String(this.index + 1));
    } catch {
      // Tips still work; they just start from the first one.
    }
  }

  /** Shows tips (or hides the strip when `enabled` is false). Install tips always come first. */
  update(list: Tip[], enabled: boolean): void {
    const install = list[0]?.id === 'install';
    this.list = list;
    if (install) this.index = 0;
    this.el.hidden = !enabled || !list.length;
    this.render();
  }

  private render(): void {
    if (this.el.hidden) return;
    const tip = this.list[this.index % this.list.length]!;
    this.el.replaceChildren(
      h('p', { class: 'tip-text' }, h('strong', {}, 'Tip: '), ...rich(tip.text)),
      h(
        'div',
        { class: 'tip-actions' },
        tip.action
          ? h(
              'button',
              { type: 'button', class: 'tip-primary', onclick: () => tip.action!.run() },
              tip.action.label,
            )
          : null,
        h('button', { type: 'button', class: 'text-btn', onclick: () => this.next() }, 'Next tip'),
      ),
    );
  }

  private next(): void {
    this.index = (this.index + 1) % this.list.length;
    try {
      localStorage.setItem(INDEX_KEY, String(this.index + 1));
    } catch {
      // Ignore.
    }
    this.render();
  }
}
