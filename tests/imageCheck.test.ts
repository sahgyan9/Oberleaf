import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { imageFileList } from '../server/imagePaths.js';
import { listProjectFilePaths } from '../server/projectFiles.js';
import { checkImagePaths, graphicsPathsFor } from '../src/utils/imageCheck';
import { analyze } from '../src/utils/latexLint';
import { checkLatexStructure, visibleStructureFindings } from '../src/utils/latexStructure';

const files = imageFileList(['main.tex', 'chapters/intro.tex', 'figures/plot.png', 'logo.pdf', 'art/x.png', 'diagram.svg']);
const root = (body: string, preamble = '') =>
  `\\documentclass{article}\n\\usepackage{graphicx}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`;
const marks = (src: string, main: string[] | null = []) => checkImagePaths(analyze(src), files, main);

describe('checkImagePaths', () => {
  it('marks nothing on paths that resolve', () => {
    expect(marks(root('\\includegraphics{plot}\n\\includegraphics[width=1cm]{figures/plot.png}\n\\includegraphics*{logo}'))).toEqual([]);
  });

  it('marks a missing path with the suggestion and the columns inside the braces', () => {
    const line = '  \\includegraphics[trim={0 0 1cm 0},clip]{plott.png} text';
    const [f, ...rest] = marks(root(line));
    expect(rest).toEqual([]);
    expect(f).toMatchObject({ rule: 'missing-image', line: 4, severity: 'error', suggestion: 'figures/plot.png' });
    expect(line.slice(f.column - 1, f.endColumn - 1)).toBe('plott.png');
    expect(f.message).toBe('No file "plott.png" in the project');
    expect(f.detail).toContain('figures/plot.png');
  });

  it('marks a missing path with no close file, without a suggestion', () => {
    const [f] = marks(root('\\includegraphics{nothing-like-it}'));
    expect(f.suggestion).toBeUndefined();
    expect(f.detail).toBe('Upload it or fix the path.');
  });

  it('says when pdfLaTeX cannot read the file', () => {
    const [f] = marks(root('\\includegraphics{diagram}'));
    expect(f.message).toBe('pdfLaTeX cannot read diagram.svg');
  });

  it('checks every call on a line', () => {
    expect(marks(root('\\includegraphics{a1} and \\includegraphics{plot} and \\includegraphics{b2}')).map((f) => f.column)).toEqual([18, 70]);
  });

  it('ignores comments, verbatim, \\verb and macros', () => {
    const body = [
      '% \\includegraphics{nofile}',
      'x % \\includegraphics{nofile}',
      '\\begin{verbatim}\n\\includegraphics{nofile}\n\\end{verbatim}',
      '\\verb|\\includegraphics{nofile}|',
      '\\newcommand{\\fig}[1]{\\includegraphics{#1}}',
      '\\includegraphics{\\figdir/plot}',
    ].join('\n');
    expect(marks(root(body))).toEqual([]);
  });

  it('honours the file\'s own \\graphicspath', () => {
    expect(marks(root('\\includegraphics{x}', '\\graphicspath{{../shared/}}\n'))).toEqual([]);
  });
});

describe('chapters', () => {
  const chapter = '\\section{Intro}\n\\includegraphics{nofile}\n';
  it('uses the main document\'s \\graphicspath', () => {
    expect(marks(chapter, [])).toHaveLength(1);
    expect(marks(chapter, ['../shared/'])).toEqual([]); // main points outside the project
  });
  it('a chapter\'s own \\graphicspath wins', () => {
    expect(marks('\\graphicspath{{../elsewhere/}}\n' + chapter, [])).toEqual([]);
  });
  it('checks nothing while main\'s paths are unknown', () => {
    expect(marks(chapter, null)).toEqual([]);
    expect(graphicsPathsFor(analyze(chapter), null)).toBeNull();
  });
  it('a file with \\documentclass never waits for main', () => {
    expect(marks(root('\\includegraphics{nofile}'), null)).toHaveLength(1);
  });
});

describe('hiding while the path is being typed', () => {
  const src = root('\\includegraphics{plott}');
  const [f] = marks(src);
  it('is hidden with the cursor anywhere inside the braces', () => {
    for (let c = f.column; c <= f.endColumn; c++) expect(visibleStructureFindings([f], { line: 4, column: c })).toEqual([]);
  });
  it('shows once the cursor leaves the braces or the line', () => {
    expect(visibleStructureFindings([f], { line: 4, column: f.column - 1 })).toEqual([f]);
    expect(visibleStructureFindings([f], { line: 4, column: f.endColumn + 1 })).toEqual([f]);
    expect(visibleStructureFindings([f], { line: 3, column: f.column })).toEqual([f]);
  });
});

describe('shared analysis', () => {
  it('checkLatexStructure gives the same result with precomputed lines', () => {
    const src = root('\\textbf{open\n\n');
    expect(checkLatexStructure(src, analyze(src))).toEqual(checkLatexStructure(src));
  });
});

describe('templates', () => {
  // Every bundled template compiles; none may get an image mark. Each folder
  // under templates/ is a project.
  const base = path.join(__dirname, '..', 'templates');
  const cases: Array<[string, string, string[]]> = [];
  for (const dir of fs.readdirSync(base, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const projectDir = path.join(base, dir.name);
    const projectFiles = listProjectFilePaths(projectDir);
    for (const f of projectFiles.filter((p) => p.endsWith('.tex'))) cases.push([`${dir.name}/${f}`, path.join(projectDir, f), projectFiles]);
  }
  it.each(cases)('%s has no image marks', (_name, file, projectFiles) => {
    expect(checkImagePaths(analyze(fs.readFileSync(file, 'utf8')), imageFileList(projectFiles), [])).toEqual([]);
  });
});
