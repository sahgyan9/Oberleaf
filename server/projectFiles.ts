import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';

// A .tex file pasted in from Overleaf arrives without the files that sat next
// to it: the journal class and .bst, the .bib, the figures, \input chapters.
// TeX stops at the first one it misses, so fixing them one compile at a time
// means a round trip per file. This lists them all at once.
//
// Everything listed is backed by evidence, never guessed: the compile log
// (a class or package TeX could not load, with MiKTeX's on-the-fly install
// already tried), BibTeX's report, or a file the source names that exists
// neither in the project nor in the TeX installation.

export type MissingFileKind = 'class' | 'package' | 'bibliography' | 'bibstyle' | 'figure' | 'input';

export interface MissingProjectFile {
  file: string;
  kind: MissingFileKind;
  /** Line in main.tex that refers to it (0 when unknown) */
  line: number;
}

// What pdfLaTeX's graphicx tries, in order, for a name without extension;
// .eps is converted on the fly by epstopdf.
const GRAPHICS_EXTENSIONS = ['', '.pdf', '.png', '.jpg', '.jpeg', '.eps', '.jbig2', '.mps'];

// Environments whose content is printed, not executed: the Springer Nature
// template shows \includegraphics{<eps-file>} inside verbatim as an example.
const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*']);

/** Source lines with comments, \verb arguments and verbatim blocks removed. */
export function executableLines(sourceLines: string[]): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  let inVerbatim: string | undefined;
  sourceLines.forEach((raw, idx) => {
    let rest = raw.replace(/\\verb\*?(\S)(.*?)\1/g, '');
    let kept = '';
    // A line can close a block, open another and carry code in between.
    while (rest) {
      if (inVerbatim) {
        const endTag = `\\end{${inVerbatim}}`;
        const end = rest.indexOf(endTag);
        if (end < 0) break;
        rest = rest.slice(end + endTag.length);
        inVerbatim = undefined;
        continue;
      }
      const code = rest.replace(/(^|[^\\])%.*$/, '$1');
      const begin = [...code.matchAll(/\\begin\{([A-Za-z*]+)\}/g)].find((m) => VERBATIM_ENVS.has(m[1]));
      if (!begin) {
        kept += code;
        break;
      }
      kept += code.slice(0, begin.index);
      inVerbatim = begin[1];
      rest = rest.slice((begin.index ?? 0) + begin[0].length);
    }
    out.push({ text: kept, line: idx + 1 });
  });
  return out;
}

/** Every file in the project as a lowercase forward-slash relative path. */
function projectFileSet(projectDir: string): Set<string> {
  const files = new Set<string>();
  const walk = (dir: string, depth: number) => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (depth < 6 && !e.name.startsWith('.') && e.name !== 'node_modules') walk(path.join(dir, e.name), depth + 1);
      } else {
        files.add(path.relative(projectDir, path.join(dir, e.name)).replace(/\\/g, '/').toLowerCase());
      }
    }
  };
  walk(projectDir, 0);
  return files;
}

// The compile puts the project root and every subfolder on TEXINPUTS, so
// "fig.eps" resolves from figures/fig.eps too. Mirror that: exact relative
// path, or the same path under any folder.
function existsInProject(files: Set<string>, candidate: string): boolean {
  const c = candidate.replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  if (files.has(c)) return true;
  for (const f of files) if (f.endsWith('/' + c)) return true;
  return false;
}

// Asks the TeX installation which of these names it can supply. Resolves to
// undefined when kpsewhich is unavailable, so nothing gets reported on a guess.
function kpsewhich(names: string[]): Promise<Set<string> | undefined> {
  if (names.length === 0) return Promise.resolve(new Set());
  return new Promise((resolve) => {
    execFile('kpsewhich', names, { timeout: 8000, windowsHide: true }, (error: any, stdout) => {
      // Exit code 1 only means some names were not found; stdout still lists the rest.
      if (error && (error.code === 'ENOENT' || error.killed)) return resolve(undefined);
      resolve(new Set(String(stdout).split(/\r?\n/).filter(Boolean).map((p) => path.basename(p).toLowerCase())));
    });
  });
}

const LOG_EVIDENCE: Array<{ pattern: RegExp; kind: (file: string) => MissingFileKind }> = [
  { pattern: /^LaTeX Error: File [`']([^'`]+\.(?:cls|sty))' not found/, kind: (f) => (f.endsWith('.cls') ? 'class' : 'package') },
  { pattern: /couldn't open database file (.+)$/, kind: () => 'bibliography' },
  { pattern: /couldn't open style file (.+)$/, kind: () => 'bibstyle' },
];

export async function findMissingProjectFiles(
  sourceLines: string[],
  projectDir: string,
  errors: Array<{ message: string; line: number }>
): Promise<MissingProjectFile[]> {
  const found: MissingProjectFile[] = [];
  const seen = new Set<string>();
  const add = (file: string, kind: MissingFileKind, line: number) => {
    const key = path.basename(file).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({ file, kind, line });
  };

  for (const err of errors) {
    for (const { pattern, kind } of LOG_EVIDENCE) {
      const m = err.message.trim().match(pattern);
      if (m) add(m[1].trim(), kind(m[1].trim()), err.line);
    }
  }

  const files = projectFileSet(projectDir);
  const code = executableLines(sourceLines);

  // \graphicspath{{figures/}{img/}} adds prefixes graphicx tries in order.
  const graphicsPaths = [''];
  for (const { text } of code) {
    const gp = text.match(/\\graphicspath\s*\{((?:\s*\{[^}]*\})+)\s*\}/);
    if (gp) for (const d of gp[1].matchAll(/\{([^}]*)\}/g)) graphicsPaths.push(d[1].trim());
  }

  const unresolvedInputs: Array<{ name: string; line: number }> = [];
  for (const { text, line } of code) {
    for (const m of text.matchAll(/\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
      const name = m[1].trim();
      // A macro or argument (\figdir/plot, #1) cannot be resolved statically.
      if (!name || /[\\#<>]/.test(name)) continue;
      const hit = graphicsPaths.some((prefix) => GRAPHICS_EXTENSIONS.some((ext) => existsInProject(files, prefix + name + ext)));
      if (!hit) add(name, 'figure', line);
    }
    for (const m of text.matchAll(/\\(?:input|include|subfile)\s*\{([^}]+)\}/g)) {
      const name = m[1].trim();
      if (!name || /[\\#]/.test(name)) continue;
      const withExt = path.extname(name) ? name : `${name}.tex`;
      if (existsInProject(files, name) || existsInProject(files, withExt)) continue;
      unresolvedInputs.push({ name: withExt, line });
    }
  }

  // \input{glyphtounicode} and similar come from the TeX installation.
  if (unresolvedInputs.length > 0) {
    const fromTeX = await kpsewhich([...new Set(unresolvedInputs.map((u) => u.name))]);
    if (fromTeX) {
      for (const u of unresolvedInputs) {
        if (!fromTeX.has(path.basename(u.name).toLowerCase())) add(u.name, 'input', u.line);
      }
    }
  }

  return found.sort((a, b) => (a.line || Infinity) - (b.line || Infinity));
}
