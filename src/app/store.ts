import type { Note } from '../storage/db';
import { deleteNotes, getAllNotes, newNote, putNote, putNotes } from '../storage/notes';
import { sortNotes } from './search';

const CHANNEL = 'reckon-notes';

interface ChangeMessage {
  type: 'changed';
  ids: string[];
}

/**
 * In-memory copy of every note, written through to IndexedDB. Other tabs are told about
 * changes over a BroadcastChannel and reload from IndexedDB.
 */
export class NotesStore {
  private notes = new Map<string, Note>();
  private listeners = new Set<() => void>();
  private remoteListeners = new Set<(ids: string[]) => void>();
  private channel?: BroadcastChannel;

  async load(): Promise<void> {
    this.notes = new Map((await getAllNotes()).map((n) => [n.id, n]));
    if (!this.channel && 'BroadcastChannel' in globalThis) {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e: MessageEvent<ChangeMessage>) => {
        if (e.data?.type === 'changed') void this.reloadFromRemote(e.data.ids);
      };
    }
    this.emit();
  }

  close(): void {
    this.channel?.close();
    this.channel = undefined;
  }

  /** Called after any change, local or from another tab. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called with the ids another tab changed, after they've been reloaded. */
  onRemoteChange(listener: (ids: string[]) => void): () => void {
    this.remoteListeners.add(listener);
    return () => this.remoteListeners.delete(listener);
  }

  get(id: string): Note | undefined {
    return this.notes.get(id);
  }

  /** Notes outside the trash, pinned first, then most recently edited. */
  active(): Note[] {
    return sortNotes([...this.notes.values()].filter((n) => n.deletedAt === undefined));
  }

  /** Notes in the trash, most recently deleted first. */
  trashed(): Note[] {
    return [...this.notes.values()]
      .filter((n) => n.deletedAt !== undefined)
      .sort((a, b) => b.deletedAt! - a.deletedAt!);
  }

  async create(body = ''): Promise<Note> {
    const note = newNote(body);
    await this.write([note]);
    return note;
  }

  /** Saves a new body; returns false if the note no longer exists. */
  async saveBody(id: string, body: string): Promise<boolean> {
    const note = this.notes.get(id);
    if (!note) return false;
    if (note.body !== body) await this.write([{ ...note, body, updatedAt: Date.now() }]);
    return true;
  }

  async setPinned(id: string, pinned: boolean): Promise<void> {
    const note = this.notes.get(id);
    if (note) await this.write([{ ...note, pinned: pinned ? 1 : 0 }]);
  }

  async trash(id: string): Promise<void> {
    const note = this.notes.get(id);
    if (note) await this.write([{ ...note, deletedAt: Date.now() }]);
  }

  async restore(id: string): Promise<void> {
    const note = this.notes.get(id);
    if (!note) return;
    const restored = { ...note };
    delete restored.deletedAt;
    await this.write([restored]);
  }

  /** Permanently deletes notes. */
  async destroy(ids: string[]): Promise<void> {
    if (!ids.length) return;
    await deleteNotes(ids);
    for (const id of ids) this.notes.delete(id);
    this.changed(ids);
  }

  async emptyTrash(): Promise<void> {
    await this.destroy(this.trashed().map((n) => n.id));
  }

  /** Adds or replaces notes, for imports. */
  async putMany(notes: Note[]): Promise<void> {
    if (notes.length) await this.write(notes);
  }

  private async write(notes: Note[]): Promise<void> {
    if (notes.length === 1) await putNote(notes[0]!);
    else await putNotes(notes);
    for (const n of notes) this.notes.set(n.id, n);
    this.changed(notes.map((n) => n.id));
  }

  private changed(ids: string[]): void {
    this.channel?.postMessage({ type: 'changed', ids } satisfies ChangeMessage);
    this.emit();
  }

  private async reloadFromRemote(ids: string[]): Promise<void> {
    this.notes = new Map((await getAllNotes()).map((n) => [n.id, n]));
    this.emit();
    for (const listener of this.remoteListeners) listener(ids);
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
