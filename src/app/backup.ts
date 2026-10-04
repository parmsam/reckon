import type { Note } from '../storage/db';
import { newNote } from '../storage/notes';

export const BACKUP_FORMAT = 'reckon-backup';
export const BACKUP_VERSION = 1;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  notes: Note[];
}

export function createBackup(notes: Note[], now = new Date()): Backup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(), notes };
}

function isNote(value: unknown): value is Note {
  if (typeof value !== 'object' || value === null) return false;
  const n = value as Record<string, unknown>;
  return (
    typeof n.id === 'string' &&
    /^[0-9A-Z]{26}$/.test(n.id) &&
    typeof n.body === 'string' &&
    typeof n.createdAt === 'number' &&
    typeof n.updatedAt === 'number' &&
    (n.pinned === 0 || n.pinned === 1) &&
    (n.deletedAt === undefined || typeof n.deletedAt === 'number')
  );
}

/** Parses a backup file. Throws with a readable message if it isn't one. */
export function parseBackup(text: string): Note[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Not a JSON file');
  }
  const backup = data as Partial<Backup>;
  if (backup?.format !== BACKUP_FORMAT || !Array.isArray(backup.notes)) {
    throw new Error('Not a Reckon backup');
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new Error('This backup comes from a newer version of Reckon');
  }
  const notes = backup.notes.filter(isNote);
  if (notes.length !== backup.notes.length) throw new Error('The backup contains invalid notes');
  return notes.map(({ id, body, createdAt, updatedAt, pinned, deletedAt }) =>
    deletedAt === undefined
      ? { id, body, createdAt, updatedAt, pinned }
      : { id, body, createdAt, updatedAt, pinned, deletedAt },
  );
}

/**
 * Notes to write when importing. New notes are added; for a note that already exists, the
 * more recently edited copy wins.
 */
export function mergeImport(existing: ReadonlyMap<string, Note>, incoming: Note[]): Note[] {
  return incoming.filter((n) => {
    const current = existing.get(n.id);
    return !current || n.updatedAt > current.updatedAt;
  });
}

/** True for a file that should be read as a backup: a `.json` name, or a Reckon backup's contents. */
export function isBackupFile(name: string, text: string): boolean {
  return (
    name.toLowerCase().endsWith('.json') ||
    new RegExp(`^\\s*\\{\\s*"format"\\s*:\\s*"${BACKUP_FORMAT}"`).test(text)
  );
}

/** A plain text or Markdown file becomes a new note. */
export function noteFromText(text: string, now = Date.now()): Note {
  return newNote(text.replace(/\r\n?/g, '\n'), now);
}

/** A file-system-safe name for a note's download. */
export function fileName(title: string, extension: string): string {
  const base =
    title
      // eslint-disable-next-line no-control-regex -- control characters are invalid in file names
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
      .trim()
      .slice(0, 80) || 'note';
  return `${base}.${extension}`;
}
