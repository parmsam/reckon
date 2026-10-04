import { getDB, type Note } from './db';
import { ulid } from './ulid';

export async function getNote(id: string): Promise<Note | undefined> {
  return (await getDB()).get('notes', id);
}

/** Every note, including the trash. */
export async function getAllNotes(): Promise<Note[]> {
  return (await getDB()).getAll('notes');
}

export function newNote(body = '', now = Date.now()): Note {
  return { id: ulid(now), body, createdAt: now, updatedAt: now, pinned: 0 };
}

export async function createNote(body = ''): Promise<Note> {
  const note = newNote(body);
  await (await getDB()).put('notes', note);
  return note;
}

export async function putNote(note: Note): Promise<void> {
  await (await getDB()).put('notes', note);
}

/** Writes many notes in one transaction. */
export async function putNotes(notes: Note[]): Promise<void> {
  const tx = (await getDB()).transaction('notes', 'readwrite');
  await Promise.all([...notes.map((n) => tx.store.put(n)), tx.done]);
}

/** Permanently deletes notes. */
export async function deleteNotes(ids: string[]): Promise<void> {
  const tx = (await getDB()).transaction('notes', 'readwrite');
  await Promise.all([...ids.map((id) => tx.store.delete(id)), tx.done]);
}

/** Saves a new body. Skips the write when nothing changed. */
export async function saveNoteBody(id: string, body: string): Promise<Note | undefined> {
  const db = await getDB();
  const tx = db.transaction('notes', 'readwrite');
  const note = await tx.store.get(id);
  if (!note || note.body === body) {
    await tx.done;
    return note;
  }
  const updated = { ...note, body, updatedAt: Date.now() };
  await tx.store.put(updated);
  await tx.done;
  return updated;
}

/** Notes that aren't in the trash, most recently edited first. */
export async function listNotes(): Promise<Note[]> {
  const notes = await (await getDB()).getAllFromIndex('notes', 'updatedAt');
  return notes.filter((n) => n.deletedAt === undefined).reverse();
}
