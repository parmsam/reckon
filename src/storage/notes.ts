import { getDB, type Note } from './db';
import { ulid } from './ulid';

export async function getNote(id: string): Promise<Note | undefined> {
  return (await getDB()).get('notes', id);
}

export async function createNote(body = ''): Promise<Note> {
  const now = Date.now();
  const note: Note = { id: ulid(now), body, createdAt: now, updatedAt: now, pinned: 0 };
  await (await getDB()).put('notes', note);
  return note;
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
