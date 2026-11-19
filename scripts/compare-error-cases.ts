// Compiles every case in tests/diagnosticCases.ts with the local TeX
// installation and prints what Oberleaf reports for each: PDF or not, the
// errors the user sees, the warnings and where they land, and what Overleaf
// did with the same document when it was checked.
//
//   npx tsx scripts/compare-error-cases.ts              compile and print
//   npx tsx scripts/compare-error-cases.ts --record     also store the logs
//   npx tsx scripts/compare-error-cases.ts missing-sty  only these cases
//
// --record writes tests/fixtures/diagnostics/<id>.log (.blg, .aux) and
// manifest.json (whether a PDF came out), which tests/compileDiagnostics.test.ts
// reads, so the default test run needs no TeX. Re-record after changing a case
// or the compile command. Usernames in paths are anonymized.

import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { compileDocument } from '../server/compiler.js';
import { DIAGNOSTIC_CASES } from '../tests/diagnosticCases.js';
import { checkDiagnostic, DIAGNOSTIC_FIXTURES, MANIFEST, materializeDiagnostic } from '../tests/diagnosticHarness.js';
import { anonymize } from '../tests/errorHarness.js';

const args = process.argv.slice(2);
const record = args.includes('--record');
const only = args.filter((a) => !a.startsWith('--'));
const cases = only.length ? DIAGNOSTIC_CASES.filter((c) => only.includes(c.id)) : DIAGNOSTIC_CASES;

function texVersion(): string {
  try {
    return execFileSync('pdflatex', ['--version'], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/)[0].trim();
  } catch {
    return 'pdflatex not found';
  }
}

async function main() {
  console.log(`TeX: ${texVersion()}\n`);
  const manifest: Record<string, { pdf: boolean }> =
    record && fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {};
  if (record) fs.mkdirSync(DIAGNOSTIC_FIXTURES, { recursive: true });
  let failed = 0;

  for (const c of cases) {
    const dir = materializeDiagnostic(c);
    try {
      const r = await compileDocument(dir, 'main.tex', 'pdflatex');
      const hard = r.errors.filter((e) => e.severity !== 'warning');
      const soft = r.errors.filter((e) => e.severity === 'warning');
      const problems = checkDiagnostic(c, { pdf: r.success, errors: r.errors, warningItems: r.warningItems });
      if (problems.length) failed++;

      console.log(`${problems.length ? 'FAIL' : 'ok  '}  ${c.id}  (${(r.durationMs / 1000).toFixed(1)}s)`);
      console.log(`      PDF: ${r.success ? 'yes' : 'no'}   errors: ${hard.length}   warnings: ${r.warningItems.length + soft.length}`);
      for (const e of hard.slice(0, 3)) console.log(`      E ${e.file}:${e.line}  ${e.message}`.slice(0, 150));
      for (const e of soft) console.log(`      W ${e.file}:${e.line}  ${e.message}`.slice(0, 150));
      for (const w of r.warningItems.slice(0, 4)) console.log(`      W ${w.kind} ${w.file}:${w.line}  ${w.message}`.slice(0, 150));
      if (c.overleaf) console.log(`      Overleaf: ${c.overleaf}`);
      for (const p of problems) console.log(`      ! ${p}`);

      if (record) {
        const build = path.join(dir, '.build');
        for (const ext of ['log', 'blg', 'aux']) {
          const src = path.join(build, `main.${ext}`);
          const dst = path.join(DIAGNOSTIC_FIXTURES, `${c.id}.${ext}`);
          if (fs.existsSync(src)) fs.writeFileSync(dst, anonymize(fs.readFileSync(src, 'utf8')), 'utf8');
          else if (fs.existsSync(dst)) fs.rmSync(dst);
        }
        manifest[c.id] = { pdf: r.success };
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  if (record) {
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(DIAGNOSTIC_FIXTURES, 'RECORDED_WITH.txt'), `${texVersion()}\n`, 'utf8');
  }
  console.log(`\n${cases.length - failed} of ${cases.length} cases as expected.`);
  if (failed) process.exitCode = 1;
}

main();
