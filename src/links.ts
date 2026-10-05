/** Where the app is published. Used for links in the docs, the LLM prompt and the engine module. */
export const SITE_URL = 'https://parmsam.github.io/reckon/';

/** Longest note a plain-text link may carry. */
export const MAX_LINK_TEXT = 100_000;

/**
 * A link that opens `text` in Reckon: `…/reckon/#/new?text=<percent-encoded>`. It's the format
 * LLMs and scripts should produce, since percent-encoding is easy (unlike share links, which are
 * compressed). The note stays after the `#`, so it never reaches a server.
 */
export function noteLink(text: string, base = SITE_URL): string {
  // Also encode ( ) ' ! *, which encodeURIComponent leaves alone, so links survive inside Markdown.
  const encoded = encodeURIComponent(text).replace(
    /[()'!*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${base}#/new?text=${encoded}`;
}

/**
 * Decodes the `text` parameter of a note link, forgiving common hand-encoding slips: a `+` stays a
 * plus (not a space), and a `%` that doesn't start an escape ("20% of") is kept as is.
 */
export function decodeLinkText(raw: string): string {
  return decodeURIComponent(raw.replace(/%(?![0-9a-fA-F]{2})/g, '%25'));
}
