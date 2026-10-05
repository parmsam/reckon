import { SITE_URL } from '../links';
import { deriveTitle } from './title';

/**
 * Share links carry the note in the URL hash, so no server sees it:
 * `#/share/<base64url(deflate-raw(utf8 body))>`.
 */

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(
  bytes: Uint8Array<ArrayBuffer>,
  stream: GenericTransformStream,
): Promise<Uint8Array> {
  const out = new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeShare(body: string): Promise<string> {
  return toBase64Url(
    await pipe(new TextEncoder().encode(body), new CompressionStream('deflate-raw')),
  );
}

/** Throws if the payload is not a valid share link. */
export async function decodeShare(payload: string): Promise<string> {
  const bytes = await pipe(fromBase64Url(payload), new DecompressionStream('deflate-raw'));
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/** A short, readable label for a link: "# Monthly budget" → "monthly-budget". Empty if untitled. */
export function linkName(text: string): string {
  const title = deriveTitle(text);
  if (title === 'Untitled') return '';
  const slug = title
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length <= 40 ? slug : slug.slice(0, 40).replace(/-[^-]*$/, '');
}

/**
 * A share link: `<base>#/share/<name>/<payload>`. The name is only a label, so people can tell
 * links apart; the note itself is in the payload.
 */
export async function shareLink(text: string, base = SITE_URL): Promise<string> {
  const name = linkName(text);
  return `${base}#/share/${name ? `${name}/` : ''}${await encodeShare(text)}`;
}
