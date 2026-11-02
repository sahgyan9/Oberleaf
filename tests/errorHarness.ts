import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { compileDocument, findMissingBibFiles, parseBibtexLog, parseLatexLog, type CompileError } from '../server/compiler.js';
import type { ErrorCase } from './errorCorpus.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

/**
 * One set of recorded logs per TeX distribution. The same document produces
 * differently wrapped logs on each (MiKTeX's long C:\Users\... paths against
 * TeX Live's /tmp/...), and the parser has to handle both.
 */
export const DISTRIBUTIONS = {
  miktex: { label: 'MiKTeX', dir: path.join(FIXTURES, 'logs') },
  texlive: { label: 'TeX Live', dir: path.join(FIXTURES, 'logs-texlive') },
} as const;
export type Distribution = keyof typeof DISTRIBUTIONS;

/** Kept for callers that only know the original MiKTeX set */
export const LOG_DIR = DISTRIBUTIONS.miktex.dir;

/** The distribution a `pdflatex --version` first line belongs to. */
export function distributionOf(versionLine: string): Distribution {
  return /TeX Live/i.test(versionLine) ? 'texlive' : 'miktex';
}

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

export function hasRecording(c: ErrorCase, distribution: Distribution = 'miktex'): boolean {
  return fs.existsSync(path.join(DISTRIBUTIONS[distribution].dir, `${c.id}.log`));
}

/** Parses recorded logs the same way compileDocument parses live ones. */
export function analyzeRecorded(c: ErrorCase, dir: string, distribution: Distribution = 'miktex'): CompileError[] {
  const logDir = DISTRIBUTIONS[distribution].dir;
  const log = fs.readFileSync(path.join(logDir, `${c.id}.log`), 'utf8');
  const blgPath = path.join(logDir, `${c.id}.blg`);
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
// them where they are. Only as a path component (after / or \): recorded in
// a container as "root", it otherwise rewrote TeX's own help text ("the
// root of the problem").
export function anonymize(text: string, user = os.userInfo().username): string {
  if (!user) return text;
  const name = user.split('').map((ch) => ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(?:\\r?\\n)?');
  const pattern = new RegExp(`(?<=[\\\\/](?:\\r?\\n)?)${name}(?=(?:\\r?\\n)?[\\\\/])`, 'gi');
  return text.replace(pattern, (m) => m.replace(/[^\r\n]/g, 'u'));
}
