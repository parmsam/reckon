const MAX_TITLE_LENGTH = 60;

/** Derives a note title: the first heading, else the first non-empty, non-comment line. */
export function deriveTitle(body: string): string {
  const lines = body.split('\n').map((line) => line.trim());
  const heading = lines.find((line) => /^#+\s+\S/.test(line));
  const fallback = lines.find((line) => line !== '' && !line.startsWith('//'));
  const title = heading ? heading.replace(/^#+\s+/, '') : (fallback ?? '');
  if (title === '') return 'Untitled';
  return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1)}…` : title;
}
