import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { GENERIC_EXPLANATION, type CompileError } from '../server/compiler.js';
import { ERROR_CASES, type ErrorCase } from './errorCorpus.js';
import { DISTRIBUTIONS, analyzeLive, analyzeRecorded, anonymize, hasRecording, materialize, pickError, type Distribution } from './errorHarness.js';

// `npm run test:live` (vitest --mode live, or OBERLEAF_LIVE_TEX=1) compiles
// each case with the installed TeX instead of reading the recorded log.
// Slower, but it is what proves the rules still hold against the current
// distribution, including the BibTeX handling inside compileDocument.
const LIVE = process.env.OBERLEAF_LIVE_TEX === '1' || (import.meta as any).env?.MODE === 'live';

function check(c: ErrorCase, errors: CompileError[]) {
  const err = pickError(c, errors);
  expect(err, `no error matching ${c.expect.message} in: ${errors.map((e) => e.message).join(' | ')}`).toBeDefined();
  if (!err) return;

  expect(err.isCascading ?? false, 'the error under test was marked as a cascade').toBe(false);
  if (c.expect.line !== undefined) expect(err.line).toBe(c.expect.line);
  if (c.expect.file) expect(err.file).toMatch(c.expect.file);

  expect(err.friendlyExplanation).not.toBe(GENERIC_EXPLANATION);
  expect(err.friendlyExplanation).toMatch(c.expect.explanation);

  if (c.expect.fix) {
    const fix = err.suggestedFix;
    expect(fix, 'expected a suggested fix').toBeDefined();
    expect(fix!.type).toBe(c.expect.fix.type);
    if (c.expect.fix.packageName) expect(fix!.packageName).toBe(c.expect.fix.packageName);
    if (c.expect.fix.contains) expect(fix!.replace ?? fix!.codeSnippet).toContain(c.expect.fix.contains);
  }
}

if (LIVE) {
  describe.each(ERROR_CASES)('live: $id: $title', (c) => {
    it('is found, explained and fixed as expected', { timeout: 120_000 }, async () => {
      const dir = materialize(c);
      try {
        check(c, await analyzeLive(c, dir));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
} else {
  // Every case against every distribution's recorded logs. The MiKTeX set is
  // complete by construction; a case missing from another set is a recording
  // gap, reported rather than silently skipped.
  for (const distribution of Object.keys(DISTRIBUTIONS) as Distribution[]) {
    describe.each(ERROR_CASES)(`${DISTRIBUTIONS[distribution].label}: $id: $title`, (c) => {
      it('is found, explained and fixed as expected', () => {
        if (!hasRecording(c, distribution)) {
          throw new Error(`No ${DISTRIBUTIONS[distribution].label} log. Record it with: npx tsx scripts/record-error-logs.ts ${c.id}`);
        }
        const dir = materialize(c);
        try {
          check(c, analyzeRecorded(c, dir, distribution));
        } finally {
          fs.rmSync(dir, { recursive: true, force: true });
        }
      });
    });
  }
}

describe('anonymize', () => {
  it('replaces the account name in paths, keeping length and line breaks', () => {
    expect(anonymize('C:/Users/sahgy/AppData and C:\\Users\\sah\ngy\\x', 'sahgy')).toBe(
      'C:/Users/uuuuu/AppData and C:\\Users\\uuu\nuu\\x'
    );
  });
  it('leaves the same word alone outside a path', () => {
    expect(anonymize('the root of the problem, /root/texmf/x', 'root')).toBe('the root of the problem, /uuuu/texmf/x');
  });
});
