import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { buildLatexmkArgs, collapseFatalTail, explainMissingPdf, type CompileError } from '../server/compiler.js';
import { fileStackByLine, parseLatexWarnings } from '../server/logWarnings.js';
import { DIAGNOSTIC_CASES } from './diagnosticCases.js';
import {
  analyzeDiagnosticRecording,
  checkDiagnostic,
  compileDiagnostic,
  hasDiagnosticRecording,
  materializeDiagnostic,
} from './diagnosticHarness.js';

const LIVE = process.env.OBERLEAF_LIVE_TEX === '1' || (import.meta as any).env?.MODE === 'live';

describe.each(DIAGNOSTIC_CASES)(`${LIVE ? 'live' : 'recorded'}: $id: $title`, (c) => {
  it('reports what the viewer and gutter should show', { timeout: 120_000 }, async () => {
    if (!LIVE && !hasDiagnosticRecording(c)) {
      throw new Error(`No recorded log. Record it with: npx tsx scripts/compare-error-cases.ts --record ${c.id}`);
    }
    const dir = materializeDiagnostic(c);
    try {
      const outcome = LIVE ? await compileDiagnostic(dir) : analyzeDiagnosticRecording(c, dir);
      expect(checkDiagnostic(c, outcome)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('latexmk command line', () => {
  it('runs every pass despite errors (-f), as Overleaf does', () => {
    const args = buildLatexmkArgs({ engine: 'pdflatex', miktex: false, buildDir: '/b', mainPath: '/p/main.tex', shellEscape: false });
    expect(args).toContain('-f');
    expect(args).not.toContain('-halt-on-error');
    expect(args[args.length - 1]).toBe('/p/main.tex');
  });
});

describe('collapseFatalTail', () => {
  const err = (message: string, line = 0, file = 'main.tex'): CompileError => ({ file, line, message, raw: message });

  it('drops the Emergency stop and fatal line that follow a real error', () => {
    const out = collapseFatalTail(
      [err("LaTeX Error: File `x.sty' not found.", 2), err('Emergency stop.', 2), err('==> Fatal error occurred, no output PDF file produced!', 2)],
      '',
      []
    );
    expect(out.map((e) => e.message)).toEqual(["LaTeX Error: File `x.sty' not found."]);
  });

  it('gives a missing \\input file the line only the Emergency stop carried', () => {
    const out = collapseFatalTail([err("LaTeX Error: File `ch.tex' not found."), err('Emergency stop.', 4, './main.tex')], '', []);
    expect(out).toHaveLength(1);
    expect(out[0].line).toBe(4);
  });

  it('never takes a line number from inside an installed class', () => {
    const out = collapseFatalTail([err("LaTeX Error: File `cuted.sty' not found."), err('Emergency stop.', 5, 'jnlcls.cls')], '', []);
    expect(out[0].line).toBe(0);
  });

  it('keeps a lone Emergency stop and says why TeX stopped', () => {
    const log = '! Emergency stop.\n<*> main.tex\n\n*** (job aborted, no legal \\end found)\n';
    const out = collapseFatalTail([err('Emergency stop.'), err('==> Fatal error occurred, no output PDF file produced!')], log, [
      '\\documentclass{article}',
      '\\begin{document}',
      'Hello.',
      '',
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].message).toMatch(/no legal \\end found/);
    expect(out[0].line).toBe(3);
    expect(out[0].isCascading).toBe(false);
    expect(out[0].friendlyExplanation).toMatch(/\\end\{document\}/);
  });

  it('does not count a severity-warning entry as the cause', () => {
    const soft = { ...err("I couldn't open database file x.bib", 5), severity: 'warning' as const };
    const out = collapseFatalTail([soft, err('Emergency stop.')], '', []);
    expect(out.map((e) => e.message)).toEqual(["I couldn't open database file x.bib", 'Emergency stop.']);
  });
});

describe('explainMissingPdf', () => {
  it('names an empty document', () => {
    const e = explainMissingPdf('No pages of output.\n', ['\\begin{document}', '\\end{document}']);
    expect(e.line).toBe(2);
    expect(e.friendlyExplanation).toMatch(/printed nothing/);
  });
});

describe('parseLatexWarnings', () => {
  it('attributes warnings to the file TeX was reading', () => {
    const log = [
      '(./main.tex',
      'LaTeX Warning: Reference `a\' on page 1 undefined on input line 3.',
      '(./chapters/intro.tex',
      'LaTeX Warning: Reference `b\' on page 1 undefined on input line 2.',
      ')',
      'LaTeX Warning: Citation `c\' on page 1 undefined on input line 9.',
      ')',
    ].join('\n');
    const w = parseLatexWarnings(log);
    expect(w.map((x) => `${x.kind}@${x.file}:${x.line}`)).toEqual([
      'reference@main.tex:3',
      'reference@chapters/intro.tex:2',
      'citation@main.tex:9',
    ]);
  });

  it('follows a path TeX wrapped at column 79', () => {
    const path = 'C:/Users/someone/Documents/Oberleaf Projects/thesis-final/chapters/03-results.tex';
    const line = ('(' + path).slice(0, 79);
    const rest = ('(' + path).slice(79);
    const files = fileStackByLine([line, rest, 'LaTeX Warning: x on input line 4.']);
    expect(files[2]).toBe(path);
  });

  it('ignores brackets in the source text TeX quotes after an error', () => {
    const files = fileStackByLine(['(./main.tex', 'l.12 see (Smith', '         et al.', 'LaTeX Warning: y']);
    expect(files[3]).toBe('main.tex');
  });

  it('ignores brackets inside an overfull box dump', () => {
    const files = fileStackByLine([
      '(./main.tex',
      'Overfull \\hbox (10.0pt too wide) in paragraph at lines 3--4',
      '[]\\OT1/cmr/m/n/10 text (open',
      '',
      'LaTeX Warning: z',
    ]);
    expect(files[4]).toBe('main.tex');
  });

  it('joins package warning continuation lines and reads the line number', () => {
    const log = [
      'Package natbib Warning: Citation `nokey\' on page 1 undefined on input line 4',
      '(natbib)                .',
      '',
    ].join('\n');
    const [w] = parseLatexWarnings(log);
    expect(w.kind).toBe('citation');
    expect(w.line).toBe(4);
  });

  it('reads the first line of an overfull box report', () => {
    const [w] = parseLatexWarnings('Overfull \\hbox (224.05511pt too wide) in paragraph at lines 3--5\n[]\\OT1/cmr/m/n/10 x\n');
    expect(w).toMatchObject({ kind: 'badbox', line: 3 });
  });

  it('drops the closing summaries when the itemised warnings are there', () => {
    const log = [
      "LaTeX Warning: Reference `a' on page 1 undefined on input line 3.",
      'LaTeX Warning: There were undefined references.',
    ].join('\n');
    expect(parseLatexWarnings(log).map((w) => w.message)).toEqual(["Reference `a' on page 1 undefined on input line 3."]);
  });

  it('keeps a summary that stands alone', () => {
    expect(parseLatexWarnings('LaTeX Warning: There were undefined references.\n')).toHaveLength(1);
  });

  it('reports \\include of a missing .tex file but not first-run auxiliary files', () => {
    const w = parseLatexWarnings('No file main.toc.\nNo file ch2.tex.\nNo file main.bbl.\n');
    expect(w.map((x) => x.message)).toEqual(['No file ch2.tex.']);
    expect(w[0].kind).toBe('file');
  });
});
