import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAutosave } from '../src/storage/autosave';
import { closeDB, DB_NAME, getDB } from '../src/storage/db';
import { DB_VERSION } from '../src/storage/migrations';
import { createNote, getNote, listNotes, saveNoteBody } from '../src/storage/notes';
import { getSetting, setSetting } from '../src/storage/settings';
import { ulid } from '../src/storage/ulid';

afterEach(async () => {
  await closeDB();
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
});

describe('ulid', () => {
  it('is 26 characters and sorts by time', () => {
    const a = ulid(1_000);
    const b = ulid(2_000);
    expect(a).toHaveLength(26);
    expect(a < b).toBe(true);
  });
});

describe('schema', () => {
  it('creates every store and index at the current version', async () => {
    const db = await getDB();
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual(['notes', 'rates', 'settings']);
    expect([...db.transaction('notes').store.indexNames].sort()).toEqual([
      'deletedAt',
      'pinned',
      'updatedAt',
    ]);
  });
});

describe('notes', () => {
  it('creates, saves and reads back a note', async () => {
    const note = await createNote('1 + 1');
    expect(await getNote(note.id)).toEqual(note);

    const saved = await saveNoteBody(note.id, '2 + 2');
    expect(saved?.body).toBe('2 + 2');
    expect(saved!.updatedAt).toBeGreaterThanOrEqual(note.updatedAt);
    expect((await getNote(note.id))?.body).toBe('2 + 2');
  });

  it('lists notes newest first, excluding the trash', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000);
    const older = await createNote('older');
    vi.setSystemTime(2_000);
    const newer = await createNote('newer');
    vi.setSystemTime(3_000);
    const trashed = await createNote('trashed');
    vi.useRealTimers();
    await (await getDB()).put('notes', { ...trashed, deletedAt: 4_000 });

    expect((await listNotes()).map((n) => n.id)).toEqual([newer.id, older.id]);
  });
});

describe('settings', () => {
  it('round-trips values', async () => {
    expect(await getSetting('currentNoteId')).toBeUndefined();
    await setSetting('currentNoteId', 'abc');
    expect(await getSetting('currentNoteId')).toBe('abc');
  });
});

describe('autosave', () => {
  it('debounces to the latest value and flushes on demand', async () => {
    vi.useFakeTimers();
    const writes: string[] = [];
    const saver = createAutosave(async (v: string) => void writes.push(v), 300);
    saver.schedule('a');
    saver.schedule('ab');
    expect(saver.dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(299);
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(writes).toEqual(['ab']);

    saver.schedule('abc');
    await saver.flush();
    expect(writes).toEqual(['ab', 'abc']);
    expect(saver.dirty).toBe(false);
    vi.useRealTimers();
  });
});
