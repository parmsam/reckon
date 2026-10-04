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
