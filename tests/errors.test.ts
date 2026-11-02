import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { GENERIC_EXPLANATION } from '../server/compiler.js';
import { ERROR_CASES } from './errorCorpus.js';
import { LOG_DIR, analyzeLive, analyzeRecorded, materialize, pickError } from './errorHarness.js';

// `npm run test:live` (vitest --mode live, or OBERLEAF_LIVE_TEX=1) compiles
// each case with the installed TeX instead of reading the recorded log.
// Slower, but it is what proves the rules still hold against the current
// distribution, including the BibTeX handling inside compileDocument.
const LIVE = process.env.OBERLEAF_LIVE_TEX === '1' || (import.meta as any).env?.MODE === 'live';

describe.each(ERROR_CASES)('$id: $title', (c) => {
  it('is found, explained and fixed as expected', { timeout: LIVE ? 120_000 : 5_000 }, async () => {
    if (!LIVE && !fs.existsSync(path.join(LOG_DIR, `${c.id}.log`))) {
      throw new Error(`No recorded log. Run: npx tsx scripts/record-error-logs.ts ${c.id}`);
    }
    const dir = materialize(c);
    try {
      const errors = LIVE ? await analyzeLive(c, dir) : analyzeRecorded(c, dir);
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
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
