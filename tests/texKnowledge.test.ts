import { describe, expect, it } from 'vitest';
import { closestMatch, editDistance, KNOWN_COMMANDS } from '../server/texKnowledge.js';
import { countTableColumns } from '../server/compiler.js';

describe('editDistance', () => {
  it.each([
    ['textbf', 'textbf', 0],
    ['textbff', 'textbf', 1],
    ['tetxbf', 'textbf', 1], // transposition is one edit
    ['emph', 'empth', 1],
    ['', 'abc', 3],
  ])('%s -> %s = %i', (a, b, d) => {
    expect(editDistance(a, b)).toBe(d);
  });
});

describe('closestMatch', () => {
  it('suggests the near-miss', () => {
    expect(closestMatch('textbff', KNOWN_COMMANDS)).toBe('textbf');
    expect(closestMatch('sectoin', KNOWN_COMMANDS)).toBe('section');
    expect(closestMatch('reed', ['red', 'green', 'blue'])).toBe('red');
  });

  it('stays silent when nothing is close', () => {
    expect(closestMatch('frobnicateall', KNOWN_COMMANDS)).toBeUndefined();
  });

  it('stays silent on an exact match', () => {
    expect(closestMatch('textbf', KNOWN_COMMANDS)).toBeUndefined();
  });

  it('stays silent on a tie rather than guessing', () => {
    expect(closestMatch('ab', ['aa', 'bb'])).toBeUndefined();
  });

  it('allows only one edit for short names', () => {
    expect(closestMatch('xi', ['pi'])).toBe('pi');
    expect(closestMatch('xyz', ['pi'])).toBeUndefined();
  });
});

describe('countTableColumns', () => {
  it.each([
    ['ll', 2],
    ['|l|c|r|', 3],
    ['lp{3cm}c', 3],
    ['*{4}{c}', 4],
    ['l*{2}{p{2cm}}', 3],
    ['@{}lr@{}', 2],
    ['>{\\bfseries}lc', 2],
    ['XS', 2],
    ['m{1cm}b{2cm}', 2],
  ])('%s has %i columns', (spec, n) => {
    expect(countTableColumns(spec)).toBe(n);
  });
});
