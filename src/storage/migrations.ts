import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import type { ReckonDB } from './db';

type Migration = (
  db: IDBPDatabase<ReckonDB>,
  tx: IDBPTransaction<ReckonDB, StoreNames<ReckonDB>[], 'versionchange'>,
) => void;

/**
 * Schema migrations, indexed by the version they upgrade *to*. Never edit a shipped migration:
 * add a new one and bump DB_VERSION.
 */
export const MIGRATIONS: Record<number, Migration> = {
  1: (db) => {
    const notes = db.createObjectStore('notes', { keyPath: 'id' });
    notes.createIndex('updatedAt', 'updatedAt');
    notes.createIndex('pinned', 'pinned');
    notes.createIndex('deletedAt', 'deletedAt');
    db.createObjectStore('settings', { keyPath: 'key' });
    db.createObjectStore('rates', { keyPath: 'base' });
  },
};

export const DB_VERSION = Math.max(...Object.keys(MIGRATIONS).map(Number));
