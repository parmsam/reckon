import { decodeLinkText, MAX_LINK_TEXT } from '../links';

export type Route =
  | { kind: 'home' }
  | { kind: 'note'; id: string }
  | { kind: 'share'; payload: string }
  /** `#/new?text=…`: plain-text note links, for LLMs and scripts. */
  | { kind: 'text'; text: string }
  | { kind: 'badLink' };

/**
 * Hash routes, so GitHub Pages never sees a deep link: `#/note/<id>`, `#/share/<payload>`,
 * `#/new?text=<percent-encoded note>`.
 */
export function parseRoute(hash: string): Route {
  const note = /^#\/note\/([0-9A-Z]{26})$/.exec(hash);
  if (note) return { kind: 'note', id: note[1]! };
  const share = /^#\/share\/([A-Za-z0-9_-]+)$/.exec(hash);
  if (share) return { kind: 'share', payload: share[1]! };
  const fresh = /^#\/new\?(.*)$/s.exec(hash);
  if (fresh) {
    const param = fresh[1]!.split('&').find((p) => p.startsWith('text='));
    if (param === undefined) return { kind: 'badLink' };
    try {
      const text = decodeLinkText(param.slice('text='.length));
      return text.length > MAX_LINK_TEXT ? { kind: 'badLink' } : { kind: 'text', text };
    } catch {
      return { kind: 'badLink' };
    }
  }
  return { kind: 'home' };
}

export function routeHash(route: Route): string {
  switch (route.kind) {
    case 'note':
      return `#/note/${route.id}`;
    case 'share':
      return `#/share/${route.payload}`;
    case 'text':
      return `#/new?text=${encodeURIComponent(route.text)}`;
    case 'home':
    case 'badLink':
      return '';
  }
}
