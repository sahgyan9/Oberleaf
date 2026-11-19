// Shared shapes for what a compile reports, as the viewer's diagnostics panel
// and the editor gutter show it. The server side is server/logWarnings.ts.

export type CompileWarningKind = 'reference' | 'citation' | 'label' | 'font' | 'badbox' | 'file' | 'other';

export interface CompileWarningItem {
  /** Project-relative path, an installed file's absolute path, or '' when unknown */
  file: string;
  /** 1-based, 0 when the log gives none */
  line: number;
  message: string;
  kind: CompileWarningKind;
}

/**
 * The explanation the server gives an error no rule recognises
 * (GENERIC_EXPLANATION in server/compiler.ts; tests/reporting.test.ts keeps
 * the two equal). Such an error, or a failed compile with no reason, points at
 * Oberleaf rather than the document, so the panel offers a report.
 */
export const UNEXPLAINED_ERROR_TEXT = 'Review the line indicated for syntax errors.';
export const NO_REASON_MESSAGE = 'No PDF was produced.';

/** One mark in the editor gutter */
export interface EditorDiagnostic {
  line: number;
  severity: 'error' | 'warning' | 'info';
  message: string;
  /** Plain-language explanation shown under the message on hover */
  detail?: string;
  /** Text on the line to underline, e.g. the undefined command */
  highlight?: string;
  /** Exact range to underline instead of searching for `highlight`: 1-based columns, end exclusive */
  column?: number;
  endColumn?: number;
  /** A follow-on error that goes away with an earlier one */
  secondary?: boolean;
}

/** What each warning kind means for the PDF, in one sentence. */
export const WARNING_HINTS: Partial<Record<CompileWarningKind, string>> = {
  reference: 'No \\label has this name, so the PDF prints ?? here. Check the spelling against the \\label.',
  citation: 'This key is not in the bibliography, so the PDF prints [?] here. Check the key in the .bib file.',
  label: 'Two \\label commands use this name, and \\ref points to the last one. Rename one of them.',
  font: 'The font has no such style (for example bold small caps), so LaTeX used the nearest one.',
  file: '\\include skips a file it cannot find, so this part is missing from the PDF. Check the file name and folder.',
  badbox:
    'A line is too wide for the text block (overfull) or stretched thin (underfull), usually by a long word, URL or table. Often harmless.',
};

/** Short label for a warning row, e.g. "Undefined reference". */
export const WARNING_KIND_LABEL: Record<CompileWarningKind, string> = {
  reference: 'Undefined reference',
  citation: 'Undefined citation',
  label: 'Duplicate label',
  font: 'Font substituted',
  badbox: 'Layout',
  file: 'Missing file',
  other: 'Warning',
};

/**
 * "Label `fig:a' multiply defined." gives no line. Point it at the second
 * \label with that name in the given text, which is the one to rename.
 */
export function locateDuplicateLabels(warnings: CompileWarningItem[], filePath: string, content: string): CompileWarningItem[] {
  const lines = content.split('\n');
  return warnings.map((w) => {
    if (w.kind !== 'label' || w.line > 0) return w;
    const name = w.message.match(/Label [`']([^']+)' multiply defined/)?.[1];
    if (!name) return w;
    const needle = `\\label{${name}}`;
    const hits = lines.flatMap((l, i) => (l.replace(/(^|[^\\])%.*$/, '$1').includes(needle) ? [i + 1] : []));
    return hits.length >= 2 ? { ...w, file: filePath, line: hits[1] } : w;
  });
}
