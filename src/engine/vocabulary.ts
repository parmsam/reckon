import { CONSTANTS, FUNCTIONS } from './functions';
import { UNIT_SPECS } from './units';

/** A word Reckon understands, for autocomplete. */
export interface VocabularyWord {
  label: string;
  type: 'function' | 'constant' | 'keyword' | 'unit' | 'currency' | 'date';
  detail?: string;
}

const KEYWORDS =
  'sum total average count prev line of off in to as per hex binary octal scientific percent until since ago from';
const DATE_WORDS =
  'today tomorrow yesterday now noon midnight next last monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december';

let cache: VocabularyWord[] | undefined;

/** Functions, constants, keywords, date words, and unit and currency names. */
export function vocabulary(): VocabularyWord[] {
  if (cache) return cache;
  const words = new Map<string, VocabularyWord>();
  const add = (w: VocabularyWord) => {
    if (w.label.length > 1 && !words.has(w.label)) words.set(w.label, w);
  };
  for (const name of Object.keys(FUNCTIONS))
    add({ label: name, type: 'function', detail: 'function' });
  for (const name of Object.keys(CONSTANTS))
    add({ label: name, type: 'constant', detail: 'constant' });
  for (const w of KEYWORDS.split(' ')) add({ label: w, type: 'keyword' });
  for (const w of DATE_WORDS.split(' ')) add({ label: w, type: 'date' });
  for (const { def, names } of UNIT_SPECS) {
    const type = def.currency || def.crypto ? 'currency' : 'unit';
    // Long names are where completion helps; symbols are quick to type anyway.
    for (const name of names) if (name.length > 3) add({ label: name, type, detail: def.symbol });
  }
  cache = [...words.values()];
  return cache;
}
