// What a whole compile must report for a broken document: whether a PDF comes
// out, how many errors the user sees, and which warnings land on which line.
//
// errorCorpus.ts checks one error's explanation and fix at a time; this set
// checks the result as a whole, the way the viewer and the editor gutter show
// it. Cases 1-10 are the documents compared side by side with Overleaf on
// 2026-11-19 (see docs/ERROR_REPORTING.md); the rest cover warnings and
// multi-file projects.
//
// Logs are recorded by `npx tsx scripts/compare-error-cases.ts --record` into
// tests/fixtures/diagnostics/. OBERLEAF_LIVE_TEX=1 compiles them instead.

import type { CompileWarningKind } from '../server/logWarnings.js';

export interface DiagnosticCase {
  id: string;
  title: string;
  tex: string;
  files?: Record<string, string>;
  /** What Overleaf did with the same document, when it was checked */
  overleaf?: string;
  expect: {
    pdf: boolean;
    /** Errors of severity 'error' after the fatal tail is collapsed */
    errors: number | { min: number };
    first?: { message: RegExp; line?: number; file?: RegExp; highlight?: string; explanation?: RegExp };
    /** Each must be matched by at least one warning item */
    warnings?: Array<{ kind: CompileWarningKind; line?: number; file?: RegExp; message?: RegExp }>;
    /** Warning kinds that must not be reported at all */
    noWarningKinds?: CompileWarningKind[];
    /** An error entry of severity 'warning' (missing .bib) */
    softWarning?: RegExp;
  };
}

const BIB = '@book{knuth, author={Donald Knuth}, title={The TeXbook}, publisher={Addison-Wesley}, year={1984}}\n';

export const DIAGNOSTIC_CASES: DiagnosticCase[] = [
  {
    id: 'refs-despite-error',
    title: 'Undefined command next to a \\ref and a \\cite',
    overleaf: 'PDF, Section 1 and [1] resolved, References printed',
    tex: [
      '\\documentclass{article}',
      '\\begin{document}',
      'Text with \\foo{} undefined. See Section~\\ref{s} and \\cite{knuth}.',
      '\\section{One}\\label{s}',
      'Body.',
      '\\bibliographystyle{plain}',
      '\\bibliography{refs}',
      '\\end{document}',
      '',
    ].join('\n'),
    files: { 'refs.bib': BIB },
    expect: {
      pdf: true,
      errors: 1,
      first: { message: /Undefined control sequence/, line: 3, highlight: '\\foo' },
      // latexmk -f finishes the passes, so nothing is left unresolved.
      noWarningKinds: ['reference', 'citation'],
    },
  },
  {
    id: 'missing-input',
    title: '\\input of a file that does not exist',
    overleaf: 'No PDF, 1 error',
    tex: '\\documentclass{article}\n\\begin{document}\nBefore.\n\\input{chapter-missing}\nAfter.\n\\end{document}\n',
    expect: { pdf: false, errors: 1, first: { message: /chapter-missing\.tex' not found/, line: 4 } },
  },
  {
    id: 'missing-sty',
    title: 'Package that is not installed',
    overleaf: 'No PDF, 1 error',
    tex: '\\documentclass{article}\n\\usepackage{notarealpackagexyz}\n\\begin{document}\nHello.\n\\end{document}\n',
    expect: { pdf: false, errors: 1, first: { message: /notarealpackagexyz\.sty' not found/, line: 2 } },
  },
  {
    id: 'missing-image',
    title: 'Image file that does not exist',
    overleaf: 'PDF with a placeholder box (LaTeX 2026-06)',
    tex: '\\documentclass{article}\n\\usepackage{graphicx}\n\\begin{document}\nBefore. \\includegraphics{figure-missing} After.\n\\end{document}\n',
    expect: { pdf: true, errors: 1, first: { message: /figure-missing/, line: 4 } },
  },
  {
    id: 'unclosed-brace-paragraph',
    title: '\\textbf{ never closed, across a paragraph',
    overleaf: 'No PDF, 2 errors (Runaway argument, Emergency stop)',
    tex: '\\documentclass{article}\n\\begin{document}\nHello \\textbf{bold text\n\nNext paragraph.\n\\end{document}\n',
    expect: { pdf: false, errors: 1, first: { message: /File ended while scanning use of \\textbf/, line: 3 } },
  },
  {
    id: 'no-end-document',
    title: 'Missing \\end{document}',
    overleaf: 'No PDF, 1 error (Emergency stop)',
    tex: '\\documentclass{article}\n\\begin{document}\nHello.\n',
    expect: {
      pdf: false,
      errors: 1,
      first: { message: /no legal \\end found/, line: 3, explanation: /\\end\{document\}/ },
    },
  },
  {
    id: 'env-mismatch-pdf',
    title: '\\begin{itemize} closed by \\end{enumerate}',
    overleaf: 'PDF, errors listed',
    tex: '\\documentclass{article}\n\\begin{document}\n\\begin{itemize}\n\\item One\n\\end{enumerate}\nText after.\n\\end{document}\n',
    expect: { pdf: true, errors: { min: 1 }, first: { message: /ended by \\end\{enumerate\}/, line: 5 } },
  },
  {
    id: 'math-errors',
    title: 'Double superscript and double subscript',
    overleaf: 'PDF, errors listed',
    tex: '\\documentclass{article}\n\\begin{document}\nInline $x^2^3$ and $a_b_c$.\n\\end{document}\n',
    expect: { pdf: true, errors: 2, first: { message: /Double superscript/, line: 3 } },
  },
  {
    id: 'missing-bib-warning',
    title: '\\bibliography naming a file that does not exist',
    overleaf: 'PDF, shown as warnings',
    tex: '\\documentclass{article}\n\\begin{document}\nCite \\cite{a}.\n\\bibliographystyle{plain}\n\\bibliography{nofile}\n\\end{document}\n',
    expect: {
      pdf: true,
      errors: 0,
      softWarning: /nofile\.bib/,
      warnings: [{ kind: 'citation', line: 3, message: /Citation `a'/ }],
    },
  },
  {
    id: 'hundred-errors',
    title: 'More than 100 errors',
    overleaf: 'No PDF, 99+ errors',
    tex:
      '\\documentclass{article}\n\\begin{document}\n' +
      Array.from({ length: 120 }, (_, i) => `Line ${i + 1} \\undefinedmacro`).join('\n') +
      '\n\\end{document}\n',
    expect: { pdf: false, errors: { min: 100 }, first: { message: /Undefined control sequence/, line: 3 } },
  },
  {
    id: 'undefined-ref-only',
    title: '\\ref to a label that does not exist',
    tex: '\\documentclass{article}\n\\begin{document}\nSee Figure~\\ref{fig:none}.\n\\end{document}\n',
    expect: { pdf: true, errors: 0, warnings: [{ kind: 'reference', line: 3, message: /fig:none/ }] },
  },
  {
    id: 'chapter-warning-and-error',
    title: 'Warning and error inside an \\input chapter',
    tex: '\\documentclass{article}\n\\begin{document}\nIntro.\n\\input{chapters/intro}\nEnd.\n\\end{document}\n',
    files: { 'chapters/intro.tex': 'Chapter text.\nSee \\ref{missing}.\nMore text.\n\\badcmd here.\n' },
    expect: {
      pdf: true,
      errors: 1,
      first: { message: /Undefined control sequence/, line: 4, file: /chapters[\\/]intro\.tex$/ },
      warnings: [{ kind: 'reference', line: 2, file: /chapters\/intro\.tex$/ }],
    },
  },
  {
    id: 'overfull-box',
    title: 'Content wider than the text block',
    tex: '\\documentclass{article}\n\\begin{document}\n\\noindent\\hbox{\\rule{20cm}{1pt}}\n\\end{document}\n',
    expect: { pdf: true, errors: 0, warnings: [{ kind: 'badbox', line: 3, message: /Overfull \\hbox/ }] },
  },
  {
    id: 'empty-document',
    title: 'Nothing between \\begin{document} and \\end{document}',
    overleaf: 'No PDF panel lists "document environment contains no content"',
    tex: '\\documentclass{article}\n\\begin{document}\n\\end{document}\n',
    expect: { pdf: false, errors: 1, first: { message: /No pages of output/, line: 3, explanation: /printed nothing/ } },
  },
  {
    id: 'duplicate-label',
    title: 'The same \\label twice',
    tex: '\\documentclass{article}\n\\begin{document}\n\\section{A}\\label{a}\n\\section{B}\\label{a}\nSee \\ref{a}.\n\\end{document}\n',
    expect: { pdf: true, errors: 0, warnings: [{ kind: 'label', file: /^$/, message: /Label `a' multiply defined/ }] },
  },
  {
    id: 'font-shape',
    title: 'Bold small caps in Computer Modern',
    tex: '\\documentclass{article}\n\\begin{document}\n\\textsc{\\textbf{Bold Caps}}\n\\end{document}\n',
    expect: { pdf: true, errors: 0, warnings: [{ kind: 'font', line: 3, message: /Font shape/ }] },
  },
  {
    id: 'natbib-citation',
    title: 'natbib citation to a key that is not in the .bib',
    tex: '\\documentclass{article}\n\\usepackage{natbib}\n\\begin{document}\n\\citet{nokey} and \\citep{knuth}.\n\\bibliographystyle{plainnat}\n\\bibliography{refs}\n\\end{document}\n',
    files: { 'refs.bib': BIB },
    expect: { pdf: true, errors: 0, warnings: [{ kind: 'citation', line: 4, message: /nokey/ }] },
  },
  {
    id: 'missing-include',
    title: '\\include of a file that does not exist',
    tex: '\\documentclass{article}\n\\begin{document}\nBefore.\n\\include{nochapter}\nAfter.\n\\end{document}\n',
    // TeX only logs "No file nochapter.tex." and leaves the chapter out.
    expect: { pdf: true, errors: 0, warnings: [{ kind: 'file', line: 4, file: /^main\.tex$/, message: /nochapter\.tex/ }] },
  },
];
