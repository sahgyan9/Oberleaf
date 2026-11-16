import { describe, expect, it } from 'vitest';
import { countLatexWords } from '../src/utils/wordCount.js';

describe('countLatexWords', () => {
  it('counts prose and skips the preamble, comments and commands', () => {
    const c = countLatexWords(
      [
        '\\documentclass{article}',
        '\\usepackage{amsmath} % not counted',
        '\\title{Ignored Preamble Title}',
        '\\begin{document}',
        '\\section{Two Words}',
        'Hello \\textbf{bold} world. % a trailing comment with many extra words',
        'See Figure~\\ref{fig:one} and \\cite{key2020}.',
        '\\end{document}',
        'after the end',
      ].join('\n')
    );
    // Two Words / Hello bold world / See Figure and
    expect(c.words).toBe(8);
    expect(c.citations).toBe(1);
  });

  it('counts formulas separately from words', () => {
    const c = countLatexWords(
      'Energy $E = mc^2$ is conserved.\n\\begin{equation}\n a = b\n\\end{equation}\n\\[ x = y \\]\nA 50\\% share costs \\$5.'
    );
    expect(c.inlineMath).toBe(1);
    expect(c.displayMath).toBe(2);
    // Energy is conserved / A 50 share costs 5
    expect(c.words).toBe(8);
  });

  it('counts captions but not table cells or verbatim', () => {
    const c = countLatexWords(
      [
        '\\begin{table}',
        '\\caption{Three word caption}',
        '\\begin{tabular}{ll} alpha & beta \\\\ gamma & delta \\end{tabular}',
        '\\end{table}',
        '\\begin{verbatim}',
        'not counted at all',
        '\\end{verbatim}',
        '\\begin{figure}\\includegraphics[width=1cm]{plot.png}\\caption{One}\\end{figure}',
      ].join('\n')
    );
    expect(c.words).toBe(4);
    expect(c.tables).toBe(1);
    expect(c.figures).toBe(1);
  });

  it('treats a file without \\begin{document} as body text', () => {
    expect(countLatexWords('\\chapter{Intro}\nSome words here.').words).toBe(4);
  });

  it("keeps hyphenated words and contractions as one word", () => {
    expect(countLatexWords("state-of-the-art isn't two").words).toBe(3);
  });
});
