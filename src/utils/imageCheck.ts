// Live editor check: an \includegraphics path that names no file the compile
// can load. Runs with the structure check on the same masked lines, so
// commented-out and verbatim calls are ignored. The answer comes from
// server/imagePaths.ts, the same resolver the compile error card uses.
// Spec: docs/designs/missing-image-check.md.

import { checkImagePath, findIncludegraphics, graphicsPathsIn, type ImageFileList } from '../../server/imagePaths';
import type { LineInfo } from './latexLint';
import type { StructureFinding } from './latexStructure';

const DOCUMENT_CLASS = /\\documentclass(?![A-Za-z@])/;

/**
 * The \graphicspath entries that apply in this file. A file with
 * \documentclass uses its own; a chapter uses its own if it declares one,
 * else the main document's. Null when that is not known yet: then nothing
 * is checked rather than marking paths that may compile.
 */
export function graphicsPathsFor(lines: LineInfo[], mainGraphicsPaths: string[] | null): string[] | null {
  const own = graphicsPathsIn(lines.map((l) => l.code));
  if (own) return own;
  return lines.some((l) => DOCUMENT_CLASS.test(l.code)) ? [] : mainGraphicsPaths;
}

export function checkImagePaths(lines: LineInfo[], files: ImageFileList, mainGraphicsPaths: string[] | null): StructureFinding[] {
  const graphicsPaths = graphicsPathsFor(lines, mainGraphicsPaths);
  if (graphicsPaths === null) return [];
  const findings: StructureFinding[] = [];
  lines.forEach((l, idx) => {
    if (!l.code.includes('\\includegraphics')) return;
    for (const call of findIncludegraphics(l.code, l.raw)) {
      const result = checkImagePath(call.name, files, graphicsPaths);
      if (result.status === 'found' || result.status === 'skip') continue;
      const name = call.name.trim();
      // 1-based columns: the path between the braces, end exclusive.
      const inner = { start: call.argOpen + 2, end: call.argClose + 1 };
      const base = {
        rule: 'missing-image' as const,
        line: idx + 1,
        severity: 'error' as const,
        column: inner.start,
        endColumn: inner.end,
        hideWhileCursorIn: { startColumn: inner.start, endColumn: inner.end },
      };
      if (result.status === 'unloadable') {
        findings.push({ ...base, message: `pdfLaTeX cannot read ${result.path}`, detail: 'Export it as PDF or PNG and upload that.' });
      } else if (result.suggestion) {
        findings.push({
          ...base,
          message: `No file "${name}" in the project`,
          detail: `Did you mean ${result.suggestion}? Click into the path to pick it.`,
          suggestion: result.suggestion,
        });
      } else {
        findings.push({ ...base, message: `No file "${name}" in the project`, detail: 'Upload it or fix the path.' });
      }
    }
  });
  return findings;
}
