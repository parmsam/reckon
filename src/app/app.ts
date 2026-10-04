import { MENTIONS_CRYPTO } from '../data/rates';
import { COPIED_EVENT, createEditor } from '../editor';
import { createAutosave } from '../storage/autosave';
import { getSetting, setSetting } from '../storage/settings';
import {
  createBackup,
  fileName,
  isBackupFile,
  mergeImport,
  noteFromText,
  parseBackup,
} from './backup';
import { download, h, pickFiles, svg } from './dom';
import { ICONS } from './icons';
import { RatesManager } from './rates';
import { parseRoute, routeHash, type Route } from './router';
import { decodeShare, encodeShare } from './share';
import { Sidebar } from './sidebar';
import { NotesStore } from './store';
import { deriveTitle } from './title';
import { WELCOME_NOTE } from './welcome';

const CURRENT_NOTE = 'currentNoteId';
const SIDEBAR_PREF = 'reckon.sidebarCollapsed';
const MOBILE = window.matchMedia('(max-width: 800px)');
/** Share links longer than this may be cut off by chat apps and email clients. */
const LONG_LINK = 8000;

type Mode = { kind: 'note'; id: string } | { kind: 'share'; body: string } | { kind: 'none' };

export async function startApp(root: HTMLElement): Promise<void> {
  const store = new NotesStore();
  let storageError: unknown;
  try {
    await store.load();
  } catch (e) {
    storageError = e;
    console.error('Storage unavailable', e);
  }

  // ---- Elements -----------------------------------------------------------------------------
  const titleEl = h('h1', { class: 'note-title', id: 'note-title' }, 'Reckon');
  const statusEl = h('span', { class: 'save-status', id: 'save-status', role: 'status' });
  const toastText = h('span');
  const toastAction = h('button', { type: 'button', class: 'toast-action', hidden: true });
  const toastEl = h(
    'div',
    { class: 'toast', id: 'toast', role: 'status', 'aria-live': 'polite' },
    toastText,
    toastAction,
  );
  const bannerText = h('span');
  const bannerAction = h('button', { type: 'button', class: 'banner-action' });
  const banner = h('div', { class: 'banner', hidden: true }, bannerText, bannerAction);
  const editorEl = h('main', { class: 'editor', id: 'editor' });
  const noteActions = h(
    'span',
    { class: 'note-buttons' },
    h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Copy share link',
        title: 'Copy share link',
        onclick: () => void share(),
      },
      svg(ICONS.share),
    ),
    h(
      'button',
      {
        type: 'button',
        class: 'icon-btn',
        'aria-label': 'Download note',
        title: 'Download note',
        onclick: () => downloadNote(),
      },
      svg(ICONS.download),
    ),
  );
  const menuButton = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': 'Toggle notes list',
      'aria-controls': 'sidebar',
      onclick: () => toggleSidebar(),
    },
    svg(ICONS.menu),
  );
  const backdrop = h('div', { class: 'backdrop', onclick: () => closeDrawer() });

  // ---- Feedback -----------------------------------------------------------------------------
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  function toast(message: string, action?: { label: string; run: () => void }): void {
    toastText.textContent = message;
    toastAction.hidden = !action;
    toastAction.textContent = action?.label ?? '';
    toastAction.onclick = action
      ? () => {
          toastEl.classList.remove('visible');
          action.run();
        }
      : null;
    toastEl.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('visible'), action ? 5000 : 1800);
  }

  function showBanner(text: string | undefined, action?: { label: string; run: () => void }): void {
    banner.hidden = !text;
    bannerText.textContent = text ?? '';
    bannerAction.hidden = !action;
    bannerAction.textContent = action?.label ?? '';
    bannerAction.onclick = action ? () => action.run() : null;
  }

  function showTitle(body: string): void {
    const title = deriveTitle(body);
    titleEl.textContent = title;
    document.title = title === 'Untitled' ? 'Reckon' : `${title} · Reckon`;
  }

  // ---- Editing ------------------------------------------------------------------------------
  let mode: Mode = { kind: 'none' };
  const currentId = () => (mode.kind === 'note' ? mode.id : undefined);

  const autosave = createAutosave(async ({ id, body }: { id: string; body: string }) => {
    await store.saveBody(id, body);
    if (!autosave.dirty && currentId() === id) statusEl.textContent = 'Saved';
  });

  let persistRequested = false;
  function requestPersistence(): void {
    if (persistRequested) return;
    persistRequested = true;
    void navigator.storage?.persisted?.().then((persisted) => {
      if (!persisted) void navigator.storage.persist();
    });
  }

  const editor = createEditor({
    parent: editorEl,
    doc: '',
    settings: { locale: navigator.language },
    onChange: (body) => {
      const id = currentId();
      if (!id) return;
      showTitle(body);
      checkCrypto(body);
      if (storageError) return;
      statusEl.textContent = 'Saving…';
      autosave.schedule({ id, body });
      requestPersistence();
    },
  });
  editor.view.dom.addEventListener(COPIED_EVENT, (e) =>
    toast(`Copied ${(e as CustomEvent<string>).detail}`),
  );

  // ---- Exchange rates -----------------------------------------------------------------------
  const rates = new RatesManager((snapshot) =>
    editor.setSettings({ rates: snapshot.rates, ratesAsOf: snapshot.fetchedAt }),
  );
  /** Crypto prices are fetched only once a note mentions crypto. */
  const checkCrypto = (body: string) => {
    if (MENTIONS_CRYPTO.test(body)) rates.needCrypto();
  };
  void rates.init().then(() => rates.refresh());
  window.addEventListener('online', () => void rates.refresh());
  setInterval(() => void rates.refresh(), 15 * 60 * 1000);

  // ---- Sidebar ------------------------------------------------------------------------------
  const sidebar = new Sidebar(store, {
    open: (id) => navigate({ kind: 'note', id }),
    create: () => void createAndOpen(),
    setPinned: (id, pinned) => void store.setPinned(id, pinned),
    trash: (id) => void trashNote(id),
    restore: (id) => void restoreNote(id),
    destroy: (id) => void destroyNote(id),
    emptyTrash: () => void emptyTrash(),
    importFiles: () => void importFiles(),
    exportAll: () => exportAll(),
  });

  const app = h(
    'div',
    { class: 'app' },
    sidebar.el,
    backdrop,
    h(
      'div',
      { class: 'main' },
      h('header', { class: 'topbar' }, menuButton, titleEl, statusEl, noteActions),
      banner,
      editorEl,
    ),
    toastEl,
  );
  root.replaceChildren(app);

  function readCollapsed(): boolean {
    try {
      return localStorage.getItem(SIDEBAR_PREF) === '1';
    } catch {
      return false;
    }
  }
  app.classList.toggle('sidebar-collapsed', readCollapsed());

  function toggleSidebar(): void {
    if (MOBILE.matches) {
      app.classList.toggle('drawer-open');
      if (app.classList.contains('drawer-open')) sidebar.focusSearch();
      return;
    }
    const collapsed = app.classList.toggle('sidebar-collapsed');
    try {
      localStorage.setItem(SIDEBAR_PREF, collapsed ? '1' : '0');
    } catch {
      // Preference just won't persist.
    }
  }

  function closeDrawer(): void {
    app.classList.remove('drawer-open');
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && app.classList.contains('drawer-open')) {
      closeDrawer();
      editor.view.focus();
    }
  });

  // ---- Navigation ---------------------------------------------------------------------------
  function navigate(route: Route, { replace = false } = {}): void {
    const hash = routeHash(route);
    if (replace) {
      history.replaceState(null, '', hash || location.pathname + location.search);
      void handleRoute();
    } else if (location.hash === hash) {
      void handleRoute();
    } else {
      location.hash = hash;
    }
  }

  window.addEventListener('hashchange', () => void handleRoute());

  async function handleRoute(): Promise<void> {
    closeDrawer();
    const route = parseRoute(location.hash);
    if (route.kind === 'share') return openShare(route.payload);
    if (route.kind === 'note' && store.get(route.id)) return openNote(route.id);
    return openHome();
  }

  /** Leaves the current note. Untouched empty notes are deleted rather than left behind. */
  async function leaveCurrent(nextId?: string): Promise<void> {
    await autosave.flush();
    const id = currentId();
    const note = id ? store.get(id) : undefined;
    if (
      note &&
      id !== nextId &&
      note.body.trim() === '' &&
      !note.pinned &&
      note.deletedAt === undefined
    ) {
      await store.destroy([note.id]);
    }
  }

  async function openNote(id: string): Promise<void> {
    if (currentId() === id) return;
    await leaveCurrent(id);
    const note = store.get(id);
    if (!note) return openHome();

    mode = { kind: 'note', id };
    const trashed = note.deletedAt !== undefined;
    editor.setDoc(note.body, { readOnly: trashed });
    showTitle(note.body);
    checkCrypto(note.body);
    statusEl.textContent = storageError ? 'Not saved: storage unavailable' : '';
    noteActions.hidden = false;
    showBanner(
      trashed ? 'This note is in the trash.' : undefined,
      trashed ? { label: 'Restore', run: () => void restoreNote(id) } : undefined,
    );
    sidebar.setCurrent(id);
    if (!trashed) void setSetting(CURRENT_NOTE, id).catch(() => {});
    if (!MOBILE.matches) editor.view.focus();
  }

  async function openHome(): Promise<void> {
    let id: string | undefined;
    try {
      id = await getSetting<string>(CURRENT_NOTE);
    } catch {
      // Storage unavailable.
    }
    const remembered = id ? store.get(id) : undefined;
    let target = remembered && remembered.deletedAt === undefined ? remembered : store.active()[0];

    if (!target) {
      if (storageError) {
        // Nowhere to save, but the editor still works.
        mode = { kind: 'none' };
        editor.setDoc(WELCOME_NOTE);
        showTitle(WELCOME_NOTE);
        noteActions.hidden = true;
        statusEl.textContent = 'Not saved: storage unavailable';
        return;
      }
      const firstRun = store.trashed().length === 0;
      target = await store.create(firstRun ? WELCOME_NOTE : '');
    }
    navigate({ kind: 'note', id: target.id }, { replace: true });
  }

  async function openShare(payload: string): Promise<void> {
    let body: string;
    try {
      body = await decodeShare(payload);
    } catch {
      toast('That share link is broken or incomplete');
      return navigate({ kind: 'home' }, { replace: true });
    }
    await leaveCurrent();
    mode = { kind: 'share', body };
    editor.setDoc(body, { readOnly: true });
    checkCrypto(body);
    showTitle(body);
    statusEl.textContent = '';
    noteActions.hidden = true;
    sidebar.setCurrent(undefined);
    showBanner(
      'Shared note · read-only',
      storageError ? undefined : { label: 'Save a copy', run: () => void saveSharedCopy() },
    );
  }

  async function saveSharedCopy(): Promise<void> {
    if (mode.kind !== 'share') return;
    const note = await store.create(mode.body);
    navigate({ kind: 'note', id: note.id });
    toast('Saved to your notes');
  }

  // ---- Note actions -------------------------------------------------------------------------
  async function createAndOpen(): Promise<void> {
    if (storageError) return toast('Storage is unavailable in this browser');
    await autosave.flush();
    const note = await store.create('');
    navigate({ kind: 'note', id: note.id });
    editor.view.focus();
  }

  async function trashNote(id: string): Promise<void> {
    await autosave.flush();
    await store.trash(id);
    if (currentId() === id) {
      mode = { kind: 'none' };
      const next = store.active()[0];
      if (next) navigate({ kind: 'note', id: next.id });
      else await createAndOpen();
    }
    toast('Moved to trash', { label: 'Undo', run: () => void restoreNote(id, true) });
  }

  async function restoreNote(id: string, open = false): Promise<void> {
    await store.restore(id);
    if (currentId() === id || open) {
      mode = { kind: 'none' };
      navigate({ kind: 'note', id });
    }
    if (!open) toast('Restored');
  }

  async function destroyNote(id: string): Promise<void> {
    const note = store.get(id);
    if (!note || !confirm(`Delete “${deriveTitle(note.body)}” forever? This can't be undone.`))
      return;
    await store.destroy([id]);
    if (currentId() === id) {
      mode = { kind: 'none' };
      navigate({ kind: 'home' }, { replace: true });
    }
  }

  async function emptyTrash(): Promise<void> {
    const count = store.trashed().length;
    if (
      !count ||
      !confirm(`Delete ${count} note${count === 1 ? '' : 's'} forever? This can't be undone.`)
    )
      return;
    const viewingTrashed = store.trashed().some((n) => n.id === currentId());
    await store.emptyTrash();
    if (viewingTrashed) {
      mode = { kind: 'none' };
      navigate({ kind: 'home' }, { replace: true });
    }
  }

  async function share(): Promise<void> {
    const url = `${location.origin}${location.pathname}#/share/${await encodeShare(editor.getDoc())}`;
    try {
      await navigator.clipboard.writeText(url);
      toast(
        url.length > LONG_LINK
          ? 'Link copied (it is long; some apps may cut it off)'
          : 'Share link copied',
      );
    } catch {
      toast('Could not copy the link');
    }
  }

  function downloadNote(): void {
    const body = editor.getDoc();
    download(fileName(deriveTitle(body), 'txt'), body, 'text/plain;charset=utf-8');
  }

  function exportAll(): void {
    if (storageError) return toast('Storage is unavailable in this browser');
    const notes = [...store.active(), ...store.trashed()];
    const date = new Date().toISOString().slice(0, 10);
    download(
      `reckon-backup-${date}.json`,
      JSON.stringify(createBackup(notes), null, 2),
      'application/json',
    );
    toast(`Exported ${notes.length} note${notes.length === 1 ? '' : 's'}`);
  }

  async function importFiles(): Promise<void> {
    if (storageError) return toast('Storage is unavailable in this browser');
    const files = await pickFiles('.json,.txt,.md,application/json,text/plain,text/markdown');
    let imported = 0;
    try {
      for (const file of files) {
        if (isBackupFile(file.name, file.text)) {
          const existing = new Map([...store.active(), ...store.trashed()].map((n) => [n.id, n]));
          const notes = mergeImport(existing, parseBackup(file.text));
          await store.putMany(notes);
          imported += notes.length;
        } else {
          await store.putMany([noteFromText(file.text)]);
          imported += 1;
        }
      }
      toast(`Imported ${imported} note${imported === 1 ? '' : 's'}`);
    } catch (e) {
      toast(`Import failed: ${(e as Error).message}`);
    }
  }

  // ---- Other tabs ---------------------------------------------------------------------------
  store.onRemoteChange((ids) => {
    const id = currentId();
    if (!id || !ids.includes(id)) return;
    const note = store.get(id);
    if (!note) {
      mode = { kind: 'none' };
      navigate({ kind: 'home' }, { replace: true });
      return;
    }
    // If this tab has unsaved edits, they win when they're saved.
    if (autosave.dirty) return;
    if (note.deletedAt !== undefined) {
      mode = { kind: 'none' };
      void openNote(id);
      return;
    }
    editor.applyExternal(note.body);
    showTitle(note.body);
    checkCrypto(note.body);
  });

  // Flush pending edits when the tab is hidden or closed.
  const flush = () => void autosave.flush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  await handleRoute();
}
