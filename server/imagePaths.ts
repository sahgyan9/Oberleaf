// Does an \includegraphics path name a file the compile can load? One answer
// for the live editor mark, the image picker, the compile error card and the
// missing-files list, so they cannot disagree.
//
// Pure: no fs or path. The client imports this file the same way latexLint.ts
// imports texKnowledge.ts. Spec: docs/designs/missing-image-check.md.

import { editDistance } from './texKnowledge.js';

/** What pdfLaTeX's graphicx tries, in order, for a name without a known extension */
export const GRAPHICS_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.eps', '.jbig2', '.mps'];

/** Image formats people drop into a project that pdfLaTeX cannot read */
export const UNLOADABLE_IMAGE_EXTENSIONS = ['.svg', '.gif', '.webp', '.heic', '.heif', '.bmp', '.tif', '.tiff'];

export type ImagePathResult =
  /** `path` is project-relative, original case */
  | { status: 'found'; path: string }
  /** The name cannot be checked without running TeX (macro, #1, ../, quoted) */
  | { status: 'skip' }
  /** The file is there, in a format pdfLaTeX cannot read */
  | { status: 'unloadable'; path: string }
  /** `suggestion` is project-relative, original case, and always compiles */
  | { status: 'missing'; suggestion?: string };

export interface ImageFileList {
  paths: string[];
  lower: string[];
  /** False when the compile leaves the file's top folder off TEXINPUTS */
  searchable: boolean[];
}

// compiler.ts builds TEXINPUTS from the project root plus every top-level
// folder except these, each searched recursively.
function isSearchable(lowerPath: string): boolean {
  const slash = lowerPath.indexOf('/');
  if (slash < 0) return true;
  const top = lowerPath.slice(0, slash);
  return !(top.startsWith('.') || top === 'node_modules' || top === 'dist');
}

/** Build once per file-list change: project-relative paths, forward slashes. */
export function imageFileList(relativePaths: string[]): ImageFileList {
  const paths = relativePaths.map((p) => p.replace(/\\/g, '/'));
  const lower = paths.map((p) => p.toLowerCase());
  return { paths, lower, searchable: lower.map(isSearchable) };
}

function extensionOf(name: string): string {
  const slash = name.lastIndexOf('/');
  const dot = name.lastIndexOf('.');
  return dot > slash + 1 ? name.slice(dot).toLowerCase() : '';
}

const isLoadable = (ext: string) => GRAPHICS_EXTENSIONS.includes(ext);
const isUnloadable = (ext: string) => UNLOADABLE_IMAGE_EXTENSIONS.includes(ext);

/**
 * The name as TeX would look it up, or null when it cannot be checked
 * statically. Strips "./"; rejects macros, arguments, brace groups, quotes,
 * "../" and absolute paths.
 */
export function normalizeImageName(raw: string): string | null {
  let name = raw.trim();
  if (!name || /[\\#<>{}"]/.test(name)) return null;
  while (name.startsWith('./')) name = name.slice(2);
  if (!name || name.startsWith('..') || name.startsWith('/') || /^[A-Za-z]:/.test(name)) return null;
  return name;
}

/** Index of the project file TeX would load for this exact candidate, or -1. */
function lookup(files: ImageFileList, candidate: string): number {
  const c = candidate.toLowerCase();
  const exact = files.lower.indexOf(c);
  if (exact >= 0) return exact;
  const tail = '/' + c;
  for (let i = 0; i < files.lower.length; i++) {
    if (files.searchable[i] && files.lower[i].endsWith(tail)) return i;
  }
  return -1;
}

function lookupAny(files: ImageFileList, prefixes: string[], name: string, extensions: string[]): number {
  for (const prefix of prefixes) {
    for (const ext of extensions) {
      const i = lookup(files, prefix + name + ext);
      if (i >= 0) return i;
    }
  }
  return -1;
}

const baseOf = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const stemOf = (base: string) => {
  const ext = extensionOf(base);
  return isLoadable(ext) || isUnloadable(ext) ? base.slice(0, -ext.length) : base;
};

/**
 * The one loadable project file the user most likely meant, or undefined.
 * `sameStemOnly` skips the near-miss step: used when the file exists in a
 * format pdfLaTeX cannot read, so only a convertible twin (plot.pdf next to
 * plot.svg) is a better answer than saying so.
 */
function suggest(files: ImageFileList, name: string, sameStemOnly = false): string | undefined {
  const writtenExt = extensionOf(name);
  const hasExt = isLoadable(writtenExt) || isUnloadable(writtenExt);
  const base = baseOf(name).toLowerCase();
  const stem = stemOf(base);

  const candidates: { path: string; base: string; stem: string }[] = [];
  files.paths.forEach((p, i) => {
    if (!isLoadable(extensionOf(files.lower[i]))) return;
    const b = baseOf(files.lower[i]);
    candidates.push({ path: p, base: b, stem: stemOf(b) });
  });

  const steps: Array<(c: { base: string; stem: string }) => boolean> = [
    // 1. Same file name in another folder.
    (c) => (hasExt ? c.base === base : c.stem === stem),
    // 2. Same stem, other extension.
    (c) => c.stem === stem,
    // 3. A near-miss stem.
    (c) => editDistance(stem, c.stem) <= (stem.length <= 4 ? 1 : 2),
  ];
  for (const step of sameStemOnly ? steps.slice(0, 2) : steps) {
    const hits = candidates.filter(step);
    if (hits.length === 1) return hits[0].path;
    if (hits.length > 1) return undefined;
  }
  return undefined;
}

export function checkImagePath(rawName: string, files: ImageFileList, graphicsPaths: string[] = []): ImagePathResult {
  const name = normalizeImageName(rawName);
  if (name === null) return { status: 'skip' };

  const prefixes = [''];
  for (const entry of graphicsPaths) {
    let p = entry.trim();
    while (p.startsWith('./')) p = p.slice(2);
    // A folder outside the project may hold the file.
    if (p.startsWith('..') || p.startsWith('/') || /^[A-Za-z]:/.test(p) || /[\\#]/.test(p)) return { status: 'skip' };
    if (!prefixes.includes(p)) prefixes.push(p);
  }

  const ext = extensionOf(name);
  // graphicx uses a known extension as written; otherwise it tries each one.
  const tries = isLoadable(ext) ? [''] : ['', ...GRAPHICS_EXTENSIONS];
  if (!isUnloadable(ext)) {
    const hit = lookupAny(files, prefixes, name, tries);
    if (hit >= 0) return { status: 'found', path: files.paths[hit] };
  }

  const stemName = isLoadable(ext) || isUnloadable(ext) ? name.slice(0, -ext.length) : name;
  const unloadable = lookupAny(files, prefixes, stemName, UNLOADABLE_IMAGE_EXTENSIONS);
  const suggestion = suggest(files, name, unloadable >= 0);
  if (suggestion) return { status: 'missing', suggestion };
  if (unloadable >= 0) return { status: 'unloadable', path: files.paths[unloadable] };
  return { status: 'missing' };
}

/** Index just past the brace or bracket group that opens at `open`, or -1 if it does not close. */
function closeGroup(text: string, open: number): number {
  const closer = text[open] === '[' ? ']' : '}';
  let depth = 0;
  let braces = 0;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (closer === ']') {
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === ']' && braces === 0) return i + 1;
    } else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return i + 1;
  }
  return -1;
}

export interface IncludegraphicsCall {
  /** 0-based index of the "{" that opens the path argument */
  argOpen: number;
  /** 0-based index of its "}" */
  argClose: number;
  /** Raw text between the braces */
  name: string;
}

/**
 * Every \includegraphics on one line whose path argument closes on that line.
 * `masked` has comments and verbatim blanked and the same length as `raw`;
 * names are read from `raw`.
 */
export function findIncludegraphics(masked: string, raw: string = masked): IncludegraphicsCall[] {
  const calls: IncludegraphicsCall[] = [];
  const re = /\\includegraphics(?![A-Za-z@])\*?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked)) !== null) {
    let i = m.index + m[0].length;
    while (masked[i] === ' ' || masked[i] === '\t') i++;
    // Up to two optional arguments: [<options>] or the old [llx,lly][urx,ury].
    for (let k = 0; k < 2 && masked[i] === '['; k++) {
      const end = closeGroup(masked, i);
      if (end < 0) break;
      i = end;
      while (masked[i] === ' ' || masked[i] === '\t') i++;
    }
    if (masked[i] !== '{') continue;
    const end = closeGroup(masked, i);
    if (end < 0) continue;
    calls.push({ argOpen: i, argClose: end - 1, name: raw.slice(i + 1, end - 1) });
    re.lastIndex = end;
  }
  return calls;
}

/**
 * Entries of the last \graphicspath, or null when there is none. `maskedLines`
 * must have comments and verbatim blanked, so a commented-out declaration is
 * ignored. A declaration may span lines.
 */
export function graphicsPathsIn(maskedLines: string[]): string[] | null {
  const text = maskedLines.join('\n');
  let result: string[] | null = null;
  const re = /\\graphicspath(?![A-Za-z@])\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const open = m.index + m[0].length - 1;
    const end = closeGroup(text, open);
    if (end < 0) continue;
    const inner = text.slice(open + 1, end - 1);
    result = [...inner.matchAll(/\{([^{}]*)\}/g)].map((g) => g[1].trim());
    re.lastIndex = end;
  }
  return result;
}
