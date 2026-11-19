// Turns a problem report into a test fixture, so the bug it shows cannot
// come back. Step 3 of docs/ERROR_REPORTING.md.
//
//   npx tsx scripts/import-report.ts <report.txt | event.json> [--with-source]
//       Stores tests/fixtures/reports/<id>/ (report.json, main.log) and prints
//       what Oberleaf reports for it today, flagging errors it cannot explain.
//       The user's note and e-mail are printed, never stored; their document
//       is stored only with --with-source (the repository is public).
//
//   npx tsx scripts/import-report.ts --accept <id>
//       After fixing the parser: records today's output as expect.json. From
//       then on tests/importedReports.test.ts fails if that output changes.
//
// Input: the .txt file the app saves (or attaches to a GitHub issue), or a
// PostHog event exported as JSON (scripts/fetch-reports.ts writes those as
// .txt already).

import fs from 'fs';
import path from 'path';
import { parseReportText, type ProblemReport } from '../server/reporting.js';
import { analyzeReportFixture, REPORT_FIXTURES, type ReportExpectation } from '../tests/reportHarness.js';

function readReport(file: string): ProblemReport {
  const text = fs.readFileSync(file, 'utf8');
  try {
    return parseReportText(text);
  } catch {
    // A PostHog event: the report text is in properties.report.
    const event = JSON.parse(text);
    const inner = event?.properties?.report ?? event?.report;
    if (typeof inner !== 'string') throw new Error(`${file} is neither a saved report nor a PostHog report event.`);
    return parseReportText(inner);
  }
}

function printAnalysis(id: string) {
  const a = analyzeReportFixture(id);
  console.log(`\nReport ${id}: ${a.pdf ? 'PDF written' : 'no PDF'}`);
  for (const e of a.errors) {
    console.log(`  ${e.explained ? '   ' : '!! '}${e.severity === 'warning' ? 'W' : 'E'} line ${e.line}: ${e.message}`);
  }
  if (!a.errors.length) console.log('  (no errors parsed)');
  const unexplained = a.errors.filter((e) => !e.explained).length;
  console.log(
    unexplained
      ? `\n${unexplained} error(s) marked !! have no rule yet. Add one in server/compiler.ts (and a case in tests/errorCorpus.ts), then run --accept ${id}.`
      : `\nEvery error is explained. If that output is right, run --accept ${id}.`
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--accept') {
    const id = args[1];
    if (!id || !fs.existsSync(path.join(REPORT_FIXTURES, id))) throw new Error(`No imported report ${id}.`);
    const a = analyzeReportFixture(id);
    const expectation: ReportExpectation = {
      pdf: a.pdf,
      errors: a.errors.map((e) => ({ message: e.message, line: e.line, severity: e.severity, explained: e.explained })),
    };
    fs.writeFileSync(path.join(REPORT_FIXTURES, id, 'expect.json'), JSON.stringify(expectation, null, 2) + '\n', 'utf8');
    console.log(`Recorded tests/fixtures/reports/${id}/expect.json`);
    return;
  }

  const withSource = args.includes('--with-source');
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.log('Usage: npx tsx scripts/import-report.ts <report.txt|event.json> [--with-source]   or   --accept <id>');
    process.exitCode = 1;
    return;
  }
  const report = readReport(file);
  if (!report.compile) throw new Error('This report has no compile log, so there is nothing to replay.');
  const dir = path.join(REPORT_FIXTURES, report.id);
  fs.mkdirSync(dir, { recursive: true });
  // The fixture folder is committed to a public repository. What the user
  // typed (their description, their e-mail) never goes there, and their
  // document only with --with-source, after asking them.
  const { note, contact, source, ...publicPart } = report;
  fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify(publicPart, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'main.log'), report.compile.log, 'utf8');
  if (source && withSource) fs.writeFileSync(path.join(dir, 'main.tex'), source.text, 'utf8');
  console.log(
    `Stored tests/fixtures/reports/${report.id}/ ` +
      (source
        ? withSource
          ? '(with the document source)'
          : '(without the document source; add --with-source once the user agrees)'
        : '(the report has no document source)')
  );
  if (note) console.log(`User wrote: ${note}`);
  if (contact) console.log(`Contact: ${contact}`);
  printAnalysis(report.id);
}

try {
  main();
} catch (e: any) {
  console.error(e.message);
  process.exitCode = 1;
}
