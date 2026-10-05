import type { EditorState } from '@codemirror/state';
import { change, totals, type LineResult, type Value } from '../engine';
import { adjustingField, engineSettings, resultsField } from './results';

export type Summary =
  /** The section around the cursor: what `sum` would give at its end. */
  | { kind: 'section'; label: string; total: string; change?: string }
  /** Several selected lines: their sum, average and count. */
  | { kind: 'selection'; sum?: string; avg?: string; count: number; change?: string };

const isBoundary = (r: LineResult | undefined) => !r || r.kind === 'blank' || r.kind === 'heading';
const countable = (r: LineResult) => r.kind === 'value' && !r.aggregate && r.value !== undefined;

/**
 * What the total bar shows for the current cursor or selection, if anything. While a slider or
 * scrub is active, `change` says how far the total moved ("+$120.00").
 */
export function summarize(state: EditorState): Summary | undefined {
  const results = state.field(resultsField);
  const summary = summarizeResults(state, results);
  const before = state.field(adjustingField, false);
  if (!summary || !before || before.length !== results.length) return summary?.summary;
  const moved = change(
    summarizeResults(state, before)?.value,
    summary.value,
    state.facet(engineSettings),
  );
  return moved ? { ...summary.summary, change: moved } : summary.summary;
}

function summarizeResults(
  state: EditorState,
  results: LineResult[],
): { summary: Summary; value?: Value } | undefined {
  const settings = state.facet(engineSettings);
  const { from, to, empty } = state.selection.main;
  const first = state.doc.lineAt(from).number - 1;
  const last = state.doc.lineAt(to).number - 1;

  if (!empty && last > first) {
    const values = results
      .slice(first, last + 1)
      .filter(countable)
      .map((r) => r.value!);
    const t = totals(values, settings);
    if (!t.count) return undefined;
    const summary: Summary = { kind: 'selection', sum: t.sum, avg: t.avg, count: t.count };
    return { summary, value: t.sumValue };
  }

  // The section: lines between headings or blank lines. On a heading, the section below it.
  let start = results[first]?.kind === 'heading' ? first + 1 : first;
  if (results[first]?.kind === 'blank') return undefined;
  while (start > 0 && !isBoundary(results[start - 1])) start--;
  let end = start;
  while (end + 1 < results.length && !isBoundary(results[end + 1])) end++;

  // Stricter than `sum`: only the section's raw items (lines that don't use other lines), and
  // only when they're all the same kind, so "3 housemates" never gets added to dollars.
  const values = results
    .slice(start, end + 1)
    .filter((r) => countable(r) && !r.uses?.length)
    .map((r) => r.value!);
  if (values.length < 2) return undefined;
  if (new Set(values.map((v) => v.kind)).size > 1) return undefined;
  const { sum: total, sumValue } = totals(values, settings);
  if (!total) return undefined;
  const heading = results[start - 1]?.kind === 'heading' ? state.doc.line(start).text : '';
  const label = heading.replace(/^\s*#+\s*/, '').trim();
  return { summary: { kind: 'section', label, total }, value: sumValue };
}
