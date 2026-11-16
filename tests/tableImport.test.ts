import { describe, expect, it } from 'vitest';
import { buildLatexTable, detectAlignment, escapeCell, isNumericCell, parseTableText } from '../src/utils/tableImport.js';

describe('parseTableText', () => {
  it('reads cells copied from a spreadsheet (tabs)', () => {
    const t = parseTableText('Sample\tValue\tError\r\nA\t1.23\t0.04\r\nB\t2.34\t0.05\r\n');
    expect(t.format).toBe('tsv');
    expect(t.columns).toBe(3);
    expect(t.rows).toEqual([
      ['Sample', 'Value', 'Error'],
      ['A', '1.23', '0.04'],
      ['B', '2.34', '0.05'],
    ]);
  });

  it('reads CSV with quoted commas and doubled quotes', () => {
    const t = parseTableText('name,note\n"Smith, J.","said ""hi"""\nLee,ok');
    expect(t.format).toBe('csv');
    expect(t.rows[1]).toEqual(['Smith, J.', 'said "hi"']);
  });

  it('reads a Markdown table and drops its separator row', () => {
    const t = parseTableText('| Method | Accuracy |\n|:-------|---------:|\n| Ours   | 94.7     |');
    expect(t.format).toBe('markdown');
    expect(t.rows).toEqual([
      ['Method', 'Accuracy'],
      ['Ours', '94.7'],
    ]);
  });

  it('reads semicolon CSV and pads ragged rows', () => {
    expect(parseTableText('a;b;c\n1;2;3').rows[1]).toEqual(['1', '2', '3']);
    expect(parseTableText('a\tb\tc\n1\t2').rows[1]).toEqual(['1', '2', '']);
  });

  it('does not mistake a sentence with commas for CSV', () => {
    const t = parseTableText('First, we measure.\nThen we stop.');
    expect(t.columns).toBe(1);
  });

  it('returns an empty table for blank input', () => {
    expect(parseTableText('  \n ')).toEqual({ format: 'empty', rows: [], columns: 0 });
  });
});

describe('alignment and escaping', () => {
  it('recognises numbers the way they appear in results tables', () => {
    for (const n of ['1.23', '-4', '1,234.5', '12%', '3.2e-5', '9.80 ± 0.05', '−0.5']) expect(isNumericCell(n), n).toBe(true);
    for (const n of ['A', 'n/a', '', 'Sample 2', '-']) expect(isNumericCell(n), n).toBe(false);
  });

  it('right-aligns numeric columns only', () => {
    const rows = [
      ['Sample', 'Value'],
      ['A', '1.2'],
      ['B', '3.4'],
    ];
    expect(detectAlignment(rows, true)).toEqual(['l', 'r']);
  });

  it('escapes LaTeX special characters but leaves existing LaTeX alone', () => {
    expect(escapeCell('R&D 50% #1 a_b')).toBe('R\\&D 50\\% \\#1 a\\_b');
    expect(escapeCell('$T_c$ (K)')).toBe('$T_c$ (K)');
    expect(escapeCell('\\textbf{x}')).toBe('\\textbf{x}');
    expect(escapeCell('9.8 ± 0.1')).toBe('9.8 $\\pm$ 0.1');
  });
});

describe('buildLatexTable', () => {
  const rows = [
    ['Sample', 'Value'],
    ['A & B Ltd', '1.2'],
  ];

  it('writes a booktabs table with aligned source columns', () => {
    const tex = buildLatexTable(rows, { hasHeader: true, style: 'booktabs', caption: 'Results', label: 'tab:results' });
    expect(tex).toBe(
      [
        '\\begin{table}[htbp]',
        '  \\centering',
        '  \\caption{Results}',
        '  \\label{tab:results}',
        '  \\begin{tabular}{lr}',
        '    \\toprule',
        '    Sample     & Value \\\\',
        '    \\midrule',
        '    A \\& B Ltd & 1.2 \\\\',
        '    \\bottomrule',
        '  \\end{tabular}',
        '\\end{table}',
        '',
      ].join('\n')
    );
  });

  it('writes a grid table without booktabs commands', () => {
    const tex = buildLatexTable(rows, { hasHeader: true, style: 'grid', caption: '', label: '' });
    expect(tex).toContain('\\begin{tabular}{|l|r|}');
    expect(tex).toContain('\\textbf{Sample}');
    expect(tex).not.toContain('\\toprule');
    expect(tex).not.toContain('\\caption');
  });
});
