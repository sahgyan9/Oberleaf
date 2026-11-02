import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileDocument, findMissingBibFiles, parseBibtexLog, parseLatexLog, type CompileError } from '../server/compiler.js';
import type { ErrorCase } from './errorCorpus.js';

export const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'logs');

/** Writes the case into a fresh temporary project and returns its directory. */
export function materialize(c: ErrorCase): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oberleaf-case-${c.id}-`));
  fs.writeFileSync(path.join(dir, 'main.tex'), c.tex, 'utf8');
  for (const [name, body] of Object.entries(c.files ?? {})) {
    const target = path.join(dir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
  }
  return dir;
}

export function sourceLinesOf(c: ErrorCase): string[] {
  return c.tex.split('\n').map((l) => l.replace(/\r$/, ''));
}

/** Parses recorded logs the same way compileDocument parses live ones. */
export function analyzeRecorded(c: ErrorCase, dir: string): CompileError[] {
  const log = fs.readFileSync(path.join(LOG_DIR, `${c.id}.log`), 'utf8');
  const blgPath = path.join(LOG_DIR, `${c.id}.blg`);
  const blg = fs.existsSync(blgPath) ? fs.readFileSync(blgPath, 'utf8') : '';
  const { errors } = parseLatexLog(log, sourceLinesOf(c), dir);
  const bib = [...findMissingBibFiles(sourceLinesOf(c), dir), ...parseBibtexLog(blg, sourceLinesOf(c))].filter(
    (e, i, all) => all.findIndex((o) => o.message === e.message) === i
  );
  return [...errors, ...bib];
}

export async function analyzeLive(c: ErrorCase, dir: string): Promise<CompileError[]> {
  return (await compileDocument(dir, 'main.tex', 'pdflatex')).errors;
}

/** The error the case is about: the first one whose message matches. */
export function pickError(c: ErrorCase, errors: CompileError[]): CompileError | undefined {
  return errors.find((e) => c.expect.message.test(e.message));
}

// Logs carry the account name inside absolute paths. Replace it with a
// placeholder of the same length: TeX wraps the log at 79 columns, and a
// shorter path would move the wrap points the parser has to cope with. The
// wrap can fall inside the name itself, so match across line breaks and keep
// them where they are.
export function anonymize(text: string): string {
  const user = os.userInfo().username;
  if (!user) return text;
  const pattern = new RegExp(
    user.split('').map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\r?\\n)?'),
    'gi'
  );
  return text.replace(pattern, (m) => m.replace(/[^\r\n]/g, 'u'));
}
