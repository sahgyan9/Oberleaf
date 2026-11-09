import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseLatexLog, parseBibtexLog } from '../server/compiler.js';
import { chooseMainFile, readZip, safeEntryPath, unwrapSingleFolder, ZipImportError } from '../server/zipImport.js';
import { executableLines, findMissingProjectFiles } from '../server/projectFiles.js';
import { spawnSync } from 'child_process';

// A journal template copied from Overleaf as main.tex alone: the class file,
// .bst and .bib that sat beside it are missing. Springer Nature's template
// lists every \documentclass variant as a comment above the live one.
const SPRINGER_PREAMBLE = [
  '%Version 3.1 December 2024',
  '%%\\documentclass[referee,sn-basic]{sn-jnl}% referee option',
  '',
  '%%\\documentclass[pdflatex,sn-nature]{sn-jnl}% Nature Portfolio',
  '\\documentclass[pdflatex,sn-mathphys-num]{sn-jnl}% Math and Physical Sciences',
  '%%\\documentclass[pdflatex,sn-aps]{sn-jnl}% APS',
  '',
  '\\usepackage{graphicx}%',
  '%\\usepackage{nosuchpkg}',
  '\\usepackage{nosuchpkg}',
  '\\begin{document}',
  'Text \\cite{bib1}.',
  '%\\bibliography{old}',
  '\\bibliography{sn-bibliography}% common bib file',
  '\\end{document}',
];

const MISSING_CLASS_LOG = [
  '(C:/Users/x/Oberleaf Projects/paper/main.tex',
  'LaTeX2e <2025-11-01>',
  '',
  "! LaTeX Error: File `sn-jnl.cls' not found.",
  '',
  'Type X to quit or <RETURN> to proceed,',
  'or enter new name. (Default extension: cls)',
  '',
  'Enter file name: ',
  'C:/Users/x/Oberleaf Projects/paper/main.tex:40: Emergency stop.',
  '<read *> ',
  '         ',
  'l.40 ^^M',
].join('\n');

describe('a journal template copied without its files', () => {
  it('points the missing class at the live \\documentclass, not a commented-out one', () => {
    const { errors } = parseLatexLog(MISSING_CLASS_LOG, SPRINGER_PREAMBLE);
    const err = errors.find((e) => /sn-jnl\.cls' not found/.test(e.message));
    expect(err).toBeDefined();
    expect(err!.line).toBe(5);
  });

  it('says the class ships with the template instead of sending the user to CTAN', () => {
    const { errors } = parseLatexLog(MISSING_CLASS_LOG, SPRINGER_PREAMBLE);
    const err = errors.find((e) => /sn-jnl\.cls' not found/.test(e.message))!;
    expect(err.friendlyExplanation).toMatch(/not in this project or in your TeX installation/);
    expect(err.friendlyExplanation).toMatch(/Copy sn-jnl\.cls into this project/);
    expect(err.friendlyExplanation).toMatch(/\.zip/);
  });

  it('marks the emergency stop that follows as a cascade of the class line', () => {
    const { errors } = parseLatexLog(MISSING_CLASS_LOG, SPRINGER_PREAMBLE);
    const stop = errors.find((e) => /Emergency stop/.test(e.message));
    expect(stop?.isCascading).toBe(true);
    expect(stop?.cascadingFromLine).toBe(5);
  });

  it('points a missing package at the live \\usepackage, not a commented-out one', () => {
    const log = "! LaTeX Error: File `nosuchpkg.sty' not found.\n\nType X to quit or <RETURN> to proceed,\n\nl.11 \\begin";
    const { errors } = parseLatexLog(log, SPRINGER_PREAMBLE);
    expect(errors[0].line).toBe(10);
  });

  it('points BibTeX errors about main.aux at the live \\bibliography line', () => {
    const blg = "I couldn't open database file sn-bibliography.bib---line 3 of file main.aux";
    const [err] = parseBibtexLog(blg, SPRINGER_PREAMBLE);
    expect(err.line).toBe(14);
    expect(err.friendlyExplanation).toMatch(/copied too/);
  });

  it('explains a missing template .bst without claiming it does not exist', () => {
    const blg = "I couldn't open style file sn-mathphys-num.bst---line 2 of file main.aux";
    const [err] = parseBibtexLog(blg, SPRINGER_PREAMBLE);
    expect(err.friendlyExplanation).toMatch(/not in this project or in your TeX installation/);
    expect(err.friendlyExplanation).toMatch(/journal template/);
  });
});

// ─── Zip import ─────────────────────────────────────────────────────────────

type ZipInput = { name: string; data: string | Buffer; deflate?: boolean; unixMode?: number };

// Writes a standard zip the way Overleaf and most tools do: a local header
// per entry, then the central directory and the end record.
function makeZip(files: ZipInput[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const data = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const body = f.deflate ? zlib.deflateRawSync(data) : data;
    const name = Buffer.from(f.name, 'utf8');
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt16LE(f.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt16LE(f.deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(((f.unixMode ?? 0o100644) << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const ARTICLE = '%%\\documentclass{sn-jnl}\n\\documentclass[pdflatex]{sn-jnl}\n\\begin{document}x\\end{document}\n';

describe('readZip', () => {
  it('reads stored and deflated entries and skips folders, symlinks and OS metadata', () => {
    const zip = makeZip([
      { name: 'sn-article.tex', data: ARTICLE, deflate: true },
      { name: 'sn-jnl.cls', data: '\\ProvidesClass{sn-jnl}'.repeat(50), deflate: true },
      { name: 'figures/', data: '' },
      { name: 'figures/plot.png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]) },
      { name: '__MACOSX/._sn-article.tex', data: 'junk' },
      { name: 'link.tex', data: '/etc/passwd', unixMode: 0o120777 },
    ]);
    const entries = readZip(zip);
    expect(entries.map((e) => e.path)).toEqual(['sn-article.tex', 'sn-jnl.cls', 'figures/plot.png']);
    expect(entries[1].data.toString()).toBe('\\ProvidesClass{sn-jnl}'.repeat(50));
  });

  it('refuses paths that leave the project', () => {
    expect(() => safeEntryPath('../evil.tex')).toThrow(ZipImportError);
    expect(() => safeEntryPath('a/../../evil.tex')).toThrow(ZipImportError);
    expect(() => safeEntryPath('/etc/evil')).toThrow(ZipImportError);
    expect(() => safeEntryPath('C:\\Windows\\evil.dll')).toThrow(ZipImportError);
    expect(() => readZip(makeZip([{ name: '..\\evil.tex', data: 'x' }]))).toThrow(/outside the project/);
  });

  it('rejects a file that is not a zip and an entry whose checksum is wrong', () => {
    expect(() => readZip(Buffer.from('not a zip at all'))).toThrow(/not a \.zip/);
    const zip = makeZip([{ name: 'main.tex', data: 'hello' }]);
    zip[30 + 'main.tex'.length] ^= 0xff; // corrupt the first data byte
    expect(() => readZip(zip)).toThrow(/checksum/);
  });
});

describe('choosing the document to compile', () => {
  const entry = (p: string, text: string) => ({ path: p, data: Buffer.from(text) });

  it('renames the only root document to main.tex', () => {
    const { entries, renamedFrom } = chooseMainFile([entry('sn-article.tex', ARTICLE), entry('sn-jnl.cls', '')]);
    expect(renamedFrom).toBe('sn-article.tex');
    expect(entries.map((e) => e.path)).toEqual(['main.tex', 'sn-jnl.cls']);
  });

  it('keeps main.tex when it is the document, even beside chapter files', () => {
    const result = chooseMainFile([entry('main.tex', ARTICLE), entry('intro.tex', '\\section{Intro}')]);
    expect(result.renamedFrom).toBeUndefined();
  });

  it('ignores a \\documentclass that is only a comment', () => {
    expect(() => chooseMainFile([entry('notes.tex', '% \\documentclass{article}\n')])).toThrow(/no top-level \.tex file/);
  });

  it('asks the user to pick when there are several documents', () => {
    expect(() => chooseMainFile([entry('a.tex', ARTICLE), entry('b.tex', ARTICLE)])).toThrow(/several documents \(a\.tex, b\.tex\)/);
  });

  it('unwraps a zip whose files all sit in one folder', () => {
    const out = unwrapSingleFolder([entry('paper/main.tex', ARTICLE), entry('paper/fig/a.png', '')]);
    expect(out.map((e) => e.path)).toEqual(['main.tex', 'fig/a.png']);
    const flat = unwrapSingleFolder([entry('main.tex', ARTICLE), entry('fig/a.png', '')]);
    expect(flat.map((e) => e.path)).toEqual(['main.tex', 'fig/a.png']);
  });
});

describe('importProjectFromZip', () => {
  let root: string;
  let previous: string | undefined;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-import-'));
    previous = process.env.OBERLEAF_PROJECTS_DIR;
    process.env.OBERLEAF_PROJECTS_DIR = root;
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.OBERLEAF_PROJECTS_DIR;
    else process.env.OBERLEAF_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('writes every template file into a new project with main.tex at the root', async () => {
    const { importProjectFromZip } = await import('../server/projects.js');
    const zip = makeZip([
      { name: 'sn-article.tex', data: ARTICLE, deflate: true },
      { name: 'sn-jnl.cls', data: '% class', deflate: true },
      { name: 'sn-mathphys-num.bst', data: '% bst' },
      { name: 'sn-bibliography.bib', data: '@article{bib1, title={T}}' },
    ]);
    const project = importProjectFromZip('MLG Ansari', zip);
    expect(project.mainRenamedFrom).toBe('sn-article.tex');
    expect(project.fileCount).toBe(4);
    for (const f of ['main.tex', 'sn-jnl.cls', 'sn-mathphys-num.bst', 'sn-bibliography.bib', '.meta.json']) {
      expect(fs.existsSync(path.join(project.path, f)), f).toBe(true);
    }
    expect(path.dirname(project.path)).toBe(path.resolve(root));
  });

  it('leaves nothing behind when the zip is rejected', async () => {
    const { importProjectFromZip } = await import('../server/projects.js');
    expect(() => importProjectFromZip('Bad', makeZip([{ name: 'readme.txt', data: 'x' }]))).toThrow(ZipImportError);
    expect(fs.readdirSync(root)).toEqual([]);
  });
});

// ─── Files a pasted document needs from its original project ────────────────

describe('executableLines', () => {
  it('drops comments, \verb arguments and verbatim blocks', () => {
    const lines = [
      String.raw`\includegraphics{a.png} % \includegraphics{b.png}`,
      String.raw`Use \verb+\begin{verbatim}+ to quote code.`,
      String.raw`\begin{verbatim}`,
      String.raw`\includegraphics{<eps-file>}`,
      String.raw`\end{verbatim}`,
      String.raw`\begin{lstlisting}\input{x}\end{lstlisting}\input{y}`,
    ];
    const text = executableLines(lines).map((l) => l.text).join('\n');
    expect(text).toContain('a.png');
    expect(text).not.toContain('b.png');
    expect(text).not.toContain('<eps-file>');
    expect(text).not.toContain('{x}');
    expect(text).toContain('\input{y}');
  });
});

describe('findMissingProjectFiles', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-missing-'));
    fs.mkdirSync(path.join(dir, 'figures'));
    fs.mkdirSync(path.join(dir, 'img'));
    fs.mkdirSync(path.join(dir, 'chapters'));
    fs.writeFileSync(path.join(dir, 'figures', 'plot.png'), '');
    fs.writeFileSync(path.join(dir, 'img', 'scheme.pdf'), '');
    fs.writeFileSync(path.join(dir, 'chapters', 'intro.tex'), '');
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const source = [
    String.raw`\documentclass[pdflatex,sn-mathphys-num]{sn-jnl}`,
    String.raw`\graphicspath{{img/}}`,
    String.raw`\begin{document}`,
    String.raw`\input{chapters/intro}`,
    String.raw`\includegraphics[width=3cm]{plot}`,
    String.raw`\includegraphics{scheme}`,
    String.raw`\includegraphics{fig.eps}`,
    String.raw`\includegraphics{\figdir/auto}`,
    String.raw`%\includegraphics{commented.png}`,
    String.raw`\bibliography{sn-bibliography}`,
    String.raw`\end{document}`,
  ];
  const errors = [
    { message: "LaTeX Error: File `sn-jnl.cls' not found.", line: 1 },
    { message: 'Emergency stop.', line: 12 },
    { message: "I couldn't open database file sn-bibliography.bib", line: 10 },
  ];

  it('lists every missing file once, in source order, from the log and the source', async () => {
    const missing = await findMissingProjectFiles(source, dir, errors);
    expect(missing).toEqual([
      { file: 'sn-jnl.cls', kind: 'class', line: 1 },
      { file: 'fig.eps', kind: 'figure', line: 7 },
      { file: 'sn-bibliography.bib', kind: 'bibliography', line: 10 },
    ]);
  });

  it('finds figures in subfolders and \graphicspath, the way the compile does', async () => {
    const missing = await findMissingProjectFiles(source, dir, []);
    expect(missing.map((m) => m.file)).toEqual(['fig.eps']);
  });

  const hasKpsewhich = spawnSync('kpsewhich', ['--version']).status === 0;
  it.runIf(hasKpsewhich)('reports an \input that neither the project nor TeX provides, and not one TeX provides', async () => {
    const lines = [String.raw`\input{glyphtounicode}`, String.raw`\input{sections/method}`];
    const missing = await findMissingProjectFiles(lines, dir, []);
    expect(missing).toEqual([{ file: 'sections/method.tex', kind: 'input', line: 2 }]);
  });
});
