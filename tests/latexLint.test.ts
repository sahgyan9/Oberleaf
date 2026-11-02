import { describe, expect, it } from 'vitest';
import { lintLatex, type LintFinding } from '../src/utils/latexLint';

const doc = (body: string, preamble = '') =>
  `\\documentclass{article}\n${preamble ? `${preamble}\n` : ''}\\begin{document}\n${body}\n\\end{document}\n`;

const rules = (findings: LintFinding[]) => findings.map((f) => f.rule);
const only = (findings: LintFinding[], rule: string) => findings.filter((f) => f.rule === rule);

/** The document after applying every fix of `rule`, one line at a time, as the UI does. */
function applyFixes(source: string, rule: string, context = {}): string {
  const lines = source.split('\n');
  for (const f of only(lintLatex(source, context), rule)) {
    if (f.fix && lines[f.line - 1] === f.fix.find) lines[f.line - 1] = f.fix.replace;
  }
  return lines.join('\n');
}

describe('display-dollars', () => {
  it('replaces $$...$$ with \\[...\\]', () => {
    expect(applyFixes(doc('$$ E = mc^2 $$'), 'display-dollars')).toContain('\\[ E = mc^2 \\]');
  });
  it('handles $$ on separate lines', () => {
    const fixed = applyFixes(doc('$$\nx = 1\n$$'), 'display-dollars');
    expect(fixed).toContain('\\[\nx = 1\n\\]');
  });
  it('ignores \\$\\$ and comments', () => {
    expect(rules(lintLatex(doc('Costs \\$\\$ more. % $$ not math')))).not.toContain('display-dollars');
  });
});

describe('obsolete-font-command', () => {
  it('turns {\\bf x} into \\textbf{x}', () => {
    expect(applyFixes(doc('This is {\\bf bold} and {\\it slanted}.'), 'obsolete-font-command')).toContain(
      'This is \\textbf{bold} and \\textit{slanted}.'
    );
  });
  it('turns a bare switch into the declaration', () => {
    expect(applyFixes(doc('\\bf Everything after'), 'obsolete-font-command')).toContain('\\bfseries Everything after');
  });
  it('does not match longer commands or math', () => {
    expect(rules(lintLatex(doc('\\bfseries x \\item y $\\rm d$ \\textit{z}')))).not.toContain('obsolete-font-command');
  });
});

describe('tie-before-reference', () => {
  it('replaces the space before \\ref and \\cite with ~', () => {
    expect(applyFixes(doc('See Figure \\ref{fig:a} and prior work \\cite{knuth}.'), 'tie-before-reference')).toContain(
      'See Figure~\\ref{fig:a} and prior work~\\cite{knuth}.'
    );
  });
  // From a real report: the math mask once made the formula look like
  // spaces, and the fix deleted it.
  it('only replaces the real space after inline math, never the math', () => {
    const line = 'and $\\lambda_{K\\alpha_2}=1.5444\\,\\text{\\AA}$ \\cite{holzer1997}, were kept';
    expect(applyFixes(doc(line), 'tie-before-reference')).toContain(
      'and $\\lambda_{K\\alpha_2}=1.5444\\,\\text{\\AA}$~\\cite{holzer1997}, were kept'
    );
  });
  it('ignores \\ref inside math and at the start of a group', () => {
    expect(rules(lintLatex(doc('$x = y \\ref{a}$ \\textbf{ \\ref{a}}\\label{a}')))).not.toContain('tie-before-reference');
  });
  it('leaves an existing tie alone', () => {
    expect(rules(lintLatex(doc('See Figure~\\ref{fig:a}.\\label{fig:a}')))).not.toContain('tie-before-reference');
  });
});

describe('ellipsis', () => {
  it('replaces ... in text', () => {
    expect(applyFixes(doc('And so on...'), 'ellipsis')).toContain('And so on\\dots{}');
  });
  it('ignores math, verbatim, \\verb and comments', () => {
    const src = doc('$1, 2, ...$ \\verb|a...b| % wait...\n\\begin{verbatim}\nx...\n\\end{verbatim}');
    expect(rules(lintLatex(src))).not.toContain('ellipsis');
  });
  it('ignores the preamble', () => {
    expect(rules(lintLatex(doc('Text.', '\\title{Wait...}')))).not.toContain('ellipsis');
  });
});

describe('straight-quotes', () => {
  it('converts "word" to ``word\'\'', () => {
    expect(applyFixes(doc('He said "hello" twice.'), 'straight-quotes')).toContain("He said ``hello'' twice.");
  });
  it('is off when babel ngerman or csquotes is loaded', () => {
    expect(rules(lintLatex(doc('"a and "o', '\\usepackage[ngerman]{babel}')))).not.toContain('straight-quotes');
    expect(rules(lintLatex(doc('"x"', '\\usepackage{csquotes}')))).not.toContain('straight-quotes');
  });
  // From a real bibliography: \" is an umlaut accent, not a quote
  it('does not treat \\" accents as quotes', () => {
    const src = doc("Kolloidteilchen mittels R\\\"ontgenstrahlen,'' G\\\"ottingen and J.~H\\\"artwig, E.~F\\\"orster");
    expect(rules(lintLatex(src))).not.toContain('straight-quotes');
  });
  it('ignores quotes in the preamble', () => {
    expect(rules(lintLatex(doc('Text.', '\\hypersetup{pdftitle="A title"}')))).not.toContain('straight-quotes');
  });
});

describe('math rules', () => {
  it('flags \\over only in math', () => {
    expect(rules(lintLatex(doc('$a \\over b$')))).toContain('over');
    expect(rules(lintLatex(doc('Game \\overview')))).not.toContain('over');
  });
  it('flags eqnarray', () => {
    expect(rules(lintLatex(doc('\\begin{eqnarray}\na &=& b\n\\end{eqnarray}')))).toContain('eqnarray');
  });
  it('tracks multi-line display math so text rules stay quiet inside it', () => {
    const src = doc('\\begin{align}\nx &= 1, ... \\\\\ny &= "q"\n\\end{align}');
    expect(rules(lintLatex(src))).not.toContain('ellipsis');
    expect(rules(lintLatex(src))).not.toContain('straight-quotes');
  });
});

describe('floats', () => {
  it('reports \\label before \\caption on the label line', () => {
    const src = doc('\\begin{figure}\n\\label{fig:a}\n\\caption{A}\n\\end{figure}');
    const f = only(lintLatex(src), 'label-before-caption');
    expect(f).toHaveLength(1);
    expect(f[0].line).toBe(4);
  });
  it('accepts \\label after \\caption, also on the same line', () => {
    expect(rules(lintLatex(doc('\\begin{figure}\n\\caption{A}\\label{fig:a}\n\\end{figure}')))).not.toContain('label-before-caption');
  });
  it('reports a label before the caption on the same line', () => {
    expect(rules(lintLatex(doc('\\begin{table}\n\\label{t}\\caption{T}\n\\end{table}')))).toContain('label-before-caption');
  });
  it('flags center inside a float but not outside', () => {
    expect(rules(lintLatex(doc('\\begin{figure}\n\\begin{center}\nx\n\\end{center}\n\\end{figure}')))).toContain('center-in-float');
    expect(rules(lintLatex(doc('\\begin{center}\nx\n\\end{center}')))).not.toContain('center-in-float');
  });
});

describe('cross references', () => {
  it('flags a duplicate label', () => {
    expect(rules(lintLatex(doc('\\label{a}\n\\label{a}')))).toContain('duplicate-label');
  });
  it('flags \\ref to a missing label and suggests the near-miss', () => {
    const src = doc('\\section{Intro}\\label{sec:intro}\nSee Section~\\ref{sec:intr}.');
    const f = only(lintLatex(src), 'undefined-reference');
    expect(f).toHaveLength(1);
    expect(f[0].fix?.replace).toContain('\\ref{sec:intro}');
  });
  it('does not check references in multi-file documents', () => {
    expect(rules(lintLatex(doc('\\input{chapter}\nSee~\\ref{elsewhere}.')))).not.toContain('undefined-reference');
  });
});

describe('citations', () => {
  it('flags an unknown key and suggests the close one', () => {
    const f = only(lintLatex(doc('As shown~\\cite{knuht}.'), { bibKeys: ['knuth', 'lamport'] }), 'undefined-citation');
    expect(f).toHaveLength(1);
    expect(f[0].fix?.replace).toContain('\\cite{knuth}');
  });
  it('handles multiple keys and optional arguments', () => {
    const f = lintLatex(doc('\\cite[p.~3]{knuth, lamport, nobody}'), { bibKeys: ['knuth', 'lamport'] });
    expect(only(f, 'undefined-citation').map((x) => x.title)).toEqual(['Citation key "nobody" not in the bibliography']);
  });
  it('counts \\bibitem keys and stays quiet without any bibliography', () => {
    expect(rules(lintLatex(doc('\\cite{a}\n\\begin{thebibliography}{9}\n\\bibitem{a} A.\n\\end{thebibliography}')))).not.toContain('undefined-citation');
    expect(rules(lintLatex(doc('\\cite{anything}')))).not.toContain('undefined-citation');
  });
});

describe('missing-image', () => {
  const files = ['main.tex', 'figures/plot.png', 'logo.pdf'];
  it('resolves names without extension and inside subfolders', () => {
    const src = doc('\\includegraphics{plot}\n\\includegraphics{figures/plot.png}\n\\includegraphics[width=1cm]{logo}');
    expect(rules(lintLatex(src, { projectFiles: files }))).not.toContain('missing-image');
  });
  it('flags a missing image and suggests the close file', () => {
    const f = only(lintLatex(doc('\\includegraphics{plott.png}'), { projectFiles: files }), 'missing-image');
    expect(f).toHaveLength(1);
    expect(f[0].fix?.replace).toContain('{figures/plot.png}');
  });
});

describe('obsolete-package', () => {
  it('flags epsfig and a4wide inside a package list', () => {
    const f = only(lintLatex(doc('x', '\\usepackage{amsmath,epsfig}\n\\usepackage{a4wide}')), 'obsolete-package');
    expect(f.map((x) => x.title)).toEqual(['Obsolete package epsfig', 'Obsolete package a4wide']);
  });
});

it('reports nothing for a clean document', () => {
  const clean = doc(
    '\\section{Intro}\\label{sec:intro}\nAs shown in Section~\\ref{sec:intro} and by~\\cite{knuth}, ``quotes\'\' work\\dots{}\n' +
      '\\begin{figure}\n\\centering\n\\includegraphics[width=0.5\\linewidth]{plot}\n\\caption{Plot}\\label{fig:plot}\n\\end{figure}\n' +
      '\\[ \\frac{a}{b} \\]',
    '\\usepackage{graphicx}'
  );
  expect(lintLatex(clean, { bibKeys: ['knuth'], projectFiles: ['plot.png'] })).toEqual([]);
});
