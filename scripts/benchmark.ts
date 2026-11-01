// Measures the two performance claims the README makes, on this machine:
//
//   1. Compile time of every bundled template, through the same
//      compileDocument() the server route calls.
//   2. Equation preview cost: the work done on each cursor move or keystroke
//      (math detection over the whole buffer, then a KaTeX render).
//
//   npx tsx scripts/benchmark.ts               print results
//   npx tsx scripts/benchmark.ts --write       also rewrite docs/BENCHMARKS.md
//   npx tsx scripts/benchmark.ts --runs 10     samples per measurement (default 5)
//
// Numbers depend on the CPU, the TeX distribution and antivirus, so the report
// records all three alongside the results. Quote them with that context.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { performance } from 'perf_hooks';
import katex from 'katex';
import { compileDocument, cleanBuildCache, isLatexmkAvailable } from '../server/compiler.js';
import { TEMPLATES } from '../server/projects.js';
import { extractMathAtPosition } from '../src/utils/mathDetector.js';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const runsArg = args.indexOf('--runs');
const RUNS = runsArg !== -1 ? Math.max(1, parseInt(args[runsArg + 1], 10) || 5) : 5;
const PREVIEW_ITERATIONS = 2000;

interface Stats {
  n: number;
  median: number;
  p95: number;
  min: number;
  max: number;
}

// Nearest-rank percentiles: with 5 samples p95 is simply the slowest run,
// which is the honest reading for a sample that small.
function stats(samples: number[]): Stats {
  const s = [...samples].sort((a, b) => a - b);
  const rank = (p: number) => s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
  return { n: s.length, median: rank(50), p95: rank(95), min: s[0], max: s[s.length - 1] };
}

function texVersion(): string {
  try {
    const out = execFileSync('pdflatex', ['--version'], { encoding: 'utf8', windowsHide: true });
    return out.split(/\r?\n/)[0].trim();
  } catch {
    return 'pdflatex not found';
  }
}

// ─── Compile ────────────────────────────────────────────────────────────────

interface CompileRow {
  template: string;
  cold: Stats;
  warm: Stats;
  failed: boolean;
}

async function timeCompile(dir: string): Promise<{ ms: number; ok: boolean }> {
  const t0 = performance.now();
  const result = await compileDocument(dir, 'main.tex', 'pdflatex');
  return { ms: performance.now() - t0, ok: result.success };
}

async function benchCompile(): Promise<CompileRow[]> {
  const rows: CompileRow[] = [];
  for (const [key, template] of Object.entries(TEMPLATES)) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `oberleaf-bench-${key}-`));
    try {
      fs.writeFileSync(path.join(dir, 'main.tex'), template.mainTex, 'utf8');
      for (const [name, body] of Object.entries(template.files ?? {})) {
        fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
        fs.writeFileSync(path.join(dir, name), body, 'utf8');
      }

      // Untimed first run: on MiKTeX it may download packages, which measures
      // the network rather than the compiler.
      const first = await timeCompile(dir);
      process.stdout.write(`  ${key}: first run ${first.ok ? 'ok' : 'FAILED'} (${first.ms.toFixed(0)} ms, not counted)\n`);

      const cold: number[] = [];
      const warm: number[] = [];
      let failed = !first.ok;
      for (let i = 0; i < RUNS; i++) {
        // Cold: no aux/toc/out files, so every pass latexmk needs is run.
        cleanBuildCache(dir);
        const c = await timeCompile(dir);
        cold.push(c.ms);

        // Warm: a one-line edit on top of an existing build, which is what
        // pressing Recompile while writing looks like.
        fs.appendFileSync(path.join(dir, 'main.tex'), `\n% edit ${i}\n`);
        const w = await timeCompile(dir);
        warm.push(w.ms);
        failed ||= !c.ok || !w.ok;
      }
      rows.push({ template: key, cold: stats(cold), warm: stats(warm), failed });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  return rows;
}

// ─── Equation preview ───────────────────────────────────────────────────────

interface PreviewRow {
  document: string;
  sizeKb: number;
  detect: Stats;
  render: Stats;
  total: Stats;
}

// Mirrors Editor.tsx updateMathPreview + EquationPreview: detect math around
// the cursor in the full buffer, then render it with KaTeX. Excludes Monaco's
// own work and the browser paint, which add at least one frame (~16 ms).
function benchPreview(): PreviewRow[] {
  const equation =
    '\\begin{equation}\n  \\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}, \\quad ' +
    '\\mathbf{y} = \\mathbf{X}\\boldsymbol{\\beta} + \\boldsymbol{\\varepsilon}\n\\end{equation}\n';
  const paragraph =
    'This paragraph stands in for prose between equations, with inline math $a^2 + b^2 = c^2$ ' +
    'and enough text to give the detector realistic distances to scan.\n\n';

  // Roughly 3 KB per page of LaTeX source.
  const documents: Array<[string, number]> = [
    ['10 pages', 10],
    ['100 pages', 100],
    ['500 pages', 500],
  ];

  return documents.map(([label, pages]) => {
    const half = Math.floor(pages * 3000 / (paragraph.length * 2));
    const before = paragraph.repeat(half);
    const text = `${before}${equation}${paragraph.repeat(half)}`;
    // Cursor inside the equation body, mid-document: the worst case for the
    // backward/forward delimiter scans.
    const offset = before.length + equation.indexOf('\\sqrt');

    const detect: number[] = [];
    const render: number[] = [];
    const total: number[] = [];
    for (let i = 0; i < PREVIEW_ITERATIONS; i++) {
      const t0 = performance.now();
      const ctx = extractMathAtPosition(text, offset);
      const t1 = performance.now();
      if (!ctx) throw new Error(`Detector found no math in the ${label} document`);
      katex.renderToString(ctx.math, { displayMode: ctx.displayMode, throwOnError: true, output: 'htmlAndMathml' });
      const t2 = performance.now();
      detect.push(t1 - t0);
      render.push(t2 - t1);
      total.push(t2 - t0);
    }
    return {
      document: label,
      sizeKb: Math.round(text.length / 1024),
      detect: stats(detect),
      render: stats(render),
      total: stats(total),
    };
  });
}

// ─── Report ─────────────────────────────────────────────────────────────────

const ms = (v: number, digits = 0) => `${v.toFixed(digits)} ms`;

function report(compile: CompileRow[], preview: PreviewRow[], latexmk: boolean): string {
  const cpu = os.cpus()[0]?.model.trim() ?? 'unknown CPU';
  const lines = [
    '# Benchmarks',
    '',
    'Generated by `npx tsx scripts/benchmark.ts --write`. Re-run it on your own machine; these numbers',
    'describe the machine below and nothing else.',
    '',
    '## Environment',
    '',
    `- Date: ${new Date().toLocaleDateString('en-CA')}`,
    `- CPU: ${cpu} (${os.cpus().length} logical cores)`,
    `- RAM: ${(os.totalmem() / 1024 ** 3).toFixed(1)} GB`,
    `- OS: ${os.type()} ${os.release()}`,
    `- Node: ${process.version}`,
    `- TeX: ${texVersion()}`,
    `- Build driver: ${latexmk ? 'latexmk' : 'manual pdflatex passes (latexmk/Perl not available)'}`,
    '',
    '## Compile time (pdflatex)',
    '',
    `${RUNS} timed runs per template after one untimed run. **Cold** starts from an empty build`,
    'folder, so latexmk runs every pass the document needs. **Warm** is a one-line edit on top of an',
    'existing build, which is the normal Recompile while writing. Timed from the call to',
    '`compileDocument()` to its return, so it includes log parsing.',
    '',
    '| Template | Cold median | Cold p95 | Warm median | Warm p95 | Status |',
    '| :-- | --: | --: | --: | --: | :-- |',
    ...compile.map(
      (r) =>
        `| ${r.template} | ${ms(r.cold.median)} | ${ms(r.cold.p95)} | ${ms(r.warm.median)} | ${ms(r.warm.p95)} | ${r.failed ? 'compile errors' : 'ok'} |`
    ),
    '',
    '## Equation preview',
    '',
    `${PREVIEW_ITERATIONS} iterations per document size, cursor inside a display equation in the middle of`,
    'the document. Covers the work Oberleaf does per keystroke: `extractMathAtPosition` over the',
    'whole buffer, then `katex.renderToString`. It excludes Monaco and the browser paint, which add',
    'at least one frame (about 16 ms at 60 Hz) before the preview is visible.',
    '',
    '| Document | Source size | Detect median | Render median | Total median | Total p95 |',
    '| :-- | --: | --: | --: | --: | --: |',
    ...preview.map(
      (r) =>
        `| ${r.document} | ${r.sizeKb} KB | ${ms(r.detect.median, 2)} | ${ms(r.render.median, 2)} | ${ms(r.total.median, 2)} | ${ms(r.total.p95, 2)} |`
    ),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  const latexmk = await isLatexmkAvailable();
  console.log(`Compile benchmark: ${Object.keys(TEMPLATES).length} templates x ${RUNS} runs (cold + warm)`);
  const compile = await benchCompile();
  console.log('Equation preview benchmark');
  const preview = benchPreview();

  const md = report(compile, preview, latexmk);
  console.log(`\n${md}`);
  if (WRITE) {
    const target = path.join(process.cwd(), 'docs', 'BENCHMARKS.md');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, md, 'utf8');
    console.log(`Wrote ${path.relative(process.cwd(), target)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
