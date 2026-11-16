// Data for the Symbols and Reference panel: the math symbols people look up
// most, and the handful of constructs a first document needs.

export interface SymbolEntry {
  /** What is inserted, e.g. \alpha */
  command: string;
  /** Words to find it by; the command name is always searched too */
  name: string;
  /** KaTeX source to draw, when the command alone would not render */
  display?: string;
  /** Package the command needs, when it is not in base LaTeX */
  package?: string;
}

export interface SymbolGroup {
  id: string;
  title: string;
  symbols: SymbolEntry[];
}

const s = (command: string, name: string, extra: Partial<SymbolEntry> = {}): SymbolEntry => ({ command, name, ...extra });

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: 'greek',
    title: 'Greek',
    symbols: [
      s('\\alpha', 'alpha'), s('\\beta', 'beta'), s('\\gamma', 'gamma'), s('\\delta', 'delta'),
      s('\\epsilon', 'epsilon'), s('\\varepsilon', 'epsilon variant'), s('\\zeta', 'zeta'), s('\\eta', 'eta'),
      s('\\theta', 'theta'), s('\\vartheta', 'theta variant'), s('\\kappa', 'kappa'), s('\\lambda', 'lambda'),
      s('\\mu', 'mu micro'), s('\\nu', 'nu'), s('\\xi', 'xi'), s('\\pi', 'pi'), s('\\rho', 'rho'),
      s('\\sigma', 'sigma'), s('\\tau', 'tau'), s('\\phi', 'phi'), s('\\varphi', 'phi variant'),
      s('\\chi', 'chi'), s('\\psi', 'psi'), s('\\omega', 'omega'),
      s('\\Gamma', 'Gamma capital'), s('\\Delta', 'Delta capital change'), s('\\Theta', 'Theta capital'),
      s('\\Lambda', 'Lambda capital'), s('\\Xi', 'Xi capital'), s('\\Pi', 'Pi capital'), s('\\Sigma', 'Sigma capital'),
      s('\\Phi', 'Phi capital'), s('\\Psi', 'Psi capital'), s('\\Omega', 'Omega capital ohm'),
    ],
  },
  {
    id: 'operators',
    title: 'Operators',
    symbols: [
      s('\\pm', 'plus minus'), s('\\mp', 'minus plus'), s('\\times', 'times multiply cross'), s('\\div', 'divide'),
      s('\\cdot', 'dot product centre'), s('\\ast', 'asterisk star'), s('\\circ', 'circle compose degree'),
      s('\\oplus', 'direct sum xor'), s('\\otimes', 'tensor product'), s('\\dagger', 'dagger adjoint'),
      s('\\cup', 'union'), s('\\cap', 'intersection'), s('\\setminus', 'set minus difference'),
      s('\\wedge', 'and wedge'), s('\\vee', 'or vee'), s('\\neg', 'not negation'),
    ],
  },
  {
    id: 'relations',
    title: 'Relations',
    symbols: [
      s('\\leq', 'less than or equal'), s('\\geq', 'greater than or equal'), s('\\neq', 'not equal'),
      s('\\approx', 'approximately'), s('\\sim', 'similar tilde'), s('\\simeq', 'similar or equal'),
      s('\\equiv', 'equivalent identical'), s('\\propto', 'proportional to'), s('\\ll', 'much less'),
      s('\\gg', 'much greater'), s('\\in', 'element of in'), s('\\notin', 'not element of'),
      s('\\subset', 'subset'), s('\\subseteq', 'subset or equal'), s('\\supset', 'superset'),
      s('\\perp', 'perpendicular'), s('\\parallel', 'parallel'), s('\\cong', 'congruent isomorphic'),
    ],
  },
  {
    id: 'arrows',
    title: 'Arrows',
    symbols: [
      s('\\to', 'right arrow to'), s('\\leftarrow', 'left arrow'), s('\\leftrightarrow', 'left right arrow'),
      s('\\Rightarrow', 'implies double right arrow'), s('\\Leftarrow', 'double left arrow'),
      s('\\Leftrightarrow', 'if and only if iff'), s('\\mapsto', 'maps to'), s('\\longrightarrow', 'long right arrow'),
      s('\\uparrow', 'up arrow'), s('\\downarrow', 'down arrow'), s('\\rightleftharpoons', 'equilibrium reversible'),
    ],
  },
  {
    id: 'calculus',
    title: 'Calculus and sums',
    symbols: [
      s('\\int', 'integral'), s('\\oint', 'contour integral closed'), s('\\iint', 'double integral', { package: 'amsmath' }),
      s('\\sum', 'sum summation'), s('\\prod', 'product'), s('\\partial', 'partial derivative'),
      s('\\nabla', 'nabla gradient del'), s('\\infty', 'infinity'), s('\\lim', 'limit'),
      s('\\hbar', 'h bar planck reduced'), s('\\ell', 'ell script l'), s('\\Re', 'real part'), s('\\Im', 'imaginary part'),
    ],
  },
  {
    id: 'sets',
    title: 'Sets and logic',
    symbols: [
      s('\\forall', 'for all'), s('\\exists', 'there exists'), s('\\emptyset', 'empty set'),
      s('\\mathbb{R}', 'real numbers blackboard', { package: 'amssymb' }),
      s('\\mathbb{C}', 'complex numbers blackboard', { package: 'amssymb' }),
      s('\\mathbb{Z}', 'integers blackboard', { package: 'amssymb' }),
      s('\\mathbb{N}', 'natural numbers blackboard', { package: 'amssymb' }),
      s('\\mathbb{Q}', 'rational numbers blackboard', { package: 'amssymb' }),
      s('\\therefore', 'therefore', { package: 'amssymb' }), s('\\because', 'because', { package: 'amssymb' }),
      s('\\ldots', 'dots ellipsis low'), s('\\cdots', 'dots ellipsis centred'), s('\\vdots', 'vertical dots'),
    ],
  },
  {
    id: 'structures',
    title: 'Structures',
    symbols: [
      s('\\frac{a}{b}', 'fraction'), s('\\sqrt{x}', 'square root'), s('\\sqrt[n]{x}', 'nth root'),
      s('x^{2}', 'superscript power exponent'), s('x_{i}', 'subscript index'),
      s('\\hat{x}', 'hat operator unit'), s('\\bar{x}', 'bar mean conjugate'), s('\\vec{x}', 'vector arrow'),
      s('\\dot{x}', 'dot time derivative'), s('\\ddot{x}', 'double dot second derivative'), s('\\tilde{x}', 'tilde'),
      s('\\mathbf{x}', 'bold vector'), s('\\mathcal{L}', 'calligraphic script lagrangian'),
      s('\\left( x \\right)', 'auto sized parentheses brackets', { display: '\\left( \\frac{a}{b} \\right)' }),
      s('\\langle x \\rangle', 'angle brackets expectation bra ket'), s('\\| x \\|', 'norm'),
      s('\\binom{n}{k}', 'binomial choose', { package: 'amsmath' }),
      s('\\text{word}', 'text inside math', { package: 'amsmath' }),
    ],
  },
];

export interface CheatEntry {
  task: string;
  /** Shown, and inserted at the cursor */
  code: string;
  note?: string;
}

export interface CheatGroup {
  title: string;
  entries: CheatEntry[];
}

export const CHEAT_SHEET: CheatGroup[] = [
  {
    title: 'Structure',
    entries: [
      { task: 'Section heading', code: '\\section{Title}' },
      { task: 'Subsection', code: '\\subsection{Title}' },
      { task: 'Heading without a number', code: '\\section*{Title}' },
      { task: 'New paragraph', code: '\n\n', note: 'Leave one blank line. A single line break does nothing.' },
      { task: 'Force a new page', code: '\\clearpage' },
    ],
  },
  {
    title: 'Text',
    entries: [
      { task: 'Bold', code: '\\textbf{text}' },
      { task: 'Italic', code: '\\textit{text}' },
      { task: 'Emphasis', code: '\\emph{text}' },
      { task: 'Monospace', code: '\\texttt{text}' },
      { task: 'Quotation marks', code: "``text''", note: 'Two backticks open, two apostrophes close.' },
      { task: 'Footnote', code: '\\footnote{Text of the note.}' },
      { task: 'Characters that need a backslash', code: '\\% \\& \\$ \\# \\_', note: 'Typed bare, each of these means something to LaTeX.' },
      { task: 'Non-breaking space', code: 'Figure~\\ref{fig:x}', note: 'The ~ keeps "Figure" and its number on one line.' },
    ],
  },
  {
    title: 'Lists',
    entries: [
      { task: 'Bullet list', code: '\\begin{itemize}\n  \\item First\n  \\item Second\n\\end{itemize}' },
      { task: 'Numbered list', code: '\\begin{enumerate}\n  \\item First\n  \\item Second\n\\end{enumerate}' },
    ],
  },
  {
    title: 'Math',
    entries: [
      { task: 'Math inside a sentence', code: '$E = mc^2$' },
      { task: 'Numbered equation', code: '\\begin{equation}\n  E = mc^2\n  \\label{eq:energy}\n\\end{equation}' },
      { task: 'Equation without a number', code: '\\[\n  E = mc^2\n\\]' },
      {
        task: 'Several aligned equations',
        code: '\\begin{align}\n  a &= b + c \\\\\n    &= d\n\\end{align}',
        note: 'Needs \\usepackage{amsmath}. The & marks where the lines align.',
      },
      { task: 'Matrix', code: '\\begin{pmatrix}\n  a & b \\\\\n  c & d\n\\end{pmatrix}', note: 'Inside math mode. Needs amsmath.' },
    ],
  },
  {
    title: 'Figures, tables and references',
    entries: [
      {
        task: 'Figure',
        code: '\\begin{figure}[htbp]\n  \\centering\n  \\includegraphics[width=0.8\\linewidth]{figures/name}\n  \\caption{What the figure shows.}\n  \\label{fig:name}\n\\end{figure}',
        note: 'Or drop an image onto the editor and this is written for you.',
      },
      { task: 'Label something', code: '\\label{sec:method}', note: 'Place it right after the \\section or \\caption it names.' },
      { task: 'Refer to a label', code: 'Section~\\ref{sec:method}', note: 'Compile twice if you see ?? in the PDF.' },
      { task: 'Refer to an equation', code: 'Eq.~\\eqref{eq:energy}' },
      { task: 'Cite a source', code: '\\cite{key}', note: 'The key comes from your .bib file. The Cite button looks papers up for you.' },
      { task: 'Print the bibliography', code: '\\bibliographystyle{plain}\n\\bibliography{references}', note: 'Before \\end{document}.' },
    ],
  },
];

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Ctrl + Enter', action: 'Recompile' },
  { keys: 'Ctrl + S', action: 'Save' },
  { keys: 'Ctrl + K', action: 'Search files, headings and commands' },
  { keys: 'Ctrl + Shift + M', action: 'Symbols and reference (this panel)' },
  { keys: 'Ctrl + B', action: 'Bold, or toggle the sidebar outside the editor' },
  { keys: 'Ctrl + I', action: 'Italic' },
  { keys: 'Ctrl + /', action: 'Comment or uncomment the selected lines' },
  { keys: 'Ctrl + F', action: 'Find in the open file' },
  { keys: 'Ctrl + H', action: 'Find and replace' },
  { keys: 'Ctrl + Alt + J', action: 'Jump from the cursor to the same place in the PDF' },
  { keys: 'Double-click in the PDF', action: 'Jump to that line in the source' },
  { keys: 'Ctrl + 7 / 8 / 9', action: 'Editor only, split, PDF only' },
  { keys: 'Alt + M', action: 'Comment on the current line' },
  { keys: 'F11', action: 'Full screen' },
];
