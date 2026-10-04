import { getDB } from './db';

export async function getSetting<T>(key: string): Promise<T | undefined> {
  return (await (await getDB()).get('settings', key))?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await (await getDB()).put('settings', { key, value });
}
