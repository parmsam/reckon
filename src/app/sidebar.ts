import type { Note } from '../storage/db';
import { h, relativeTime, svg } from './dom';
import { ICONS } from './icons';
import { filterNotes } from './search';
import type { NotesStore } from './store';
import { deriveTitle } from './title';

export interface SidebarHandlers {
  open(id: string): void;
  create(): void;
  setPinned(id: string, pinned: boolean): void;
  trash(id: string): void;
  restore(id: string): void;
  destroy(id: string): void;
  emptyTrash(): void;
  importFiles(): void;
  exportAll(): void;
}

/** Second meaningful line of a note, shown under its title. */
function snippet(body: string): string {
  const lines = body.split('\n').map((l) => l.trim());
  const meaningful = lines.filter((l) => l && !l.startsWith('//'));
  return (meaningful[1] ?? '').replace(/^#+\s*/, '');
}

const iconButton = (
  icon: string,
  label: string,
  onclick: () => void,
  extra: Record<string, string> = {},
) =>
  h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': label,
      title: label,
      onclick: (e: Event) => {
        e.stopPropagation();
        onclick();
      },
      ...extra,
    },
    svg(icon),
  );

export class Sidebar {
  readonly el: HTMLElement;
  private list: HTMLUListElement;
  private heading: HTMLElement;
  private footer: HTMLElement;
  private search: HTMLInputElement;
  private view: 'notes' | 'trash' = 'notes';
  private currentId?: string;

  constructor(
    private store: NotesStore,
    private handlers: SidebarHandlers,
  ) {
    this.search = h('input', {
      type: 'search',
      class: 'search-input',
      placeholder: 'Search notes',
      'aria-label': 'Search notes',
      oninput: () => this.render(),
      onkeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === 'Escape' && this.search.value) {
          e.stopPropagation();
          this.search.value = '';
          this.render();
        }
      },
    });
    this.heading = h('h2', { class: 'sidebar-heading' });
    this.list = h('ul', { class: 'note-list', role: 'list' });
    this.footer = h('div', { class: 'sidebar-foot' });
    this.el = h(
      'aside',
      { class: 'sidebar', id: 'sidebar', 'aria-label': 'Notes' },
      h(
        'div',
        { class: 'sidebar-head' },
        h('label', { class: 'search' }, svg(ICONS.search), this.search),
        iconButton(ICONS.plus, 'New note', () => handlers.create(), { class: 'icon-btn primary' }),
      ),
      this.heading,
      this.list,
      this.footer,
    );
    store.subscribe(() => this.render());
    this.render();
  }

  setCurrent(id: string | undefined): void {
    this.currentId = id;
    this.render();
  }

  focusSearch(): void {
    this.search.focus();
    this.search.select();
  }

  private setView(view: 'notes' | 'trash'): void {
    this.view = view;
    this.render();
  }

  render(): void {
    const trash = this.view === 'trash';
    const all = trash ? this.store.trashed() : this.store.active();
    const notes = filterNotes(all, this.search.value);
    const now = Date.now();

    this.heading.textContent = trash ? 'Trash' : 'Notes';
    this.list.replaceChildren(
      ...notes.map((n) => this.item(n, trash, now)),
      ...(notes.length
        ? []
        : [
            h(
              'li',
              { class: 'note-empty' },
              this.search.value ? 'No matching notes' : trash ? 'Trash is empty' : 'No notes yet',
            ),
          ]),
    );

    const trashCount = this.store.trashed().length;
    this.footer.replaceChildren(
      trash
        ? h(
            'button',
            { type: 'button', class: 'text-btn', onclick: () => this.setView('notes') },
            '← Notes',
          )
        : h(
            'button',
            { type: 'button', class: 'text-btn', onclick: () => this.setView('trash') },
            svg(ICONS.trash),
            trashCount ? `Trash (${trashCount})` : 'Trash',
          ),
      trash && trashCount
        ? h(
            'button',
            { type: 'button', class: 'text-btn danger', onclick: () => this.handlers.emptyTrash() },
            'Empty trash',
          )
        : h(
            'span',
            { class: 'foot-actions' },
            iconButton(ICONS.upload, 'Import notes', () => this.handlers.importFiles()),
            iconButton(ICONS.download, 'Export all notes', () => this.handlers.exportAll()),
          ),
    );
  }

  private item(note: Note, trash: boolean, now: number): HTMLLIElement {
    const title = deriveTitle(note.body);
    const meta = [relativeTime(trash ? note.deletedAt! : note.updatedAt, now), snippet(note.body)]
      .filter(Boolean)
      .join(' · ');
    const actions = trash
      ? [
          iconButton(ICONS.restore, `Restore ${title}`, () => this.handlers.restore(note.id)),
          iconButton(ICONS.close, `Delete ${title} forever`, () => this.handlers.destroy(note.id)),
        ]
      : [
          iconButton(ICONS.pin, note.pinned ? `Unpin ${title}` : `Pin ${title}`, () =>
            this.handlers.setPinned(note.id, !note.pinned),
          ),
          iconButton(ICONS.trash, `Move ${title} to trash`, () => this.handlers.trash(note.id)),
        ];
    return h(
      'li',
      {
        class: `note-item${note.pinned ? ' pinned' : ''}`,
        'aria-current': note.id === this.currentId ? 'page' : undefined,
        'data-id': note.id,
      },
      h(
        'button',
        { type: 'button', class: 'note-open', onclick: () => this.handlers.open(note.id) },
        h(
          'span',
          { class: 'note-item-title' },
          note.pinned && !trash ? svg(ICONS.pin) : null,
          title,
        ),
        h('span', { class: 'note-item-meta' }, meta),
      ),
      h('span', { class: 'note-actions' }, ...actions),
    );
  }
}
