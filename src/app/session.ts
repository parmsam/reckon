import type { Note } from '../storage/db';
import { createNote, getNote } from '../storage/notes';
import { getSetting, setSetting } from '../storage/settings';
import { WELCOME_NOTE } from './welcome';

const CURRENT_NOTE = 'currentNoteId';

/** Opens the note the user was last editing, creating the welcome note on first run. */
export async function openCurrentNote(): Promise<Note> {
  const id = await getSetting<string>(CURRENT_NOTE);
  const existing = id ? await getNote(id) : undefined;
  if (existing && existing.deletedAt === undefined) return existing;

  const note = await createNote(WELCOME_NOTE);
  await setSetting(CURRENT_NOTE, note.id);
  return note;
}
