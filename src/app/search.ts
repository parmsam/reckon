import type { Note } from '../storage/db';

/** Notes in sidebar order: pinned first, then most recently edited. */
export function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.pinned - a.pinned || b.updatedAt - a.updatedAt);
}

/** Case-insensitive search: every space-separated term must appear somewhere in the note. */
export function filterNotes(notes: Note[], query: string): Note[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return notes;
  return notes.filter((n) => {
    const body = n.body.toLowerCase();
    return terms.every((t) => body.includes(t));
  });
}
