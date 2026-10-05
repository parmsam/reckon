import { MENTIONS_CRYPTO } from '../data/rates';
import { CHANGELOG_URL } from '../links';
import { openSearchPanel } from '@codemirror/search';
import { COPIED_EVENT, createEditor } from '../editor';
import { toggleLineComment } from '../editor/commands';
import { copyCurrentResult } from '../editor/results';
import { summarize } from '../editor/summary';
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
import { toHtml, toMarkdown, toText } from '../export';
import { createAccessoryRow } from './accessory';
import { download, h, pickFiles, svg } from './dom';
import { ICONS } from './icons';
import { Palette, type Command } from './palette';
import {
  applyAppearance,
  engineSettings,
  loadPreferences,
  savePreferences,
  type Preferences,
} from './preferences';
import { RatesManager } from './rates';
import { parseRoute, routeHash, type Route } from './router';
import { decodeShare, shareLink } from './share';
import { SettingsDialog } from './settings-dialog';
import { watchForUpdates } from './updates';
import { installTip, tips, TipStrip, type TipContext } from './tips';
import { createShortcutsDialog } from './shortcuts-dialog';
import { Sidebar } from './sidebar';
import { NotesStore } from './store';
import { deriveTitle } from './title';
import { FIRST_RUN_NOTES, WELCOME_NOTE } from './welcome';
import { newNote } from '../storage/notes';

const CURRENT_NOTE = 'currentNoteId';
/** The version this browser last opened, to announce updates once. */
const LAST_VERSION_KEY = 'reckon.version';
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
        'aria-label': 'Download or export note',
        title: 'Download or export',
        'aria-haspopup': 'menu',
        'aria-controls': 'export-menu',
        onclick: (e: Event) => toggleExportMenu(e.currentTarget as HTMLElement),
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
  function toast(
    message: string,
    action?: { label: string; run: () => void },
    { sticky = false } = {},
  ): void {
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
    if (sticky) return;
    // Longer messages and ones with an action stay up longer.
    toastTimer = setTimeout(
      () => toastEl.classList.remove('visible'),
      action || message.length > 60 ? 5000 : 1800,
    );
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

  // ---- Total bar (under the note) -----------------------------------------------------------
  const totalBar = h('footer', {
    class: 'totalbar',
    'aria-live': 'polite',
    'aria-label': 'Totals',
  });
  const copyValue = (value: string) =>
    navigator.clipboard.writeText(value).then(
      () => toast(`Copied ${value}`),
      () => toast('Could not copy'),
    );
  /** `change` is how far the value moved during a slider or scrub ("+$120.00"). */
  const copyButton = (label: string, value: string, change?: string) =>
    h(
      'button',
      {
        type: 'button',
        class: 'totalbar-value',
        title: 'Click to copy',
        onclick: () => void copyValue(value),
      },
      h('span', { class: 'totalbar-name' }, `${label} `),
      h('strong', {}, value),
      change ? h('span', { class: 'totalbar-delta' }, ` ${change}`) : '',
    );

  /** The section total (or the selection's sum, average and count) for where the cursor is. */
  function renderTotals(): void {
    totalBar.hidden = !prefs.showTotals;
    const summary = prefs.showTotals ? summarize(editor.view.state) : undefined;
    if (!summary) return totalBar.replaceChildren();
    if (summary.kind === 'section') {
      return totalBar.replaceChildren(
        summary.label ? h('span', { class: 'totalbar-label' }, summary.label) : '',
        copyButton('Total', summary.total, summary.change),
      );
    }
    const n = summary.count;
    totalBar.replaceChildren(
      h('span', { class: 'totalbar-label' }, `${n} answer${n === 1 ? '' : 's'} selected`),
      summary.sum ? copyButton('Sum', summary.sum, summary.change) : '',
      summary.avg && n > 1 ? copyButton('Average', summary.avg) : '',
    );
  }

  let prefs: Preferences = await loadPreferences();
  applyAppearance(prefs);

  const editor = createEditor({
    parent: editorEl,
    doc: '',
    settings: {
      ...engineSettings(prefs),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: Date.now(),
    },
    onUpdate: () => renderTotals(),
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
  editor.setLineNumbers(prefs.showLineNumbers);
  editor.view.dom.addEventListener(COPIED_EVENT, (e) =>
    toast(`Copied ${(e as CustomEvent<string>).detail}`),
  );

  // Keep "now" and "today" current.
  setInterval(() => editor.setSettings({ now: Date.now() }), 30_000);

  // ---- Exchange rates -----------------------------------------------------------------------
  const rates = new RatesManager((snapshot) =>
    editor.setSettings({ rates: snapshot.rates, ratesAsOf: snapshot.fetchedAt }),
  );
  /** Crypto prices are fetched only once a note mentions crypto. */
  const checkCrypto = (body: string) => {
    if (MENTIONS_CRYPTO.test(body)) rates.needCrypto();
  };
  rates.enabled = prefs.fetchRates;
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
    openSettings: () => openSettings(),
    openShortcuts: () => openShortcuts(),
  });

  // ---- Settings and command palette ---------------------------------------------------------
  const settingsDialog = new SettingsDialog(
    (next) => {
      prefs = next;
      applyAppearance(prefs);
      editor.setSettings(engineSettings(prefs));
      rates.enabled = prefs.fetchRates;
      if (prefs.fetchRates) void rates.refresh();
      void savePreferences(prefs).catch(() => {});
      refreshTips();
      renderTotals();
      editor.setLineNumbers(prefs.showLineNumbers);
    },
    () => void addExampleNotes(),
  );

  // ---- Tips and installing ------------------------------------------------------------------
  /** The browser's install prompt (Chrome, Edge, Android), kept until a tip's Install button uses it. */
  interface InstallPrompt extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  }
  let installPrompt: InstallPrompt | undefined;
  const isInstalled = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true;

  const tipContext = (): TipContext => ({
    mod: MOD.replace('+', ''),
    touch: window.matchMedia('(pointer: coarse)').matches,
    installed: isInstalled(),
    install: installPrompt ? () => void install() : undefined,
  });

  async function install(): Promise<void> {
    if (!installPrompt) return;
    const prompt = installPrompt;
    installPrompt = undefined;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === 'accepted') toast('Installing Reckon');
    refreshTips();
  }

  const tipStrip = new TipStrip();
  function refreshTips(): void {
    tipStrip.update(tips(tipContext()), prefs.showTips);
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    // Offer installing from the tip instead of the browser's own banner.
    e.preventDefault();
    installPrompt = e as InstallPrompt;
    refreshTips();
  });
  window.addEventListener('appinstalled', () => {
    installPrompt = undefined;
    refreshTips();
  });

  /**
   * Adds the tutorial and example notes (as new notes), skipping any that are already here
   * unchanged, then opens the tutorial.
   */
  async function addExampleNotes(): Promise<void> {
    if (storageError) return toast('Storage is unavailable in this browser');
    const existing = new Set(store.active().map((n) => n.body));
    const missing = FIRST_RUN_NOTES.filter((body) => !existing.has(body));
    const now = Date.now();
    const notes = missing.map((body, i) => newNote(body, now - (missing.length - 1 - i)));
    await store.putMany(notes);
    const tutorial = store.active().find((n) => n.body === WELCOME_NOTE);
    if (tutorial) navigate({ kind: 'note', id: tutorial.id });
    toast(
      notes.length
        ? `Added ${notes.length} note${notes.length === 1 ? '' : 's'}`
        : 'The tutorial and examples are already in your notes',
    );
  }

  function openSettings(): void {
    closeDrawer();
    settingsDialog.open(prefs, rates.snapshot?.fetchedAt);
  }

  const isDark = () =>
    prefs.theme === 'dark' ||
    (prefs.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl+';

  const commands = (): Command[] => {
    const id = currentId();
    const note = id ? store.get(id) : undefined;
    const run = (fn: () => unknown) => () => {
      void fn();
    };
    const list: Command[] = [
      { id: 'new', label: 'New note', run: run(createAndOpen) },
      {
        id: 'search',
        label: 'Search notes',
        keywords: 'find filter',
        run: () => {
          if (MOBILE.matches) app.classList.add('drawer-open');
          else app.classList.remove('sidebar-collapsed');
          sidebar.focusSearch();
        },
      },
      {
        id: 'find',
        label: 'Find and replace in this note',
        hint: `${MOD}F`,
        run: () => openSearchPanel(editor.view),
      },
      {
        id: 'copy',
        label: 'Copy the answer on this line',
        hint: `${MOD}⇧C`,
        run: () => copyCurrentResult(editor.view),
      },
      {
        id: 'comment',
        label: 'Comment or uncomment lines',
        hint: `${MOD}/`,
        run: () => toggleLineComment(editor.view),
      },
      {
        id: 'docs',
        label: 'Help and docs',
        keywords: 'syntax reference guide manual llm prompt',
        run: () => window.open(`${import.meta.env.BASE_URL}docs/`, '_blank', 'noopener'),
      },
      ...(installTip(tipContext())
        ? [
            {
              id: 'install',
              label: 'Install Reckon as an app',
              keywords: 'pwa home screen dock offline',
              run: () => {
                const tip = installTip(tipContext())!;
                if (tip.action) tip.action.run();
                else toast(tip.text);
              },
            },
          ]
        : []),
      {
        id: 'examples',
        label: 'Add the tutorial and example notes',
        keywords: 'welcome help examples budget trip guide',
        run: () => void addExampleNotes(),
      },
      {
        id: 'whats-new',
        label: "What's new in Reckon",
        keywords: 'changelog release notes version update',
        hint: __APP_VERSION__,
        run: () => window.open(CHANGELOG_URL, '_blank', 'noopener'),
      },
      {
        id: 'github',
        label: 'Source code on GitHub',
        keywords: 'repository issues bug report contribute',
        run: () => window.open('https://github.com/parmsam/reckon', '_blank', 'noopener'),
      },
      {
        id: 'shortcuts',
        label: 'Keyboard shortcuts',
        keywords: 'keys help hotkeys',
        hint: '?',
        run: () => openShortcuts(),
      },
      {
        id: 'settings',
        label: 'Settings',
        keywords: 'preferences options theme font precision privacy',
        run: openSettings,
      },
      {
        id: 'theme',
        label: isDark() ? 'Switch to light theme' : 'Switch to dark theme',
        keywords: 'appearance mode',
        run: () => settingsDialog.apply({ ...prefs, theme: isDark() ? 'light' : 'dark' }),
      },
      { id: 'sidebar', label: 'Show or hide the notes list', run: toggleSidebar },
      {
        id: 'trash-view',
        label: 'Show trash',
        keywords: 'deleted',
        run: () => {
          sidebar.setView('trash');
          if (MOBILE.matches) app.classList.add('drawer-open');
          else app.classList.remove('sidebar-collapsed');
        },
      },
      { id: 'export', label: 'Export all notes', keywords: 'backup json download', run: exportAll },
      {
        id: 'import',
        label: 'Import notes',
        keywords: 'restore backup upload',
        run: run(importFiles),
      },
    ];
    if (note && note.deletedAt === undefined) {
      list.push(
        { id: 'share', label: 'Copy share link', keywords: 'url send', run: run(share) },
        {
          id: 'download',
          label: 'Download as text',
          keywords: 'save txt file',
          run: () => exportNote('text'),
        },
        {
          id: 'export-answers',
          label: 'Download as text with answers',
          keywords: 'export results txt',
          run: () => exportNote('answers'),
        },
        {
          id: 'export-markdown',
          label: 'Download as Markdown with answers',
          keywords: 'export md results',
          run: () => exportNote('markdown'),
        },
        {
          id: 'export-html',
          label: 'Download as a web page with answers',
          keywords: 'export html print results',
          run: () => exportNote('html'),
        },
        {
          id: 'copy-answers',
          label: 'Copy note with answers',
          keywords: 'export clipboard results',
          run: () => exportNote('copy'),
        },
        {
          id: 'pin',
          label: note.pinned ? 'Unpin this note' : 'Pin this note',
          run: run(() => store.setPinned(note.id, !note.pinned)),
        },
        {
          id: 'trash',
          label: 'Move this note to trash',
          keywords: 'delete remove',
          run: run(() => trashNote(note.id)),
        },
      );
    }
    for (const n of store.active()) {
      if (n.id === id) continue;
      list.push({
        id: `note-${n.id}`,
        label: deriveTitle(n.body),
        hint: 'Note',
        run: () => navigate({ kind: 'note', id: n.id }),
      });
    }
    return list;
  };
  const palette = new Palette(commands);
  const shortcutsDialog = createShortcutsDialog(MOD);
  function openShortcuts(): void {
    closeDrawer();
    shortcutsDialog.showModal();
  }

  document.addEventListener(
    'keydown',
    (e) => {
      // `?` shows the shortcuts, unless the user is typing somewhere.
      const target = e.target as HTMLElement | null;
      const typing = target?.closest('input, select, textarea, [contenteditable="true"]');
      if (
        e.key === '?' &&
        !typing &&
        !e.metaKey &&
        !e.ctrlKey &&
        !document.querySelector('dialog[open]')
      ) {
        e.preventDefault();
        openShortcuts();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (palette.isOpen) palette.close();
        else palette.open();
      }
    },
    { capture: true },
  );
  palette.el.addEventListener('close', () => {
    if (!settingsDialog.el.open) editor.view.focus();
  });

  const commandButton = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': `Commands (${MOD}K)`,
      title: `Commands (${MOD}K)`,
      onclick: () => palette.open(),
    },
    svg(ICONS.command),
  );
  const docsLink = h(
    'a',
    {
      class: 'icon-btn',
      href: `${import.meta.env.BASE_URL}docs/`,
      target: '_blank',
      rel: 'noopener',
      'aria-label': 'Docs (opens in a new tab)',
      title: 'Docs',
    },
    svg(ICONS.docs),
  );
  const githubLink = h(
    'a',
    {
      class: 'icon-btn wide-only',
      href: 'https://github.com/parmsam/reckon',
      target: '_blank',
      rel: 'noopener',
      'aria-label': 'Reckon on GitHub (opens in a new tab)',
      title: 'Source on GitHub',
    },
    svg(ICONS.github),
  );
  const shortcutsButton = h(
    'button',
    {
      type: 'button',
      class: 'icon-btn',
      'aria-label': 'Keyboard shortcuts (?)',
      title: 'Keyboard shortcuts (?)',
      onclick: () => openShortcuts(),
    },
    svg(ICONS.keyboard),
  );
  const accessory = createAccessoryRow(editor.view.dom, (text) => editor.insert(text));

  const app = h(
    'div',
    { class: 'app' },
    sidebar.el,
    backdrop,
    h(
      'div',
      { class: 'main' },
      h(
        'header',
        { class: 'topbar' },
        menuButton,
        titleEl,
        statusEl,
        noteActions,
        docsLink,
        githubLink,
        shortcutsButton,
        commandButton,
      ),
      banner,
      editorEl,
      totalBar,
    ),
    toastEl,
    accessory,
    settingsDialog.el,
    palette.el,
    shortcutsDialog,
  );
  root.replaceChildren(app);
  sidebar.el.insertBefore(tipStrip.el, sidebar.el.querySelector('.sidebar-foot'));
  refreshTips();

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
  /** The app's plain address, with no note in it. */
  const appUrl = () => location.pathname + location.search;
  const stateNote = () => (history.state as { note?: string } | null)?.note;

  /**
   * Notes open without changing the address: it stays at the app's plain URL, so copying it
   * never shares (or seems to share) a note. Each note gets its own history entry, so back and
   * forward still work. Share and plain-text links keep their address while previewed.
   */
  function navigate(route: Route, { replace = false } = {}): void {
    if (route.kind === 'note' || route.kind === 'home') {
      const state = route.kind === 'note' ? { note: route.id } : null;
      const same = route.kind === 'note' && stateNote() === route.id && !location.hash;
      if (replace || same || route.kind === 'home') history.replaceState(state, '', appUrl());
      else history.pushState(state, '', appUrl());
      void handleRoute();
      return;
    }
    const hash = routeHash(route);
    if (location.hash === hash) void handleRoute();
    else location.hash = hash;
  }

  // Back/forward between notes, and links typed or pasted into the address bar.
  window.addEventListener('popstate', () => void handleRoute());

  async function handleRoute(): Promise<void> {
    closeDrawer();
    const route = parseRoute(location.hash);
    if (route.kind === 'share') return openShare(route.payload);
    if (route.kind === 'text')
      return showShared(route.text, 'A note from a link, opened in Reckon · read-only');
    if (route.kind === 'badLink') {
      toast('That link is broken or too long');
      return navigate({ kind: 'home' }, { replace: true });
    }
    if (route.kind === 'note' && store.get(route.id)) {
      // An older #/note/ link: open it, and tidy the address back to the app's plain URL.
      history.replaceState({ note: route.id }, '', appUrl());
      return openNote(route.id);
    }
    if (route.kind === 'note') {
      // Note links only work in the browser that saved the note: explain instead of guessing.
      toast("That note isn't saved in this browser. To share a note, use the share button (↗).");
      history.replaceState(null, '', appUrl());
    }
    const remembered = stateNote();
    if (route.kind === 'home' && remembered && store.get(remembered)) return openNote(remembered);
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
      target = await store.create('');
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
    return showShared(body, 'A note shared with Reckon · read-only');
  }

  /** Shows a note from a link, read-only, with "Save a copy". */
  async function showShared(body: string, label: string): Promise<void> {
    await leaveCurrent();
    mode = { kind: 'share', body };
    // Read-only, but the sliders work: a reader can try other numbers without saving a copy.
    editor.setDoc(body, { readOnly: true, explorable: true });
    checkCrypto(body);
    showTitle(body);
    statusEl.textContent = '';
    noteActions.hidden = true;
    sidebar.setCurrent(undefined);
    showBanner(
      label,
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
    const url = await shareLink(editor.getDoc(), `${location.origin}${location.pathname}`);
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

  type ExportFormat = 'text' | 'answers' | 'markdown' | 'html' | 'copy';

  /** Downloads (or copies) the note, optionally with its answers. */
  function exportNote(format: ExportFormat): void {
    const body = editor.getDoc();
    const results = editor.getResults();
    const title = deriveTitle(body);
    switch (format) {
      case 'text':
        return download(fileName(title, 'txt'), body, 'text/plain;charset=utf-8');
      case 'answers':
        return download(fileName(title, 'txt'), toText(body, results), 'text/plain;charset=utf-8');
      case 'markdown':
        return download(
          fileName(title, 'md'),
          toMarkdown(body, results),
          'text/markdown;charset=utf-8',
        );
      case 'html':
        return download(
          fileName(title, 'html'),
          toHtml(body, results, title),
          'text/html;charset=utf-8',
        );
      case 'copy':
        navigator.clipboard.writeText(toText(body, results)).then(
          () => toast('Copied the note with answers'),
          () => toast('Could not copy'),
        );
    }
  }

  const EXPORTS: [ExportFormat, string][] = [
    ['text', 'Text (.txt)'],
    ['answers', 'Text with answers (.txt)'],
    ['markdown', 'Markdown with answers (.md)'],
    ['html', 'Web page with answers (.html)'],
    ['copy', 'Copy with answers'],
  ];
  const exportMenu = h(
    'div',
    {
      class: 'menu',
      id: 'export-menu',
      popover: 'auto',
      role: 'menu',
      'aria-label': 'Download or export',
    },
    ...EXPORTS.map(([format, label]) =>
      h(
        'button',
        {
          type: 'button',
          role: 'menuitem',
          class: 'menu-item',
          onclick: () => {
            exportMenu.hidePopover();
            exportNote(format);
          },
        },
        label,
      ),
    ),
  );

  app.append(exportMenu);

  function toggleExportMenu(anchor: HTMLElement): void {
    if (exportMenu.matches(':popover-open')) return exportMenu.hidePopover();
    const rect = anchor.getBoundingClientRect();
    exportMenu.style.top = `${rect.bottom + 4}px`;
    exportMenu.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
    exportMenu.showPopover();
    exportMenu.querySelector<HTMLElement>('.menu-item')?.focus();
  }
  exportMenu.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...exportMenu.querySelectorAll<HTMLElement>('.menu-item')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
  });

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

  // First visit (even through a share link): the tutorial plus two examples, the tutorial newest
  // so it opens on its own.
  if (!storageError && !store.active().length && !store.trashed().length) {
    const now = Date.now();
    await store.putMany(
      FIRST_RUN_NOTES.map((body, i) => newNote(body, now - (FIRST_RUN_NOTES.length - 1 - i))),
    );
  }

  await handleRoute();

  // First open after an update: say so, once, with a link to what changed. New users skip this.
  try {
    const seen = localStorage.getItem(LAST_VERSION_KEY);
    if (seen && seen !== __APP_VERSION__) {
      toast(`Reckon was updated to ${__APP_VERSION__}`, {
        label: "What's new",
        run: () => window.open(CHANGELOG_URL, '_blank', 'noopener'),
      });
    }
    localStorage.setItem(LAST_VERSION_KEY, __APP_VERSION__);
  } catch {
    // Without storage there's nothing to compare against.
  }

  // A new version is ready: offer to switch, saving any unsaved typing first.
  watchForUpdates((apply) =>
    toast(
      'A new version of Reckon is available',
      {
        label: 'Reload',
        run: () => void autosave.flush().then(apply),
      },
      { sticky: true },
    ),
  );
}
