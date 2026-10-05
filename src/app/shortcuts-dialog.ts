import { h } from './dom';

/** Lists the keyboard shortcuts. Opened from the sidebar, the palette, or `?`. */
export function createShortcutsDialog(mod: string): HTMLDialogElement {
  const keys = (combo: string) =>
    h('span', { class: 'keys' }, ...combo.split(' ').map((k) => h('kbd', {}, k)));
  const rows: [string, string][] = [
    [`${mod} K`, 'Command palette: every action, and jump to any note'],
    [`${mod} ⇧ C`, 'Copy the answer on the current line'],
    [`${mod} /`, 'Comment or uncomment lines'],
    [`${mod} ⇧ Space`, 'Pick the next option of a choice (car | [train] | fly)'],
    [`${mod} F`, 'Find and replace'],
    [`${mod} Z`, 'Undo (and ⇧ to redo)'],
    ['Tab', 'Accept an autocomplete suggestion'],
    ['Ctrl Space', 'Show autocomplete suggestions'],
    ['Esc', 'Close a dialog, the notes list on phones, or suggestions'],
    ['?', 'Show these shortcuts (outside the editor)'],
  ];
  const dialog = h(
    'dialog',
    { class: 'dialog shortcuts', 'aria-labelledby': 'shortcuts-title' },
    h(
      'form',
      { method: 'dialog' },
      h('h2', { id: 'shortcuts-title' }, 'Keyboard shortcuts'),
      h(
        'table',
        { class: 'shortcuts-table' },
        h(
          'tbody',
          {},
          ...rows.map(([combo, action]) =>
            h('tr', {}, h('td', {}, keys(combo)), h('td', {}, action)),
          ),
        ),
      ),
      h(
        'div',
        { class: 'dialog-actions' },
        h(
          'a',
          {
            class: 'dialog-link',
            href: `${import.meta.env.BASE_URL}docs/`,
            target: '_blank',
            rel: 'noopener',
          },
          'Full docs and syntax ↗',
        ),
        // Focus starts on Done (not the first link), so Enter or Esc closes the dialog.
        h('button', { class: 'primary-btn', autofocus: true }, 'Done'),
      ),
    ),
  );
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
  return dialog;
}
