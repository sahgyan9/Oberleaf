// Turns cells copied from a spreadsheet (tab-separated), a CSV file or a
// Markdown table into a LaTeX table. Typing a table cell by cell, with an
// ampersand between every pair and a double backslash at every row end, is
// one of the first things that puts people off LaTeX.

export type TableFormat = 'tsv' | 'csv' | 'markdown' | 'empty';
export type ColumnAlign = 'l' | 'c' | 'r';

export interface ParsedTable {
  format: TableFormat;
  rows: string[][];
  columns: number;
}

export interface TableOptions {
  hasHeader: boolean;
  /** booktabs rules (\toprule...) or a full grid of \hline and | */
  style: 'booktabs' | 'grid';
  caption: string;
  label: string;
  /** One per column; when omitted, numeric columns go right and text left */
  align?: ColumnAlign[];
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
      continue;
    }
    if (ch === '"' && cell === '') quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseMarkdown(lines: string[]): string[][] {
  return lines
    .filter((l) => !/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l))
    .map((l) =>
      l
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split(/(?<!\\)\|/)
        .map((c) => c.trim().replace(/\\\|/g, '|'))
    );
}

/** A comma count that is the same on every line means CSV, not prose with commas. */
function looksLikeCsv(lines: string[]): boolean {
  if (lines.length < 2) return lines.length === 1 && (lines[0].match(/,/g) ?? []).length >= 1;
  const counts = lines.map((l) => parseDelimited(l, ',')[0]?.length ?? 0);
  return counts[0] > 1 && counts.every((c) => c === counts[0]);
}

export function parseTableText(raw: string): ParsedTable {
  const text = raw.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  const lines = text.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { format: 'empty', rows: [], columns: 0 };

  let format: TableFormat;
  let rows: string[][];
  if (text.includes('\t')) {
    format = 'tsv';
    rows = parseDelimited(text, '\t');
  } else if (lines.every((l) => l.includes('|')) && lines.some((l) => /^\s*\|/.test(l) || /-{2,}/.test(l))) {
    format = 'markdown';
    rows = parseMarkdown(lines);
  } else if (looksLikeCsv(lines)) {
    format = 'csv';
    rows = parseDelimited(text, ',');
  } else if (lines.every((l) => l.includes(';')) && lines.length > 1) {
    // Excel exports CSV with semicolons in locales that use a decimal comma.
    format = 'csv';
    rows = parseDelimited(text, ';');
  } else {
    // One column, or columns separated by runs of spaces.
    const spaced = lines.map((l) => l.trim().split(/\s{2,}/));
    const sameWidth = spaced.every((r) => r.length === spaced[0].length);
    format = 'tsv';
    rows = sameWidth && spaced[0].length > 1 ? spaced : lines.map((l) => [l.trim()]);
  }

  rows = rows.map((r) => r.map((c) => c.replace(/\s*\n\s*/g, ' ').trim())).filter((r) => r.some((c) => c !== ''));
  const columns = rows.reduce((max, r) => Math.max(max, r.length), 0);
  // Ragged rows (a merged cell, a trailing empty cell Excel dropped) are padded.
  rows = rows.map((r) => (r.length < columns ? [...r, ...Array(columns - r.length).fill('')] : r));
  return { format, rows, columns };
}

const NUMERIC = /^[-+−]?(\d[\d,\s]*)?(\.\d+)?(\s?[eE×x]\s?[-+−]?\d+)?\s?(%|±.*)?$/;

export function isNumericCell(cell: string): boolean {
  const c = cell.trim();
  return c !== '' && /\d/.test(c) && NUMERIC.test(c);
}

/** Right-aligns a column when most of its body cells are numbers. */
export function detectAlignment(rows: string[][], hasHeader: boolean): ColumnAlign[] {
  const body = hasHeader ? rows.slice(1) : rows;
  const columns = rows[0]?.length ?? 0;
  return Array.from({ length: columns }, (_, col) => {
    const cells = body.map((r) => r[col] ?? '').filter((c) => c.trim() !== '');
    if (cells.length === 0) return 'l';
    const numeric = cells.filter(isNumericCell).length;
    return numeric / cells.length >= 0.6 ? 'r' : 'l';
  });
}

/**
 * Escapes the characters that mean something to LaTeX. A cell that already
 * contains LaTeX (a command, or math in dollar signs) is left as written.
 */
export function escapeCell(cell: string): string {
  if (/\\[a-zA-Z]+|\$[^$]+\$/.test(cell)) return cell;
  return cell
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([&%$#_{}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/−/g, '$-$')
    .replace(/±/g, '$\\pm$')
    .replace(/×/g, '$\\times$')
    .replace(/μ|µ/g, '$\\mu$')
    .replace(/°/g, '$^\\circ$');
}

export function buildLatexTable(rows: string[][], options: TableOptions): string {
  const columns = rows.reduce((max, r) => Math.max(max, r.length), 0);
  if (columns === 0) return '';
  const align = options.align && options.align.length === columns ? options.align : detectAlignment(rows, options.hasHeader);
  const booktabs = options.style === 'booktabs';
  const spec = booktabs ? align.join('') : `|${align.join('|')}|`;

  const cells = rows.map((r) => Array.from({ length: columns }, (_, i) => escapeCell(r[i] ?? '')));
  // Pad every column so the source lines up and stays readable.
  const widths = Array.from({ length: columns }, (_, i) => Math.min(28, Math.max(...cells.map((r) => r[i].length))));
  const line = (r: string[], bold: boolean) =>
    '    ' +
    r
      .map((c, i) => {
        const text = bold && !booktabs && c ? `\\textbf{${c}}` : c;
        return i === columns - 1 ? text : text.padEnd(widths[i]);
      })
      .join(' & ')
      .trimEnd() +
    ' \\\\';

  const out: string[] = ['\\begin{table}[htbp]', '  \\centering'];
  if (options.caption.trim()) out.push(`  \\caption{${options.caption.trim()}}`);
  if (options.label.trim()) out.push(`  \\label{${options.label.trim()}}`);
  out.push(`  \\begin{tabular}{${spec}}`);
  out.push(booktabs ? '    \\toprule' : '    \\hline');
  cells.forEach((r, i) => {
    const isHeader = options.hasHeader && i === 0;
    out.push(line(r, isHeader));
    if (isHeader) out.push(booktabs ? '    \\midrule' : '    \\hline');
    else if (!booktabs) out.push('    \\hline');
  });
  if (booktabs) out.push('    \\bottomrule');
  out.push('  \\end{tabular}', '\\end{table}', '');
  return out.join('\n');
}

/** An empty grid to fill in, for when there is nothing to paste. */
export function emptyGrid(rowCount: number, columnCount: number, hasHeader: boolean): string[][] {
  return Array.from({ length: rowCount }, (_, r) =>
    Array.from({ length: columnCount }, (_, c) => (hasHeader && r === 0 ? `Column ${c + 1}` : ''))
  );
}
