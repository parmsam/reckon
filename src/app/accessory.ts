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

/**
 * Math keys above the on-screen keyboard on touch devices, shown while the editor has focus.
 * Buttons keep focus in the editor, so the keyboard stays open.
 */
export function createAccessoryRow(
  editorDom: HTMLElement,
  insert: (text: string) => void,
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
  );

  // Sit just above the on-screen keyboard.
  const position = () => {
    const vv = window.visualViewport;
    const offset = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    row.style.bottom = `${offset}px`;
  };
  window.visualViewport?.addEventListener('resize', position);
  window.visualViewport?.addEventListener('scroll', position);

  editorDom.addEventListener('focusin', () => {
    row.hidden = !TOUCH.matches;
    position();
  });
  editorDom.addEventListener('focusout', () => (row.hidden = true));
  return row;
}
