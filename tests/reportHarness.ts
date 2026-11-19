import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeCompileOutput, GENERIC_EXPLANATION } from '../server/compiler.js';
import type { ProblemReport } from '../server/reporting.js';

/** Problem reports imported by scripts/import-report.ts, one folder each */
export const REPORT_FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'reports');

export interface ReportExpectation {
  pdf: boolean;
  errors: Array<{ message: string; line: number; severity?: string; explained: boolean }>;
}

export interface ReportAnalysis {
  pdf: boolean;
  errors: Array<{ message: string; line: number; severity?: string; explained: boolean }>;
}

const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

export function importedReportIds(): string[] {
  if (!fs.existsSync(REPORT_FIXTURES)) return [];
  return fs.readdirSync(REPORT_FIXTURES).filter((d) => fs.existsSync(path.join(REPORT_FIXTURES, d, 'report.json'))).sort();
}

/**
 * What today's parser makes of a stored report. The document source, when the
 * user included it, is written into a scratch project so source-aware rules
 * and the missing-.bib check see what the user's compile saw.
 */
export function analyzeReportFixture(id: string): ReportAnalysis {
  const dir = path.join(REPORT_FIXTURES, id);
  const report = JSON.parse(read(path.join(dir, 'report.json'))) as ProblemReport;
  const source = read(path.join(dir, 'main.tex'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), `oberleaf-report-${id}-`));
  try {
    if (source) fs.writeFileSync(path.join(project, 'main.tex'), source, 'utf8');
    const { errors } = analyzeCompileOutput({
      log: read(path.join(dir, 'main.log')),
      blg: '',
      auxText: '',
      sourceLines: source ? source.split('\n').map((l) => l.replace(/\r$/, '')) : [],
      projectDir: project,
      pdfGenerated: !!report.compile?.success,
    });
    return {
      pdf: !!report.compile?.success,
      errors: errors.map((e) => ({
        message: e.message,
        line: e.line,
        severity: e.severity,
        explained: !!e.friendlyExplanation && e.friendlyExplanation !== GENERIC_EXPLANATION && e.message !== 'No PDF was produced.',
      })),
    };
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
}
