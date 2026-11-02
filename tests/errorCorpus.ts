// The error corpus: one minimal document per mistake, with what Oberleaf must
// report for it. Every rule in server/compiler.ts that explains an error or
// offers a fix should have a case here, so a change that breaks one fails the
// suite instead of shipping.
//
// Logs are recorded from a real compile by scripts/record-error-logs.ts and
// stored in tests/fixtures/logs/<id>.log (and <id>.blg for BibTeX), so the
// default test run needs no TeX installation. OBERLEAF_LIVE_TEX=1 compiles
// every case instead.
//
// `origin` says where the mistake comes from, so the list can be checked
// against the sources it claims to cover.

import type { SuggestedFix } from '../server/compiler.js';

export interface ExpectedFix {
  type: SuggestedFix['type'];
  packageName?: string;
  /** Substring the fix's added text must contain (replace or codeSnippet) */
  contains?: string;
}

export interface ErrorCase {
  id: string;
  title: string;
  origin: 'Overleaf' | 'l2tabu/ChkTeX' | 'Windows/MiKTeX' | 'Oberleaf';
  tex: string;
  /** Extra project files, path relative to the project root */
  files?: Record<string, string | Buffer>;
  expect: {
    /** Picks the error under test from the parsed list */
    message: RegExp;
    /** 1-based source line the error must point at */
    line?: number;
    /** File the error must point at, when it is not main.tex */
    file?: RegExp;
    explanation: RegExp;
    fix?: ExpectedFix;
  };
}

// 1x1 transparent PNG
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

const doc = (preamble: string, body: string) =>
  `\\documentclass{article}\n${preamble}${preamble ? '\n' : ''}\\begin{document}\n${body}\n\\end{document}\n`;

export const ERROR_CASES: ErrorCase[] = [
  // ─── Undefined commands and missing packages ─────────────────────────────
  {
    id: 'undefined-command-typo',
    title: 'Misspelled command',
    origin: 'Overleaf',
    tex: doc('', String.raw`Some \textbff{bold} text.`),
    expect: {
      message: /Undefined control sequence/,
      line: 3,
      explanation: /\\textbff/,
      fix: { type: 'replace_line', contains: String.raw`\textbf{bold}` },
    },
  },
  {
    id: 'undefined-command-unknown',
    title: 'Command that exists nowhere',
    origin: 'Overleaf',
    tex: doc('', String.raw`Some \frobnicateall text.`),
    expect: { message: /Undefined control sequence/, line: 3, explanation: /\\frobnicateall/ },
  },
  {
    id: 'undefined-command-in-argument',
    title: 'Misspelled command inside a heading',
    origin: 'Overleaf',
    tex: doc('', String.raw`\section{About \emphh{this}}`),
    expect: {
      message: /Undefined control sequence/,
      line: 3,
      explanation: /\\emphh/,
      fix: { type: 'replace_line', contains: String.raw`\emph{this}` },
    },
  },
  {
    id: 'includegraphics-no-graphicx',
    title: '\\includegraphics without graphicx',
    origin: 'Overleaf',
    tex: doc('', String.raw`\includegraphics{plot.png}`),
    files: { 'plot.png': PNG },
    expect: {
      message: /Undefined control sequence/,
      explanation: /graphicx/,
      fix: { type: 'add_preamble', packageName: 'graphicx' },
    },
  },
  {
    id: 'amssymb-missing',
    title: '\\mathbb without amssymb',
    origin: 'Overleaf',
    tex: doc('', String.raw`The reals $\mathbb{R}$.`),
    expect: {
      message: /Undefined control sequence/,
      explanation: /amssymb/,
      fix: { type: 'add_preamble', packageName: 'amssymb' },
    },
  },
  {
    id: 'align-without-amsmath',
    title: 'align without amsmath',
    origin: 'Overleaf',
    tex: doc('', String.raw`\begin{align}a &= b\end{align}`),
    expect: {
      message: /Environment align undefined/,
      explanation: /amsmath/,
      fix: { type: 'add_preamble', packageName: 'amsmath' },
    },
  },
  {
    id: 'booktabs-missing',
    title: '\\toprule without booktabs',
    origin: 'Overleaf',
    tex: doc('', String.raw`\begin{tabular}{l}\toprule a\\\bottomrule\end{tabular}`),
    expect: { message: /Undefined control sequence/, explanation: /booktabs/, fix: { type: 'add_preamble', packageName: 'booktabs' } },
  },
  {
    id: 'hyperref-missing',
    title: '\\href without hyperref',
    origin: 'Overleaf',
    tex: doc('', String.raw`\href{https://example.com}{link}`),
    expect: { message: /Undefined control sequence/, explanation: /hyperref/, fix: { type: 'add_preamble', packageName: 'hyperref' } },
  },
  {
    id: 'xcolor-missing',
    title: '\\textcolor without xcolor',
    origin: 'Overleaf',
    tex: doc('', String.raw`\textcolor{red}{warning}`),
    expect: { message: /Undefined control sequence/, explanation: /xcolor/, fix: { type: 'add_preamble', packageName: 'xcolor' } },
  },
  {
    id: 'tikz-missing',
    title: 'tikzpicture without tikz',
    origin: 'Overleaf',
    tex: doc('', String.raw`\begin{tikzpicture}\end{tikzpicture}`),
    expect: { message: /Environment tikzpicture undefined/, explanation: /tikz/, fix: { type: 'add_preamble', packageName: 'tikz' } },
  },
  {
    id: 'listings-missing',
    title: 'lstlisting without listings',
    origin: 'Overleaf',
    tex: doc('', 'Code:\n\\begin{lstlisting}\nx = 1\n\\end{lstlisting}'),
    expect: { message: /Environment lstlisting undefined/, explanation: /listings/, fix: { type: 'add_preamble', packageName: 'listings' } },
  },
  {
    id: 'siunitx-missing',
    title: '\\SI without siunitx',
    origin: 'Overleaf',
    tex: doc('', String.raw`Length \SI{3}{\metre}.`),
    expect: { message: /Undefined control sequence/, explanation: /siunitx/, fix: { type: 'add_preamble', packageName: 'siunitx' } },
  },
  {
    id: 'cleveref-missing',
    title: '\\cref without cleveref',
    origin: 'Overleaf',
    tex: doc('', String.raw`See \cref{sec:a}.`),
    expect: { message: /Undefined control sequence/, explanation: /cleveref/, fix: { type: 'add_preamble', packageName: 'cleveref' } },
  },
  {
    id: 'algorithmic-missing',
    title: 'algorithmic / \\State without algpseudocode',
    origin: 'Overleaf',
    tex: doc('', String.raw`\begin{algorithmic}\State x\end{algorithmic}`),
    expect: {
      message: /Environment algorithmic undefined/,
      explanation: /algpseudocode/,
      fix: { type: 'add_preamble', packageName: 'algpseudocode' },
    },
  },
  {
    id: 'algorithm-float-missing',
    title: 'algorithm float without the algorithm package',
    origin: 'Overleaf',
    tex: doc('', String.raw`\begin{algorithm}\caption{Sort}\end{algorithm}`),
    expect: {
      message: /Environment algorithm undefined/,
      explanation: /algorithm/,
      fix: { type: 'add_preamble', packageName: 'algorithm' },
    },
  },
  {
    id: 'multicols-missing',
    title: 'multicols without multicol',
    origin: 'Overleaf',
    tex: doc('', String.raw`\begin{multicols}{2}text\end{multicols}`),
    expect: {
      message: /Environment multicols undefined/,
      explanation: /multicol\b/,
      fix: { type: 'add_preamble', packageName: 'multicol' },
    },
  },
  {
    id: 'theorem-undefined',
    title: 'theorem environment never declared',
    origin: 'Overleaf',
    tex: doc('', String.raw`\begin{theorem}True.\end{theorem}`),
    expect: {
      message: /Environment theorem undefined/,
      explanation: /\\newtheorem/,
      fix: { type: 'add_preamble', contains: String.raw`\newtheorem{theorem}{Theorem}` },
    },
  },
  {
    id: 'proof-undefined',
    title: 'proof without amsthm',
    origin: 'Overleaf',
    tex: doc('', String.raw`\begin{proof}Trivial.\end{proof}`),
    expect: { message: /Environment proof undefined/, explanation: /amsthm/, fix: { type: 'add_preamble', packageName: 'amsthm' } },
  },
  {
    id: 'missing-sty',
    title: 'Package that is not installed or misspelled',
    origin: 'Windows/MiKTeX',
    tex: doc(String.raw`\usepackage{oberleafnosuchpkg}`, 'Text.'),
    expect: {
      message: /oberleafnosuchpkg\.sty' not found/,
      line: 2,
      explanation: /oberleafnosuchpkg.*(spell|CTAN)/i,
      fix: { type: 'install_package', packageName: 'oberleafnosuchpkg' },
    },
  },
  {
    id: 'fontspec-pdflatex',
    title: 'fontspec compiled with pdfLaTeX',
    origin: 'Oberleaf',
    tex: doc(String.raw`\usepackage{fontspec}`, 'Text.'),
    expect: { message: /fontspec/, line: 2, explanation: /XeLaTeX/, fix: { type: 'set_engine' } },
  },

  // ─── Math mode ────────────────────────────────────────────────────────────
  {
    id: 'math-outside-math',
    title: 'Math symbol outside math mode',
    origin: 'Overleaf',
    tex: doc('', 'The value x^2 is large.'),
    expect: { message: /Missing \$ inserted/, line: 3, explanation: /\$\.\.\.\$/ },
  },
  {
    id: 'matrix-outside-math',
    title: 'bmatrix outside math mode',
    origin: 'Overleaf',
    tex: doc(String.raw`\usepackage{amsmath}`, String.raw`\begin{bmatrix}1 & 0\end{bmatrix}`),
    expect: { message: /Missing \$ inserted/, explanation: /bmatrix/, fix: { type: 'wrap_math_mode' } },
  },
  {
    id: 'double-subscript',
    title: 'Double subscript',
    origin: 'Overleaf',
    tex: doc('', '$x_a_b$'),
    expect: { message: /Double subscript/, line: 3, explanation: /x_\{a_b\}|braces/ },
  },
  {
    id: 'double-superscript',
    title: 'Double superscript',
    origin: 'Overleaf',
    tex: doc('', '$x^2^3$'),
    expect: { message: /Double superscript/, line: 3, explanation: /braces/ },
  },
  {
    id: 'left-without-right',
    title: '\\left without \\right',
    origin: 'Overleaf',
    tex: doc('', String.raw`$\left( x$`),
    expect: { message: /Missing \\right\. inserted/, line: 3, explanation: /\\left.*\\right/ },
  },
  {
    id: 'unicode-greek',
    title: 'Unicode Greek letter pasted into pdfLaTeX',
    origin: 'Oberleaf',
    tex: doc('', 'The angle α is small.'),
    expect: {
      message: /Unicode character/,
      line: 3,
      explanation: /\\alpha/,
      fix: { type: 'replace_line', contains: String.raw`\ensuremath{\alpha}` },
    },
  },

  // ─── Structure and braces ─────────────────────────────────────────────────
  {
    id: 'text-in-preamble',
    title: 'Text in the preamble',
    origin: 'Overleaf',
    tex: '\\documentclass{article}\nhello\n\\begin{document}\nText.\n\\end{document}\n',
    expect: { message: /Missing \\begin\{document\}/, line: 2, explanation: /preamble/ },
  },
  {
    id: 'unclosed-brace',
    title: 'Argument never closed',
    origin: 'Overleaf',
    tex: '\\documentclass{article}\n\\begin{document}\n\\textbf{abc\n\\end{document}\n',
    expect: { message: /File ended while scanning use of \\textbf/, line: 3, explanation: /\\textbf.*never closed/ },
  },
  {
    id: 'extra-brace',
    title: 'Closing brace with no opening brace',
    origin: 'Overleaf',
    tex: doc('', 'Text}.'),
    expect: { message: /Too many \}'s/, line: 3, explanation: /no matching \{/ },
  },
  {
    id: 'paragraph-ended',
    title: 'Blank line inside a command argument',
    origin: 'Overleaf',
    tex: doc('', '\\textbf{first\n\nsecond}'),
    // \textbf is robust, so TeX names its internal \text@command here
    expect: { message: /Paragraph ended before \\[A-Za-z@]+ was complete/, explanation: /blank line/i },
  },
  {
    id: 'env-mismatch',
    title: '\\begin and \\end that do not match',
    origin: 'Overleaf',
    tex: doc('', '\\begin{itemize}\n\\item a\n\\end{enumerate}'),
    expect: {
      message: /\\begin\{itemize\} on input line 3 ended by \\end\{enumerate\}/,
      line: 5,
      explanation: /itemize.*enumerate|enumerate.*itemize/,
      fix: { type: 'replace_line', contains: String.raw`\end{itemize}` },
    },
  },
  {
    id: 'only-in-preamble',
    title: '\\usepackage after \\begin{document}',
    origin: 'Overleaf',
    tex: doc('', String.raw`\usepackage{amsmath}`),
    expect: { message: /Can be used only in preamble/, line: 3, explanation: /preamble/ },
  },
  {
    id: 'already-defined',
    title: '\\newcommand for a name that exists',
    origin: 'l2tabu/ChkTeX',
    tex: doc(String.raw`\newcommand{\section}{x}`, 'Text.'),
    expect: { message: /Command \\section already defined/, line: 2, explanation: /\\renewcommand|different name/ },
  },
  {
    id: 'verb-in-argument',
    title: '\\verb inside a command argument',
    origin: 'Overleaf',
    tex: doc('', String.raw`\section{Use \verb|x|}`),
    expect: { message: /\\verb illegal in (command )?argument/, line: 3, explanation: /\\texttt/ },
  },
  {
    id: 'and-in-author',
    title: '\\And instead of \\and in \\author',
    origin: 'Oberleaf',
    tex: '\\documentclass{article}\n\\usepackage{amsmath}\n\\author{Ann \\And Bob}\n\\begin{document}\n\\maketitle\n\\end{document}\n',
    expect: { message: /\\And|Missing \$|Misplaced/, line: 3, explanation: /\\and/, fix: { type: 'replace_line', contains: '\\and' } },
  },

  // ─── Lists ────────────────────────────────────────────────────────────────
  {
    id: 'lonely-item',
    title: '\\item outside a list',
    origin: 'Overleaf',
    tex: doc('', String.raw`\item first`),
    expect: { message: /Lonely \\item/, line: 3, explanation: /itemize|enumerate/ },
  },
  {
    id: 'missing-item',
    title: 'Text in a list before the first \\item',
    origin: 'Overleaf',
    tex: doc('', '\\begin{itemize}\nfirst\n\\end{itemize}'),
    expect: { message: /perhaps a missing \\item/, explanation: /\\item/ },
  },
  {
    id: 'linebreak-after-list',
    title: '\\\\ after \\end{itemize}',
    origin: 'Overleaf',
    tex: doc('', '\\begin{itemize}\n\\item a\n\\end{itemize}\\\\\nText.'),
    expect: { message: /\\\\|no line here to end/, line: 5, explanation: /\\\\/, fix: { type: 'replace_line', contains: String.raw`\end{itemize}` } },
  },

  // ─── Tables ───────────────────────────────────────────────────────────────
  {
    id: 'ampersand-in-text',
    title: '& in running text',
    origin: 'Overleaf',
    tex: doc('', 'Smith & Jones agree.'),
    expect: {
      message: /Misplaced alignment tab character &/,
      line: 3,
      explanation: /\\&/,
      fix: { type: 'replace_line', contains: String.raw`Smith \& Jones` },
    },
  },
  {
    id: 'too-many-columns',
    title: 'Row with more cells than columns',
    origin: 'Overleaf',
    tex: doc('', '\\begin{tabular}{ll}\na & b & c \\\\\n\\end{tabular}'),
    expect: { message: /Extra alignment tab has been changed to \\cr/, line: 4, explanation: /3 cells.*2 columns/ },
  },

  // ─── Lengths and numbers ──────────────────────────────────────────────────
  {
    id: 'illegal-unit',
    title: 'Width without a unit',
    origin: 'Overleaf',
    tex: doc(String.raw`\usepackage{graphicx}`, String.raw`\includegraphics[width=0.5]{plot.png}`),
    files: { 'plot.png': PNG },
    expect: {
      message: /Illegal unit of measure/,
      line: 4,
      explanation: /unit/,
      fix: { type: 'replace_line', contains: String.raw`width=0.5\linewidth` },
    },
  },
  {
    id: 'missing-number',
    title: 'Empty length argument',
    origin: 'Overleaf',
    tex: doc('', String.raw`Text\vspace{}more.`),
    expect: { message: /Missing number, treated as zero/, line: 3, explanation: /number|length/i },
  },
  {
    id: 'dimension-too-large',
    title: 'Length beyond TeX\'s maximum',
    origin: 'Overleaf',
    tex: doc('', String.raw`Text\hspace{20000pt}more.`),
    expect: { message: /Dimension too large/, line: 3, explanation: /16383/ },
  },

  // ─── Floats and figures ───────────────────────────────────────────────────
  {
    id: 'missing-image',
    title: 'Image file that does not exist',
    origin: 'Overleaf',
    tex: doc(String.raw`\usepackage{graphicx}`, String.raw`\includegraphics{nofile.png}`),
    expect: { message: /nofile\.png/, line: 4, explanation: /could not be found/ },
  },
  // No case for an image in a subfolder referenced without its folder: the
  // compiler puts every project subfolder on TEXINPUTS, so that compiles.
  {
    id: 'too-many-floats',
    title: 'Too many unprocessed floats',
    origin: 'Overleaf',
    // Current LaTeX allocates float slots on demand (about 250 on pdfTeX), so
    // it takes this many unplaceable floats to exhaust them.
    tex: doc('', Array.from({ length: 260 }, () =>String.raw`\begin{figure}[b]\rule{1cm}{12cm}\caption{x}\end{figure}`).join('\n')),
    expect: { message: /Too many unprocessed floats/, explanation: /\\clearpage/ },
  },
  {
    id: 'float-in-box',
    title: 'Figure inside a box or another float',
    origin: 'Overleaf',
    tex: doc('', String.raw`\fbox{\begin{figure}x\end{figure}}`),
    expect: { message: /Not in outer par mode/, line: 3, explanation: /float/i },
  },

  // ─── Options, colours, packages ──────────────────────────────────────────
  {
    id: 'option-clash',
    title: 'Package loaded twice with different options',
    origin: 'Overleaf',
    tex: doc('\\usepackage[draft]{graphicx}\n\\usepackage[final]{graphicx}', 'Text.'),
    expect: { message: /Option clash for package graphicx/, explanation: /once/ },
  },
  {
    id: 'undefined-color',
    title: 'Misspelled colour name',
    origin: 'Overleaf',
    tex: doc(String.raw`\usepackage{xcolor}`, String.raw`\textcolor{reed}{warning}`),
    expect: {
      message: /Undefined color `reed'/,
      line: 4,
      explanation: /reed/,
      fix: { type: 'replace_line', contains: String.raw`\textcolor{red}` },
    },
  },
  {
    id: 'capacity-exceeded',
    title: 'Macro that calls itself forever',
    origin: 'Overleaf',
    tex: doc(String.raw`\def\loopy{\loopy x}`, String.raw`\loopy`),
    expect: { message: /TeX capacity exceeded/, explanation: /itself|recurs/i },
  },

  // ─── Bibliography ─────────────────────────────────────────────────────────
  {
    id: 'bib-missing-file',
    title: '.bib file that does not exist',
    origin: 'Overleaf',
    tex: doc('', String.raw`See \cite{knuth}.` + '\n' + String.raw`\bibliographystyle{plain}` + '\n' + String.raw`\bibliography{nofile}`),
    expect: { message: /couldn't open database file nofile\.bib/, explanation: /nofile\.bib/ },
  },
  {
    id: 'bib-no-citations',
    title: '\\bibliography with no \\cite',
    origin: 'Overleaf',
    tex: doc('', 'No citations.\n' + String.raw`\bibliographystyle{plain}` + '\n' + String.raw`\bibliography{refs}`),
    files: { 'refs.bib': '@book{knuth,\n  author = {Donald Knuth},\n  title = {The TeXbook},\n  year = {1984}\n}\n' },
    expect: { message: /found no \\citation commands/, explanation: /\\cite|\\nocite/ },
  },
  {
    id: 'bib-syntax',
    title: '.bib entry missing a comma',
    origin: 'Overleaf',
    tex: doc('', String.raw`See \cite{knuth}.` + '\n' + String.raw`\bibliographystyle{plain}` + '\n' + String.raw`\bibliography{refs}`),
    files: { 'refs.bib': '@book{knuth,\n  author = {Donald Knuth}\n  title = {The TeXbook},\n  year = {1984}\n}\n' },
    expect: { message: /expecting a `,' or a `\}'/, file: /refs\.bib/, line: 3, explanation: /comma/ },
  },
];
