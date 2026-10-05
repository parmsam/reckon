import { describe, expect, it } from 'vitest';
import { evaluateDocument } from '../src/engine';

const doc = `rent = $1,200
utilities = $150
rent + utilities
5 km in miles
3 apples + 2 apples

coffee: 4
lunch: 12
sum
prev × 2
1 sprint = 2 weeks
3 sprints in days
tip(bill, rate) = bill × rate
tip($80, 18%)
line1 / 2`;
const results = evaluateDocument(doc, { locale: 'en-US' });
const at = (n: number) => results[n - 1]!;

describe('explanations', () => {
  it('write out the expression with the values it used', () => {
    expect(at(3).explain).toBe('rent ($1,200.00) + utilities ($150.00)');
    expect(at(9).explain).toBe('sum of the lines above (16)');
    expect(at(10).explain).toBe('previous answer (16) × 2');
  });

  it('give conversion factors and list ignored words', () => {
    expect(at(4).explain).toBe('5 km → mi\n1 km = 0.6214 mi');
    expect(at(5).explain).toBe('3 + 2\nIgnored: apples');
  });
});

describe('lines used', () => {
  it('links variables, totals, prev, lineN, units and functions to where they came from', () => {
    expect(at(3).uses).toEqual([0, 1]);
    expect(at(9).uses).toEqual([6, 7]);
    expect(at(10).uses).toEqual([8]);
    expect(at(12).uses).toEqual([10]);
    expect(at(14).uses).toEqual([12]);
    expect(at(15).uses).toEqual([0]);
    expect(at(1).uses).toBeUndefined();
  });
});
