export type Route =
  { kind: 'home' } | { kind: 'note'; id: string } | { kind: 'share'; payload: string };

/** Hash routes, so GitHub Pages never sees a deep link: `#/note/<id>`, `#/share/<payload>`. */
export function parseRoute(hash: string): Route {
  const note = /^#\/note\/([0-9A-Z]{26})$/.exec(hash);
  if (note) return { kind: 'note', id: note[1]! };
  const share = /^#\/share\/([A-Za-z0-9_-]+)$/.exec(hash);
  if (share) return { kind: 'share', payload: share[1]! };
  return { kind: 'home' };
}

export function routeHash(route: Route): string {
  switch (route.kind) {
    case 'note':
      return `#/note/${route.id}`;
    case 'share':
      return `#/share/${route.payload}`;
    case 'home':
      return '';
  }
}
