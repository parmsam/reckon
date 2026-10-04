const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Lexicographically sortable unique id: 10 chars of timestamp + 16 chars of randomness. */
export function ulid(now = Date.now()): string {
  let time = '';
  for (let t = now, i = 0; i < 10; i++, t = Math.floor(t / 32)) time = ALPHABET[t % 32] + time;
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let random = '';
  for (const b of bytes) random += ALPHABET[b % 32];
  return time + random;
}
