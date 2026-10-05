import { h } from './dom';

const KEYS: [label: string, insert: string, name: string][] = [
  ['+', ' + ', 'plus'],
  ['−', ' - ', 'minus'],
  ['×', ' × ', 'times'],
  ['÷', ' / ', 'divided by'],
  ['%', '%', 'percent'],
  ['(', '(', 'open parenthesis'],
  [')', ')', 'close parenthesis'],
  ['^', '^', 'power'],
  ['=', ' = ', 'equals'],
  ['$', '$', 'dollar'],
  ['in', ' in ', 'convert to'],
];

const TOUCH = window.matchMedia('(pointer: coarse)');
/** iPhone and iPad (which reports itself as a Mac with touch). */
const IOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/**
 * Math keys above the on-screen keyboard on touch devices, shown while the editor has focus.
 * Buttons keep focus in the editor, so the keyboard stays open.
 */
export function createAccessoryRow(
  editorDom: HTMLElement,
  insert: (text: string) => void,
  subtotal: () => void,
): HTMLElement {
  const row = h(
    'div',
    { class: 'accessory', role: 'toolbar', 'aria-label': 'Math keys', hidden: true },
    ...KEYS.map(([label, text, name]) =>
      h(
        'button',
        {
          type: 'button',
          class: 'accessory-key',
          'aria-label': name,
          onpointerdown: (e: Event) => e.preventDefault(),
          onclick: () => insert(text),
        },
        label,
      ),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'accessory-key',
        'aria-label': 'subtotal',
        title: 'Subtotal of the lines above',
        onpointerdown: (e: Event) => e.preventDefault(),
        onclick: () => subtotal(),
      },
      'Σ',
    ),
  );

  // Android: sit just above the on-screen keyboard. iOS draws its own floating bars (form
  // navigation, the address pill) over the bottom of the visible area, so there the row sits
  // at the top of the visible area instead.
  const position = () => {
    const vv = window.visualViewport;
    if (IOS && vv) {
      // Just below the top bar while it's visible; at the top once iOS scrolls it away.
      const bar = document.querySelector('.topbar')?.getBoundingClientRect();
      row.classList.add('top');
      row.style.top = `${Math.max(vv.offsetTop, bar?.bottom ?? 0)}px`;
      row.style.bottom = 'auto';
      return;
    }
    const offset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    row.style.bottom = `${offset}px`;
  };
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);

  // At the top (iOS), the row would cover the note's first line, so the editor makes room for it.
  const show = (visible: boolean) => {
    row.hidden = !visible;
    document.documentElement.classList.toggle('keys-top', visible && IOS);
    if (visible) position();
  };
  editorDom.addEventListener('focusin', () => show(TOUCH.matches));
  editorDom.addEventListener('focusout', () => show(false));
  return row;
}
