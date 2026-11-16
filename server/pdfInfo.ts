import fs from 'fs';
import path from 'path';

/**
 * Page count of the last PDF TeX wrote, read from its log:
 *   Output written on main.pdf (12 pages, 345678 bytes).
 * TeX wraps log lines at 79 characters, so the line can break anywhere,
 * including inside "pages". Returns 0 for "No pages of output." and null
 * when the log says neither.
 */
export function parsePageCountFromLog(log: string): number | null {
  const written = log.lastIndexOf('Output written on');
  const empty = log.lastIndexOf('No pages of output');
  if (written < 0 && empty < 0) return null;
  if (empty > written) return 0;
  const joined = log.slice(written, written + 1200).replace(/\r?\n/g, '');
  const match = /\((\d+)\s*pages?\b/.exec(joined);
  return match ? Number(match[1]) : null;
}

/** Reads the build log for `mainBase` (the main file's name without .tex). */
export function getPdfPageCount(projectDir: string, mainBase: string): number | null {
  const candidates = [
    path.join(projectDir, '.build', `${mainBase}.log`),
    path.join(projectDir, `${mainBase}.log`),
  ];
  for (const logPath of candidates) {
    try {
      const log = fs.readFileSync(logPath, 'latin1');
      const pages = parsePageCountFromLog(log);
      if (pages !== null) return pages;
    } catch {
      // Not there; try the next one.
    }
  }
  return null;
}
