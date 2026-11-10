import { describe, expect, it } from 'vitest';
import { parseVisualConstructs, mathForKatex, extractKatexMacros, VisualConstruct } from '../src/utils/visualLatex';

const doc = (body: string) => `\\documentclass{article}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}\n${body}\n\\end{document}\n`;

function slice(text: string, c: { start: number; end: number }) {
  return text.slice(c.start, c.end);
}

function kinds(list: VisualConstruct[]) {
  return list.map((c) => c.kind);
}

describe('parseVisualConstructs', () => {
  it('ignores the preamble', () => {
    const text = doc('Plain text.');
    expect(parseVisualConstructs(text)).toEqual([]);
  });

  it('finds headings with their title range', () => {
    const text = doc('\\section{Intro to $x$}\n\\subsection*[short]{Details}');
    const found = parseVisualConstructs(text);
    const headings = found.filter((c) => c.kind === 'heading');
    expect(headings).toHaveLength(2);
    const [a, b] = headings as any[];
    expect(text.slice(a.contentStart, a.contentEnd)).toBe('Intro to $x$');
    expect(a.level).toBe(2);
    expect(text.slice(b.contentStart, b.contentEnd)).toBe('Details');
    expect(b.level).toBe(3);
    // Math inside the title is still found.
    expect(found.some((c) => c.kind === 'inlineMath')).toBe(true);
  });

  it('matches nested braces in formatting commands', () => {
    const text = doc('Some \\textbf{bold {nested} \\emph{it}} text.');
    const formats = parseVisualConstructs(text).filter((c) => c.kind === 'format') as any[];
    expect(formats.map((f) => f.style)).toEqual(['bold', 'italic']);
    expect(text.slice(formats[0].contentStart, formats[0].contentEnd)).toBe('bold {nested} \\emph{it}');
  });

  it('respects escapes and comments', () => {
    const text = doc('Costs \\$5 and \\$6. % $not math$ \\textbf{no}\nNext \\% line.');
    expect(parseVisualConstructs(text)).toEqual([]);
  });

  it('finds inline math in both syntaxes, on one line only', () => {
    const text = doc('Energy $E = \\hbar\\omega$ and \\(a^2\\). Broken $x\ny$ here.');
    const math = parseVisualConstructs(text).filter((c) => c.kind === 'inlineMath') as any[];
    expect(math.map((m) => m.math)).toEqual(['E = \\hbar\\omega', 'a^2']);
  });

  it('turns block math into whole-line blocks and keeps environments for KaTeX', () => {
    const text = doc('Text\n\\begin{align}\n  a &= b \\label{eq:1}\\\\\n  c &= d\n\\end{align}\n\\[ x^2 \\]\n$$y$$');
    const blocks = parseVisualConstructs(text).filter((c) => c.kind === 'displayMath') as any[];
    expect(blocks).toHaveLength(3);
    expect(blocks[0].math).toBe('\\begin{align*}\n  a &= b \\\\\n  c &= d\n\\end{align*}');
    expect(blocks[0].endLine - blocks[0].startLine).toBe(3);
    expect(blocks[1].math).toBe('x^2');
    expect(blocks[2].math).toBe('y');
  });

  it('leaves display math that shares a line with text as source', () => {
    const text = doc('So we get \\[ x \\] in a paragraph.');
    expect(kinds(parseVisualConstructs(text))).toEqual([]);
  });

  it('numbers enumerate items and nests bullets', () => {
    const text = doc('\\begin{enumerate}\n\\item One\n\\item[(b)] Two\n\\item Three\n  \\begin{itemize}\n  \\item Inner\n  \\end{itemize}\n\\end{enumerate}');
    const found = parseVisualConstructs(text);
    const items = found.filter((c) => c.kind === 'listItem') as any[];
    expect(items.map((i) => i.marker)).toEqual(['1.', '(b)', '2.', '\u2013']);
    expect(items.map((i) => i.depth)).toEqual([1, 1, 1, 2]);
    expect(slice(text, items[0])).toBe('\\item ');
    expect(found.filter((c) => c.kind === 'listDelimiter')).toHaveLength(4);
  });

  it('reads figure image and caption without parsing inside', () => {
    const text = doc('\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.5\\linewidth]{figs/plot}\n  \\caption{A \\textbf{plot}. \\label{fig:plot}}\n\\end{figure}');
    const found = parseVisualConstructs(text);
    expect(kinds(found)).toEqual(['figure']);
    const fig = found[0] as any;
    expect(fig.imagePath).toBe('figs/plot');
    expect(fig.caption).toBe('A \\textbf{plot}.');
  });

  it('finds citation and reference chips with optional arguments', () => {
    const text = doc('See \\citep[see][p.~4]{knuth84, lamport94} and Eq.~\\eqref{eq:1}.\\label{sec:x}');
    const chips = parseVisualConstructs(text).filter((c) => c.kind === 'chip') as any[];
    expect(chips.map((c) => [c.chip, c.keys])).toEqual([
      ['cite', ['knuth84', 'lamport94']],
      ['ref', ['eq:1']],
      ['label', ['sec:x']],
    ]);
  });

  it('skips verbatim environments and unknown macros', () => {
    const text = doc('\\begin{verbatim}\n\\textbf{raw} $x$\n\\end{verbatim}\n\\R \\mycustom{arg}');
    expect(parseVisualConstructs(text)).toEqual([]);
  });

  it('skips inline verbatim', () => {
    const text = doc('Use \\verb|$x$| or \\verb*+\\textbf{y}+ or \\lstinline[language=C]!$z$!, then $w$.');
    const found = parseVisualConstructs(text);
    expect(found.map((c) => c.kind)).toEqual(['inlineMath']);
    expect((found[0] as any).math).toBe('w');
  });

  it('parses a file without a document environment (an \\input chapter)', () => {
    const text = '\\section{Chapter part}\nText $x$.';
    expect(kinds(parseVisualConstructs(text))).toEqual(['heading', 'inlineMath']);
  });
});

describe('extractKatexMacros', () => {
  it('collects simple preamble definitions only', () => {
    const text = [
      '\\newcommand{\\R}{\\mathbb{R}}',
      '\\renewcommand\\vect[1]{\\boldsymbol{#1}}',
      '\\def\\half{\\frac{1}{2}}',
      '\\DeclareMathOperator*{\\argmax}{arg\\,max}',
      '% \\newcommand{\\hidden}{x}',
      '\\begin{document}',
      '\\newcommand{\\late}{y}',
      '\\end{document}',
    ].join('\n');
    expect(extractKatexMacros(text)).toEqual({
      '\\R': '\\mathbb{R}',
      '\\vect': '\\boldsymbol{#1}',
      '\\half': '\\frac{1}{2}',
      '\\argmax': '\\operatorname*{arg\\,max}',
    });
  });
});

describe('mathForKatex', () => {
  it('drops tags and numbering', () => {
    expect(mathForKatex('\\begin{equation}a \\tag{3} \\nonumber % c\n\\end{equation}')).toBe('\\begin{equation*}a   \n\\end{equation*}');
  });
});
