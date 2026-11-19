import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { analyzeReportFixture, importedReportIds, REPORT_FIXTURES, type ReportExpectation } from './reportHarness.js';

// Every problem report imported with scripts/import-report.ts and accepted
// with --accept: the parser must keep giving the output that was checked then.
const accepted = importedReportIds().filter((id) => fs.existsSync(path.join(REPORT_FIXTURES, id, 'expect.json')));

describe('imported problem reports', () => {
  it('has the fixture folder in place', () => {
    expect(fs.existsSync(REPORT_FIXTURES)).toBe(true);
  });

  it.each(accepted)('report %s still parses as accepted', (id) => {
    const expected = JSON.parse(fs.readFileSync(path.join(REPORT_FIXTURES, id, 'expect.json'), 'utf8')) as ReportExpectation;
    expect(analyzeReportFixture(id)).toEqual(expected);
  });
});
