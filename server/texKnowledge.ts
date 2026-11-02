// Facts about LaTeX that the error rules in compiler.ts look up: which package
// defines an environment, which commands exist (for "did you mean"), and the
// colour names xcolor knows without options. Kept as data so a rule change and
// its table change are reviewed separately.

/**
 * Environments that are not in the LaTeX kernel, mapped to the preamble line
 * that defines them. `packageName` is empty when the fix is a declaration
 * rather than a package.
 */
export const ENVIRONMENT_SOURCES: Record<string, { packageName: string; snippet: string; note: string }> = {
  align: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'multi-line equations' },
  gather: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'multi-line equations' },
  multline: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'multi-line equations' },
  flalign: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'multi-line equations' },
  alignat: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'multi-line equations' },
  aligned: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'multi-line equations' },
  gathered: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'multi-line equations' },
  cases: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'piecewise definitions' },
  bmatrix: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'matrices' },
  pmatrix: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'matrices' },
  vmatrix: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'matrices' },
  Vmatrix: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'matrices' },
  Bmatrix: { packageName: 'amsmath', snippet: '\\usepackage{amsmath}', note: 'matrices' },
  proof: { packageName: 'amsthm', snippet: '\\usepackage{amsthm}', note: 'proofs and theorem styles' },
  theorem: { packageName: '', snippet: '\\newtheorem{theorem}{Theorem}', note: 'theorem-like environments must be declared with \\newtheorem' },
  lemma: { packageName: '', snippet: '\\newtheorem{lemma}{Lemma}', note: 'theorem-like environments must be declared with \\newtheorem' },
  corollary: { packageName: '', snippet: '\\newtheorem{corollary}{Corollary}', note: 'theorem-like environments must be declared with \\newtheorem' },
  proposition: { packageName: '', snippet: '\\newtheorem{proposition}{Proposition}', note: 'theorem-like environments must be declared with \\newtheorem' },
  definition: { packageName: '', snippet: '\\newtheorem{definition}{Definition}', note: 'theorem-like environments must be declared with \\newtheorem' },
  remark: { packageName: '', snippet: '\\newtheorem{remark}{Remark}', note: 'theorem-like environments must be declared with \\newtheorem' },
  example: { packageName: '', snippet: '\\newtheorem{example}{Example}', note: 'theorem-like environments must be declared with \\newtheorem' },
  tikzpicture: { packageName: 'tikz', snippet: '\\usepackage{tikz}', note: 'programmatic diagrams' },
  axis: { packageName: 'pgfplots', snippet: '\\usepackage{pgfplots}', note: 'plots inside tikzpicture' },
  lstlisting: { packageName: 'listings', snippet: '\\usepackage{listings}', note: 'source code listings' },
  minted: { packageName: 'minted', snippet: '\\usepackage{minted}', note: 'highlighted code (needs shell escape and Pygments)' },
  algorithm: { packageName: 'algorithm', snippet: '\\usepackage{algorithm}', note: 'the floating algorithm box with a caption' },
  algorithmic: { packageName: 'algpseudocode', snippet: '\\usepackage{algpseudocode}', note: 'pseudocode with \\State, \\If, \\For' },
  subfigure: { packageName: 'subcaption', snippet: '\\usepackage{subcaption}', note: 'subfigures with their own captions' },
  subtable: { packageName: 'subcaption', snippet: '\\usepackage{subcaption}', note: 'subtables with their own captions' },
  multicols: { packageName: 'multicol', snippet: '\\usepackage{multicol}', note: 'balanced multi-column text' },
  wrapfigure: { packageName: 'wrapfig', snippet: '\\usepackage{wrapfig}', note: 'figures with text flowing around them' },
  wraptable: { packageName: 'wrapfig', snippet: '\\usepackage{wrapfig}', note: 'tables with text flowing around them' },
  longtable: { packageName: 'longtable', snippet: '\\usepackage{longtable}', note: 'tables that break across pages' },
  tabularx: { packageName: 'tabularx', snippet: '\\usepackage{tabularx}', note: 'tables with stretchable X columns' },
  landscape: { packageName: 'pdflscape', snippet: '\\usepackage{pdflscape}', note: 'rotated landscape pages' },
  tcolorbox: { packageName: 'tcolorbox', snippet: '\\usepackage{tcolorbox}', note: 'coloured boxes' },
  comment: { packageName: 'comment', snippet: '\\usepackage{comment}', note: 'commenting out blocks' },
};

/**
 * Frequently used commands, for suggesting the intended one when an undefined
 * command is a near-miss. Only commands available in a plain article, so the
 * suggestion compiles without loading anything.
 */
export const KNOWN_COMMANDS: readonly string[] = [
  // text formatting
  'textbf', 'textit', 'texttt', 'textsc', 'textsf', 'textrm', 'textsl', 'textup', 'textmd', 'textnormal',
  'emph', 'underline', 'footnote', 'footnotemark', 'footnotetext',
  'tiny', 'scriptsize', 'footnotesize', 'small', 'normalsize', 'large', 'Large', 'LARGE', 'huge', 'Huge',
  'bfseries', 'itshape', 'ttfamily', 'scshape', 'sffamily', 'rmfamily', 'mdseries', 'upshape', 'normalfont',
  // structure
  'part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph',
  'title', 'author', 'date', 'maketitle', 'tableofcontents', 'listoffigures', 'listoftables', 'appendix',
  'label', 'ref', 'pageref', 'cite', 'nocite', 'caption', 'item', 'centering', 'raggedright', 'raggedleft',
  'bibliography', 'bibliographystyle', 'include', 'input', 'includeonly', 'newpage', 'clearpage', 'pagebreak',
  'linebreak', 'newline', 'noindent', 'indent', 'par', 'thanks', 'today', 'and',
  // spacing and boxes
  'hspace', 'vspace', 'hfill', 'vfill', 'smallskip', 'medskip', 'bigskip', 'quad', 'qquad',
  'mbox', 'makebox', 'fbox', 'framebox', 'parbox', 'raisebox', 'rule', 'hline', 'cline', 'multicolumn',
  'textwidth', 'linewidth', 'textheight', 'columnwidth', 'paperwidth',
  // definitions
  'newcommand', 'renewcommand', 'providecommand', 'newenvironment', 'renewenvironment', 'newtheorem',
  'setlength', 'addtolength', 'setcounter', 'addtocounter', 'newcounter', 'usepackage', 'documentclass',
  'pagestyle', 'thispagestyle', 'pagenumbering',
  // math (kernel)
  'frac', 'sqrt', 'sum', 'prod', 'int', 'oint', 'lim', 'infty', 'partial', 'nabla', 'cdot', 'cdots', 'ldots',
  'dots', 'vdots', 'ddots', 'times', 'div', 'pm', 'mp', 'leq', 'geq', 'neq', 'approx', 'equiv', 'sim', 'simeq',
  'subset', 'subseteq', 'supset', 'supseteq', 'in', 'notin', 'cup', 'cap', 'forall', 'exists', 'emptyset',
  'rightarrow', 'leftarrow', 'Rightarrow', 'Leftarrow', 'leftrightarrow', 'Leftrightarrow', 'mapsto', 'to',
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi',
  'omega', 'Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega',
  'mathrm', 'mathbf', 'mathit', 'mathcal', 'mathsf', 'mathtt', 'left', 'right', 'big', 'Big', 'bigg', 'Bigg',
  'hat', 'bar', 'vec', 'dot', 'ddot', 'tilde', 'widehat', 'widetilde', 'overline', 'underbrace', 'overbrace',
  'sin', 'cos', 'tan', 'log', 'ln', 'exp', 'max', 'min', 'sup', 'inf', 'det', 'langle', 'rangle',
  // symbols
  'LaTeX', 'TeX', 'textbackslash', 'textasciitilde', 'textendash', 'textemdash', 'copyright', 'S', 'P',
];

/** Colours xcolor defines without any option (xcolor manual, section 4.1). */
export const XCOLOR_BASE_COLORS: readonly string[] = [
  'red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'black', 'gray', 'white', 'darkgray', 'lightgray',
  'brown', 'lime', 'olive', 'orange', 'pink', 'purple', 'teal', 'violet',
];

/** Damerau-Levenshtein (optimal string alignment) distance: a transposition counts as one edit. */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

/**
 * The single closest candidate within a distance that scales with length, or
 * undefined when nothing is close or two candidates tie (a guess between two
 * equally likely names is worse than no guess).
 */
export function closestMatch(word: string, candidates: readonly string[]): string | undefined {
  const limit = word.length <= 4 ? 1 : 2;
  let best: string | undefined;
  let bestDistance = Infinity;
  let tie = false;
  for (const c of candidates) {
    if (c === word) return undefined;
    const dist = editDistance(word, c);
    if (dist < bestDistance) {
      best = c;
      bestDistance = dist;
      tie = false;
    } else if (dist === bestDistance) {
      tie = true;
    }
  }
  return bestDistance <= limit && !tie ? best : undefined;
}
