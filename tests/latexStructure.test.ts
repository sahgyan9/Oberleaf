import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { checkLatexStructure, visibleStructureFindings } from '../src/utils/latexStructure';

// Line 1 \documentclass, line 2 \begin{document}, the body from line 3.
const doc = (body: string, preamble = '') =>
  `\\documentclass{article}\n${preamble ? `${preamble}\n` : ''}\\begin{document}\n${body}\n\\end{document}\n`;

/** Each finding as "rule@line:column" */
const marks = (src: string) => checkLatexStructure(src).map((f) => `${f.rule}@${f.line}:${f.column}`);

describe('braces', () => {
  it('flags \\textbf{ that runs into a blank line, at the brace', () => {
    const [f, ...rest] = checkLatexStructure(doc('Some \\textbf{bold text\n\nNext paragraph.'));
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ rule: 'unclosed-brace', line: 3, column: 13, endColumn: 14, severity: 'error' });
    expect(f.message).toBe('\\textbf{ is not closed before the paragraph ends');
  });

  it('flags a { left open at the end of the file', () => {
    expect(marks('\\documentclass{article}\n\\begin{document}\n\\textbf{abc')).toEqual([
      'missing-end-document@2:1',
      'unclosed-brace@3:8',
    ]);
  });

  it('reports a missing } inside an environment at its {, not at the end of the file', () => {
    const findings = checkLatexStructure(doc('\\begin{itemize}\n\\item {\\bf one\n\\end{itemize}'));
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['unclosed-brace@4:7']);
    expect(findings[0].message).toBe('{ is not closed before \\end{itemize} on line 5');
  });

  it('flags a } with no {', () => {
    expect(marks(doc('a}b'))).toEqual(['extra-brace@3:2']);
  });

  it('marks the } meant for a cut-off argument as a follow-on', () => {
    const findings = checkLatexStructure(doc('\\textbf{first\n\n\nsecond}'));
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['unclosed-brace@3:8', 'extra-brace@6:7']);
    expect(findings[0].secondary).toBeFalsy();
    expect(findings[1].secondary).toBe(true);
  });

  it('flags a brace still open at \\begin{document}', () => {
    const findings = checkLatexStructure('\\documentclass{article}\n\\title{A\n\\begin{document}\nx\n\\end{document}\n');
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['unclosed-brace@2:7']);
    expect(findings[0].message).toContain('before \\begin{document}');
  });

  it('allows a blank line where TeX does: plain groups, \\footnote, \\parbox, \\title', () => {
    expect(marks(doc('{\\bfseries a\n\nb}\nx\\footnote{a\n\nb}\n\\parbox{3cm}{a\n\nb}', '\\title{A\n\nB}'))).toEqual([]);
  });

  it('flags every short argument that pdflatex rejects a blank line in', () => {
    for (const cmd of ['\\section', '\\section*', '\\emph', '\\caption', '\\label', '\\href{http://a.org}', '\\textcolor{red}']) {
      expect(marks(doc(`${cmd}{a\n\nb`)), cmd).toEqual([`unclosed-brace@3:${cmd.length + 1}`]);
    }
  });

  it('honours escaped braces', () => {
    expect(marks(doc('Sets \\{a, b\\} and a line break \\\\{c}'))).toEqual([]);
    expect(marks(doc('100\\% {open'))).toEqual(['unclosed-brace@3:7']);
  });

  it('ignores % comments, but not \\%', () => {
    expect(marks(doc('a % {{{ \\begin{itemize} $ \\left(\nb'))).toEqual([]);
  });

  it('ignores \\verb, \\lstinline and URLs', () => {
    expect(marks(doc('\\verb|{| \\verb*+$\\left(+ \\verb!}! \\lstinline|if (a) {| \\lstinline{x}'))).toEqual([]);
    expect(marks(doc('\\url{https://example.com/a%20b} \\href{https://example.com/%7Euser}{page}'))).toEqual([]);
  });

  it('ignores verbatim, lstlisting and minted bodies', () => {
    const body = [
      '\\begin{verbatim}',
      '{ $ \\begin{itemize} \\left( \\end{document}',
      '\\end{verbatim}',
      '\\begin{lstlisting}[language=C]',
      'int main() {',
      '\\end{lstlisting}',
      '\\begin{minted}{python}',
      'd = {"a": 1',
      '\\end{minted}',
    ].join('\n');
    expect(marks(doc(body))).toEqual([]);
  });

  it('only counts braces inside definitions, which may hold half an environment', () => {
    const preamble = [
      '\\newcommand{\\be}{\\begin{equation}}',
      '\\newcommand{\\ee}{\\end{equation}}',
      '\\def\\lp{\\left(}',
      '\\newcommand\\rp[1]{#1\\right)}',
      '\\newenvironment{boxed}{\\begin{center}\\begin{minipage}{5cm}}{\\end{minipage}\\end{center}}',
      '\\renewcommand*{\\dollar}{$}',
    ].join('\n');
    expect(marks(doc('\\be x \\ee', preamble))).toEqual([]);
  });

  it('flags a definition whose body is never closed', () => {
    const findings = checkLatexStructure(doc('x', '\\newcommand{\\foo}{abc'));
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['unclosed-brace@2:18']);
  });
});

describe('environments', () => {
  it('flags \\begin{itemize} closed by \\end{enumerate} at both ends', () => {
    const findings = checkLatexStructure(doc('\\begin{itemize}\n\\item One\n\\end{enumerate}'));
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual([
      'environment-mismatch@3:1',
      'environment-mismatch@5:1',
    ]);
    const [begin, end] = findings;
    expect(begin.secondary).toBe(true);
    expect(end.secondary).toBeFalsy();
    expect(end.message).toBe('\\end{enumerate} does not match \\begin{itemize} on line 3');
    expect(end.endColumn).toBe(16);
  });

  it('flags an environment not closed before \\end{document}', () => {
    const findings = checkLatexStructure(doc('\\begin{itemize}\n\\item One'));
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['unclosed-environment@3:1']);
    expect(findings[0].message).toBe('\\begin{itemize} is not closed before \\end{document} on line 5');
  });

  it('flags the inner environment when an outer \\end comes first', () => {
    expect(marks(doc('\\begin{enumerate}\n\\begin{itemize}\n\\item a\n\\end{enumerate}'))).toEqual(['unclosed-environment@4:1']);
  });

  it('flags an \\end with no \\begin', () => {
    expect(marks(doc('Text\n\\end{itemize}'))).toEqual(['extra-end@4:1']);
  });

  it('flags a verbatim environment that is never closed', () => {
    const findings = checkLatexStructure(doc('\\begin{verbatim}\ncode'));
    const verbatim = findings.find((f) => f.rule === 'unclosed-environment');
    expect(verbatim).toMatchObject({ line: 3, column: 1, message: '\\begin{verbatim} is never closed' });
  });

  it('accepts environment arguments and options', () => {
    const body = [
      '\\begin{tabular}{|p{3cm}|c|}',
      'a & b \\\\[2pt]',
      '\\end{tabular}',
      '\\begin{figure}[htbp]',
      '\\centering',
      '\\caption[Short]{A long caption}\\label{fig:a}',
      '\\end{figure}',
    ].join('\n');
    expect(marks(doc(body))).toEqual([]);
  });
});

describe('\\end{document}', () => {
  it('flags a missing \\end{document} at \\begin{document}', () => {
    const findings = checkLatexStructure('\\documentclass{article}\n\\begin{document}\nHello.\n');
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['missing-end-document@2:1']);
    expect(findings[0].message).toBe('\\end{document} is missing');
  });

  it('warns about a second \\end{document}', () => {
    const findings = checkLatexStructure(doc('One\n\\end{document}\nTwo'));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ rule: 'duplicate-end-document', line: 4, column: 1, severity: 'warning' });
    expect(findings[0].message).toBe('\\end{document} appears again on line 6');
  });

  it('ignores what comes after \\end{document}', () => {
    expect(marks(`${doc('x')}notes { $ \\end{itemize}\n`)).toEqual([]);
  });

  it('flags a second \\begin{document}', () => {
    expect(marks('\\documentclass{article}\n\\begin{document}\na\n\\begin{document}\nb\n\\end{document}\n')).toEqual([
      'duplicate-begin-document@4:1',
    ]);
  });

  it('does not ask a chapter file for \\begin or \\end{document}', () => {
    expect(marks('\\section{Intro}\nA chapter with \\textbf{bold}.\n\\begin{itemize}\\item a\\end{itemize}\n')).toEqual([]);
    expect(marks('Last chapter.\n\\end{document}\n')).toEqual([]);
  });
});

describe('math delimiters', () => {
  it('flags a $ not closed before the paragraph ends', () => {
    const findings = checkLatexStructure(doc('Energy $E = mc^2 is famous.\n\nNext.'));
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['unclosed-math@3:8']);
    expect(findings[0].message).toBe('$ is not closed before the paragraph ends');
  });

  it('accepts balanced math, escaped dollars and $ inside \\text', () => {
    expect(marks(doc('$a$, $$b$$, \\(c\\), \\[d\\], \\$5 and \\$6, $a \\text{ if $x>0$}$, $x^{2}$'))).toEqual([]);
  });

  it('flags \\[ and \\( that are not closed', () => {
    expect(marks(doc('\\[ x = 1\n\nText'))).toEqual(['unclosed-math@3:1']);
    expect(marks(doc('\\( x'))).toEqual(['unclosed-math@3:1']);
  });

  it('flags \\] and \\) with no opener', () => {
    expect(marks(doc('x \\] y'))).toEqual(['extra-math-close@3:3']);
    expect(marks(doc('x \\) y'))).toEqual(['extra-math-close@3:3']);
  });

  it('flags a stray $ inside an equation at \\end{equation}', () => {
    expect(marks(doc('\\begin{equation}\na $ b\n\\end{equation}'))).toEqual(['unclosed-math@4:3']);
  });

  it('reports a { left open inside math at the closing $', () => {
    expect(marks(doc('$x^{2 + y$ text.'))).toEqual(['unclosed-brace@3:4']);
  });
});

describe('\\left and \\right', () => {
  it('flags \\left without \\right', () => {
    const findings = checkLatexStructure(doc('$\\left( \\frac{a}{b} $'));
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['unclosed-left@3:2']);
    expect(findings[0].message).toBe('\\left( is not closed before $');
    expect(findings[0].endColumn).toBe(8);
    expect(findings[0].detail).toContain('\\right)');
  });

  it('flags \\right without \\left', () => {
    expect(marks(doc('$ a \\right) $'))).toEqual(['extra-right@3:5']);
  });

  it('accepts balanced and invisible delimiters, and \\leftarrow', () => {
    const body = [
      '$\\left( a \\right)$ $\\left. \\frac{dy}{dx} \\right|_{0}$ $\\left\\{ x \\right\\}$ $a \\leftarrow b \\rightarrow c$',
      '\\begin{align}',
      '\\left[ a \\right] \\\\',
      '\\left\\langle b \\right\\rangle',
      '\\end{align}',
    ].join('\n');
    expect(marks(doc(body))).toEqual([]);
  });

  it('flags a \\left still open at \\end{equation}', () => {
    expect(marks(doc('\\begin{equation}\n\\left( a\n\\end{equation}'))).toEqual(['unclosed-left@4:1']);
  });
});

describe('cursor', () => {
  it('hides the brace the cursor is right after', () => {
    const findings = checkLatexStructure(doc('\\textbf{'));
    expect(findings.map((f) => `${f.rule}@${f.line}:${f.column}`)).toEqual(['unclosed-brace@3:8']);
    expect(visibleStructureFindings(findings, { line: 3, column: 9 })).toEqual([]);
    expect(visibleStructureFindings(findings, { line: 4, column: 1 })).toEqual(findings);
    expect(visibleStructureFindings(findings, null)).toEqual(findings);
  });

  it('hides an opener while the cursor is later on its line, not before it', () => {
    const findings = checkLatexStructure(doc('Energy $E = mc^2'));
    expect(visibleStructureFindings(findings, { line: 3, column: 17 })).toEqual([]);
    expect(visibleStructureFindings(findings, { line: 3, column: 8 })).toEqual(findings);
  });

  it('keeps showing mistakes that are not unfinished openers', () => {
    const findings = checkLatexStructure(doc('a}'));
    expect(visibleStructureFindings(findings, { line: 3, column: 3 })).toEqual(findings);
  });
});

describe('templates', () => {
  // Every bundled template compiles; none may get a mark.
  const root = path.join(__dirname, '..', 'templates');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.tex')) files.push(p);
    }
  };
  walk(root);

  it('finds the templates', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [path.relative(root, f), f]))('%s has no marks', (_name, file) => {
    expect(marks(fs.readFileSync(file, 'utf8'))).toEqual([]);
  });
});
