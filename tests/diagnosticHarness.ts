import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { analyzeCompileOutput, compileDocument, type CompileError } from '../server/compiler.js';
import type { CompileWarning } from '../server/logWarnings.js';
import type { DiagnosticCase } from './diagnosticCases.js';

export const DIAGNOSTIC_FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'diagnostics');
export const MANIFEST = path.join(DIAGNOSTIC_FIXTURES, 'manifest.json');

export interface DiagnosticOutcome {
  pdf: boolean;
  errors: CompileError[];
  warningItems: CompileWarning[];
}

export function materializeDiagnostic(c: DiagnosticCase): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oberleaf-diag-${c.id}-`));
  fs.writeFileSync(path.join(dir, 'main.tex'), c.tex, 'utf8');
  for (const [name, body] of Object.entries(c.files ?? {})) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
  return dir;
}

const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '');

/** Whether the case's recorded compile produced a PDF, from the manifest. */
export function recordedPdf(id: string): boolean | undefined {
  if (!fs.existsSync(MANIFEST)) return undefined;
  return (JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as Record<string, { pdf: boolean }>)[id]?.pdf;
}

export function hasDiagnosticRecording(c: DiagnosticCase): boolean {
  return fs.existsSync(path.join(DIAGNOSTIC_FIXTURES, `${c.id}.log`)) && recordedPdf(c.id) !== undefined;
}

/** Runs the compile's post-processing on the recorded log, as compileDocument would. */
export function analyzeDiagnosticRecording(c: DiagnosticCase, dir: string): DiagnosticOutcome {
  const pdf = recordedPdf(c.id)!;
  const { errors, warningItems } = analyzeCompileOutput({
    log: read(path.join(DIAGNOSTIC_FIXTURES, `${c.id}.log`)),
    blg: read(path.join(DIAGNOSTIC_FIXTURES, `${c.id}.blg`)),
    auxText: read(path.join(DIAGNOSTIC_FIXTURES, `${c.id}.aux`)),
    sourceLines: c.tex.split('\n'),
    projectDir: dir,
    pdfGenerated: pdf,
  });
  return { pdf, errors, warningItems };
}

export async function compileDiagnostic(dir: string): Promise<DiagnosticOutcome> {
  const r = await compileDocument(dir, 'main.tex', 'pdflatex');
  return { pdf: r.success, errors: r.errors, warningItems: r.warningItems };
}

/** Failures as readable strings; empty when the outcome matches the case. */
export function checkDiagnostic(c: DiagnosticCase, o: DiagnosticOutcome): string[] {
  const problems: string[] = [];
  const e = c.expect;
  const hard = o.errors.filter((x) => x.severity !== 'warning');
  const list = () => hard.map((x) => `${x.line}:${x.message}`).join(' | ');

  if (o.pdf !== e.pdf) problems.push(`pdf: expected ${e.pdf}, got ${o.pdf}`);
  if (typeof e.errors === 'number' ? hard.length !== e.errors : hard.length < e.errors.min) {
    problems.push(`errors: expected ${JSON.stringify(e.errors)}, got ${hard.length} (${list()})`);
  }
  if (e.first) {
    const first = hard[0];
    if (!first || !e.first.message.test(first.message)) {
      problems.push(`first error: expected ${e.first.message}, got ${first?.message ?? 'none'}`);
    } else {
      if (e.first.line !== undefined && first.line !== e.first.line) problems.push(`first error line: expected ${e.first.line}, got ${first.line}`);
      if (e.first.file && !e.first.file.test(first.file)) problems.push(`first error file: expected ${e.first.file}, got ${first.file}`);
      if (e.first.highlight !== undefined && first.highlight !== e.first.highlight) {
        problems.push(`highlight: expected ${e.first.highlight}, got ${first.highlight}`);
      }
      if (e.first.explanation && !e.first.explanation.test(first.friendlyExplanation ?? '')) {
        problems.push(`explanation: expected ${e.first.explanation}, got ${first.friendlyExplanation}`);
      }
    }
  }
  for (const w of e.warnings ?? []) {
    const hit = o.warningItems.find(
      (x) =>
        x.kind === w.kind &&
        (w.line === undefined || x.line === w.line) &&
        (!w.file || w.file.test(x.file)) &&
        (!w.message || w.message.test(x.message))
    );
    if (!hit) {
      problems.push(
        `warning ${JSON.stringify({ ...w, file: w.file?.source, message: w.message?.source })} not found in: ` +
          o.warningItems.map((x) => `${x.kind}@${x.file}:${x.line} ${x.message}`).join(' | ')
      );
    }
  }
  for (const k of e.noWarningKinds ?? []) {
    const bad = o.warningItems.filter((x) => x.kind === k);
    if (bad.length) problems.push(`unexpected ${k} warnings: ${bad.map((x) => x.message).join(' | ')}`);
  }
  if (e.softWarning && !o.errors.some((x) => x.severity === 'warning' && e.softWarning!.test(x.message))) {
    problems.push(`no severity-warning entry matching ${e.softWarning}`);
  }
  return problems;
}
