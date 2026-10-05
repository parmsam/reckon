import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBackup,
  fileName,
  isBackupFile,
  mergeImport,
  noteFromText,
  parseBackup,
} from '../src/app/backup';
import { parseRoute, routeHash } from '../src/app/router';
import { filterNotes, sortNotes } from '../src/app/search';
import { decodeShare, encodeShare, linkName, shareLink } from '../src/app/share';
import { NotesStore } from '../src/app/store';
import { closeDB, DB_NAME, type Note } from '../src/storage/db';
import { newNote } from '../src/storage/notes';

const note = (id: string, patch: Partial<Note> = {}): Note => ({
  id: id.padEnd(26, '0'),
  body: '',
  createdAt: 0,
  updatedAt: 0,
  pinned: 0,
  ...patch,
});

describe('share links', () => {
  it('round-trips unicode text through a URL-safe payload', async () => {
    const body = '# Trip 🧳\nflights: 420 × 2\nsum\n'.repeat(20);
    const payload = await encodeShare(body);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload.length).toBeLessThan(body.length);
    expect(await decodeShare(payload)).toBe(body);
  });

  it('decodes links made with Python zlib (what an LLM with a code tool would run)', async () => {
    // zlib.compressobj(9, zlib.DEFLATED, -15) + base64.urlsafe_b64encode(...).rstrip(b"=")
    const payload =
      'U1YIKcosUPgwf_lmrrSczPSMkmIrBRUTIwOFw9MVjLgy8ktScxRsFYwV8sByIFEVQ2NTrrT8_BQrBSNTVYX8NAWwKq7i0lwuAA';
    expect(await decodeShare(payload)).toBe(
      '# Trip 🧳\nflights: $420 × 2\nhotel = 3 nights × $135\nfood: 25% of hotel\nsum\n',
    );
  });

  it('labels links with the note name, and opens labelled and unlabelled links alike', async () => {
    expect(linkName('# Monthly Budget\nrent = 1200')).toBe('monthly-budget');
    expect(linkName('Café crème: 3 × €4')).toBe('cafe-creme-3-4');
    expect(linkName('// only a comment')).toBe('');
    expect(linkName(`# ${'word '.repeat(20)}`).length).toBeLessThanOrEqual(40);

    const link = await shareLink('# Trip\n2 + 2', 'https://example.com/reckon/');
    expect(link).toMatch(/^https:\/\/example\.com\/reckon\/#\/share\/trip\/[A-Za-z0-9_-]+$/);
    const route = parseRoute(link.slice(link.indexOf('#')));
    expect(route.kind).toBe('share');
    expect(await decodeShare((route as { payload: string }).payload)).toBe('# Trip\n2 + 2');
    const unlabelled = parseRoute(`#/share/${(route as { payload: string }).payload}`);
    expect(unlabelled).toEqual(route);
  });

  it('rejects corrupt payloads', async () => {
    await expect(decodeShare('not-a-real-payload')).rejects.toThrow();
  });
});

describe('routes', () => {
  it('parses and builds hashes', () => {
    const id = newNote().id;
    expect(parseRoute(`#/note/${id}`)).toEqual({ kind: 'note', id });
    expect(parseRoute('#/share/abc_-1')).toEqual({ kind: 'share', payload: 'abc_-1' });
    expect(parseRoute('')).toEqual({ kind: 'home' });
    expect(parseRoute('#/note/nope')).toEqual({ kind: 'home' });
    expect(routeHash({ kind: 'note', id })).toBe(`#/note/${id}`);
  });
});

describe('search and sorting', () => {
  const notes = [
    note('A', { body: '# Groceries\nmilk 2.5', updatedAt: 3 }),
    note('B', { body: '# Trip budget\nflights 420', updatedAt: 2, pinned: 1 }),
    note('C', { body: '# Taxes\n20% of income', updatedAt: 1 }),
  ];

  it('sorts pinned first, then most recent', () => {
    expect(sortNotes(notes).map((n) => n.id[0])).toEqual(['B', 'A', 'C']);
  });

  it('matches every term, case-insensitively', () => {
    expect(filterNotes(notes, 'TRIP 420').map((n) => n.id[0])).toEqual(['B']);
    expect(filterNotes(notes, 'trip milk')).toEqual([]);
    expect(filterNotes(notes, '  ')).toHaveLength(3);
  });
});

describe('backups', () => {
  it('round-trips notes, including trashed ones', () => {
    const notes = [note('A', { body: 'x = 1' }), note('B', { deletedAt: 5 })];
    expect(parseBackup(JSON.stringify(createBackup(notes)))).toEqual(notes);
  });

  it('rejects files that are not backups', () => {
    expect(() => parseBackup('nope')).toThrow('Not a JSON file');
    expect(() => parseBackup('{"notes": []}')).toThrow('Not a Reckon backup');
    const future = { ...createBackup([]), version: 99 };
    expect(() => parseBackup(JSON.stringify(future))).toThrow('newer version');
    const bad = { ...createBackup([]), notes: [{ id: 1 }] };
    expect(() => parseBackup(JSON.stringify(bad))).toThrow('invalid notes');
  });

  it('keeps the newer copy when merging', () => {
    const existing = new Map([
      [note('A').id, note('A', { body: 'mine', updatedAt: 10 })],
      [note('B').id, note('B', { body: 'mine', updatedAt: 10 })],
    ]);
    const incoming = [
      note('A', { body: 'older', updatedAt: 5 }),
      note('B', { body: 'newer', updatedAt: 20 }),
      note('C', { body: 'new' }),
    ];
    expect(mergeImport(existing, incoming).map((n) => n.body)).toEqual(['newer', 'new']);
  });

  it('recognises backups by name or by content', () => {
    const json = JSON.stringify(createBackup([]), null, 2);
    expect(isBackupFile('download', json)).toBe(true);
    expect(isBackupFile('notes.JSON', '[]')).toBe(true);
    expect(isBackupFile('budget.txt', '{ "format": "other" }')).toBe(false);
    expect(isBackupFile('budget.txt', '1 + 1')).toBe(false);
  });

  it('turns text files into notes and makes safe file names', () => {
    expect(noteFromText('a\r\nb').body).toBe('a\nb');
    expect(fileName('Trip: Paris/Rome?', 'txt')).toBe('Trip  Paris Rome.txt');
    expect(fileName('', 'txt')).toBe('note.txt');
  });
});

describe('NotesStore', () => {
  const stores: NotesStore[] = [];
  const open = async () => {
    const store = new NotesStore();
    await store.load();
    stores.push(store);
    return store;
  };

  afterEach(async () => {
    for (const s of stores.splice(0)) s.close();
    await closeDB();
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
    });
  });

  it('creates, pins, trashes, restores and destroys notes', async () => {
    const store = await open();
    const a = await store.create('a');
    const b = await store.create('b');
    await store.setPinned(a.id, true);
    expect(store.active().map((n) => n.body)).toEqual(['a', 'b']);

    await store.trash(a.id);
    expect(store.active().map((n) => n.body)).toEqual(['b']);
    expect(store.trashed().map((n) => n.body)).toEqual(['a']);

    await store.restore(a.id);
    expect(store.get(a.id)?.deletedAt).toBeUndefined();

    await store.trash(b.id);
    await store.emptyTrash();
    expect(store.get(b.id)).toBeUndefined();

    // Everything survives a reload from IndexedDB.
    const reloaded = await open();
    expect(reloaded.active().map((n) => n.body)).toEqual(['a']);
  });

  it('tells other tabs about changes', async () => {
    const tab1 = await open();
    const tab2 = await open();
    const note = await tab1.create('hello');
    const remote = vi.fn();
    tab2.onRemoteChange(remote);

    await tab1.saveBody(note.id, 'hello from tab 1');
    await vi.waitFor(() => expect(remote).toHaveBeenCalledWith([note.id]));
    expect(tab2.get(note.id)?.body).toBe('hello from tab 1');
  });
});
