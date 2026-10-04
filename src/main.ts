import './styles.css';
import { openCurrentNote } from './app/session';
import { deriveTitle } from './app/title';
import { WELCOME_NOTE } from './app/welcome';
import { COPIED_EVENT, createEditor } from './editor';
import { createAutosave } from './storage/autosave';
import { saveNoteBody } from './storage/notes';

const editorEl = document.getElementById('editor')!;
const titleEl = document.getElementById('note-title')!;
const statusEl = document.getElementById('save-status')!;
const toastEl = document.getElementById('toast')!;

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string): void {
  toastEl.textContent = message;
  toastEl.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('visible'), 1500);
}

function showTitle(body: string): void {
  const title = deriveTitle(body);
  titleEl.textContent = title;
  document.title = title === 'Untitled' ? 'Reckon' : `${title} · Reckon`;
}

async function start(): Promise<void> {
  let body = WELCOME_NOTE;
  let save: ((body: string) => Promise<unknown>) | undefined;
  try {
    const note = await openCurrentNote();
    body = note.body;
    save = (b) => saveNoteBody(note.id, b);
  } catch (e) {
    console.error('Storage unavailable', e);
    statusEl.textContent = 'Not saved: storage unavailable';
  }

  const autosave = save
    ? createAutosave(async (b: string) => {
        await save(b);
        if (!autosave?.dirty) statusEl.textContent = 'Saved';
      })
    : undefined;

  showTitle(body);
  const view = createEditor({
    parent: editorEl,
    doc: body,
    settings: { locale: navigator.language },
    onChange: (doc) => {
      showTitle(doc);
      if (!autosave) return;
      statusEl.textContent = 'Saving…';
      autosave.schedule(doc);
    },
  });
  view.focus();

  view.dom.addEventListener(COPIED_EVENT, (e) => {
    toast(`Copied ${(e as CustomEvent<string>).detail}`);
  });

  // Flush pending edits when the tab is hidden or closed.
  const flush = () => void autosave?.flush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);
}

void start();
