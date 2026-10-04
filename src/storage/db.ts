import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { DB_VERSION, MIGRATIONS } from './migrations';

export interface Note {
  /** ULID, so ids sort by creation time. */
  id: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  /** 0 or 1. IndexedDB can't index booleans. */
  pinned: 0 | 1;
  deletedAt?: number;
}

export interface ReckonDB extends DBSchema {
  notes: {
    key: string;
    value: Note;
    indexes: { updatedAt: number; pinned: number; deletedAt: number };
  };
  settings: { key: string; value: { key: string; value: unknown } };
  rates: {
    key: string;
    value: {
      base: string;
      fetchedAt: number;
      rates: Record<string, number>;
      cryptoFetchedAt?: number;
    };
  };
}

export const DB_NAME = 'reckon';

let dbPromise: Promise<IDBPDatabase<ReckonDB>> | undefined;

export function getDB(): Promise<IDBPDatabase<ReckonDB>> {
  dbPromise ??= openDB<ReckonDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      for (let v = oldVersion + 1; v <= (newVersion ?? DB_VERSION); v++) MIGRATIONS[v]?.(db, tx);
    },
  });
  return dbPromise;
}

/** Closes the connection so tests can start from a fresh database. */
export async function closeDB(): Promise<void> {
  const db = await dbPromise;
  db?.close();
  dbPromise = undefined;
}
