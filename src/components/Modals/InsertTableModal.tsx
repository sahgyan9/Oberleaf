import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Table as TableIcon, ClipboardPaste, Grid3x3 } from 'lucide-react';
import { buildLatexTable, detectAlignment, emptyGrid, parseTableText, type ColumnAlign } from '../../utils/tableImport';

interface InsertTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The second argument is a preamble line the snippet needs */
  onInsert: (latexSnippet: string, preambleAddition?: string) => void;
}

const FORMAT_NAMES: Record<string, string> = {
  tsv: 'spreadsheet cells',
  csv: 'CSV',
  markdown: 'a Markdown table',
};

const PREVIEW_ROWS = 8;

export const InsertTableModal: React.FC<InsertTableModalProps> = ({ isOpen, onClose, onInsert }) => {
  const [mode, setMode] = useState<'paste' | 'grid'>('paste');
  const [pasted, setPasted] = useState('');
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [hoverRows, setHoverRows] = useState(3);
  const [hoverCols, setHoverCols] = useState(3);
  const [hasHeader, setHasHeader] = useState(true);
  const [style, setStyle] = useState<'booktabs' | 'grid'>('booktabs');
  const [caption, setCaption] = useState('');
  const [label, setLabel] = useState('');
  // Alignment the user set by clicking a column heading; cleared when the data changes shape.
  const [alignOverride, setAlignOverride] = useState<ColumnAlign[] | null>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && mode === 'paste') pasteRef.current?.focus();
  }, [isOpen, mode]);

  const parsed = useMemo(() => parseTableText(pasted), [pasted]);
  const data = useMemo(
    () => (mode === 'paste' ? parsed.rows : emptyGrid(rows, cols, hasHeader)),
    [mode, parsed, rows, cols, hasHeader]
  );
  const columnCount = data[0]?.length ?? 0;

  useEffect(() => {
    setAlignOverride(null);
  }, [columnCount, mode]);

  const align = useMemo(
    () => (alignOverride && alignOverride.length === columnCount ? alignOverride : detectAlignment(data, hasHeader)),
    [alignOverride, columnCount, data, hasHeader]
  );

  if (!isOpen) return null;

  const canInsert = data.length > 0 && columnCount > 0;

  const cycleAlign = (col: number) => {
    const order: ColumnAlign[] = ['l', 'c', 'r'];
    const next = [...align];
    next[col] = order[(order.indexOf(align[col]) + 1) % order.length];
    setAlignOverride(next);
  };

  const handleConfirm = () => {
    if (!canInsert) return;
    const snippet = buildLatexTable(data, { hasHeader, style, caption, label, align });
    onInsert(snippet, style === 'booktabs' ? '\\usepackage{booktabs}' : undefined);
    setPasted('');
    setCaption('');
    setLabel('');
    onClose();
  };

  const tab = (id: 'paste' | 'grid', text: string, icon: React.ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={mode === id}
      onClick={() => setMode(id)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition whitespace-nowrap ${
        mode === id
          ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
          : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
      }`}
    >
      {icon}
      {text}
    </button>
  );

  const inputClass =
    'w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md p-2 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:border-scholarly dark:focus:border-scholarly-dark outline-none';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 font-sans"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Insert table"
        className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-xl rounded-xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
          <div className="flex items-center gap-2 text-stone-900 dark:text-stone-100 font-serif font-semibold text-base">
            <TableIcon className="w-4 h-4 text-scholarly dark:text-scholarly-dark" />
            <span>Insert Table</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4 text-xs">
          <div role="tablist" aria-label="Table source" className="inline-flex items-center p-0.5 rounded-lg bg-stone-200/60 dark:bg-stone-800">
            {tab('paste', 'Paste Data', <ClipboardPaste className="w-3.5 h-3.5" />)}
            {tab('grid', 'Empty Grid', <Grid3x3 className="w-3.5 h-3.5" />)}
          </div>

          {mode === 'paste' ? (
            <div className="space-y-1.5">
              <label htmlFor="table-paste" className="block text-stone-600 dark:text-stone-400 font-medium">
                Paste cells from Excel or Google Sheets, CSV, or a Markdown table
              </label>
              <textarea
                id="table-paste"
                ref={pasteRef}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                spellCheck={false}
                wrap="off"
                placeholder={'Sample\tValue\tUncertainty\nA\t1.23\t0.04\nB\t2.34\t0.05'}
                className={`${inputClass} h-28 font-mono text-[11px] leading-relaxed resize-y`}
              />
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {parsed.format === 'empty'
                  ? 'Select the cells in your spreadsheet, copy, and paste here. Characters such as & and % are escaped for you.'
                  : `Read as ${FORMAT_NAMES[parsed.format]}: ${parsed.rows.length} rows, ${parsed.columns} columns.`}
              </p>
            </div>
          ) : (
            <div>
              <p className="text-stone-600 dark:text-stone-400 mb-2 font-medium">
                Size:{' '}
                <span className="text-scholarly dark:text-scholarly-dark font-mono">
                  {hoverRows} rows, {hoverCols} columns
                </span>
              </p>
              <div
                className="grid grid-cols-8 gap-1 p-2 bg-surface-lightSubtle dark:bg-surface-darkSubtle rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder w-fit"
                onMouseLeave={() => {
                  setHoverRows(rows);
                  setHoverCols(cols);
                }}
              >
                {Array.from({ length: 64 }).map((_, idx) => {
                  const r = Math.floor(idx / 8) + 1;
                  const c = (idx % 8) + 1;
                  const lit = r <= hoverRows && c <= hoverCols;
                  return (
                    <button
                      key={idx}
                      type="button"
                      aria-label={`${r} rows, ${c} columns`}
                      onMouseEnter={() => {
                        setHoverRows(r);
                        setHoverCols(c);
                      }}
                      onFocus={() => {
                        setHoverRows(r);
                        setHoverCols(c);
                      }}
                      onClick={() => {
                        setRows(r);
                        setCols(c);
                      }}
                      className={`w-5 h-5 rounded-sm border transition ${
                        lit
                          ? 'bg-scholarly-subtle dark:bg-scholarly-darkSubtle border-scholarly dark:border-scholarly-dark'
                          : 'bg-transparent border-stone-300 dark:border-stone-700'
                      }`}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* Preview: what will be typeset, and the place to set column alignment */}
          {canInsert && (
            <div className="space-y-1.5">
              <p className="text-stone-600 dark:text-stone-400 font-medium">
                Preview <span className="font-normal text-stone-500">(click a column letter to change its alignment)</span>
              </p>
              <div className="overflow-x-auto rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-white">
                <table className="min-w-full text-[11px] text-stone-900 border-collapse">
                  <thead>
                    <tr>
                      {align.map((a, i) => (
                        <th key={i} className="p-0 border-b border-stone-200 bg-stone-50">
                          <button
                            type="button"
                            onClick={() => cycleAlign(i)}
                            title={`Column ${i + 1}: ${a === 'l' ? 'left' : a === 'c' ? 'centred' : 'right'}. Click to change.`}
                            className="w-full px-2 py-1 font-mono font-medium text-stone-500 hover:text-scholarly hover:bg-stone-100"
                          >
                            {a}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.slice(0, PREVIEW_ROWS).map((r, ri) => (
                      <tr
                        key={ri}
                        className={`${hasHeader && ri === 0 ? 'font-semibold border-b border-stone-400' : ''} ${
                          style === 'grid' ? 'border-b border-stone-300' : ''
                        }`}
                      >
                        {r.map((cell, ci) => (
                          <td
                            key={ci}
                            className={`px-2 py-1 whitespace-nowrap max-w-[180px] truncate ${
                              align[ci] === 'r' ? 'text-right' : align[ci] === 'c' ? 'text-center' : 'text-left'
                            } ${style === 'grid' ? 'border-x border-stone-300' : ''}`}
                          >
                            {cell || ' '}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.length > PREVIEW_ROWS && (
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  Showing {PREVIEW_ROWS} of {data.length} rows. All of them are inserted.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-stone-700 dark:text-stone-300">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="rounded accent-scholarly" />
              First row is a header
            </label>
            <label className="flex items-center gap-2 text-stone-700 dark:text-stone-300">
              Rules
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as 'booktabs' | 'grid')}
                className="bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md px-2 py-1 text-stone-900 dark:text-stone-100 outline-none focus:border-scholarly dark:focus:border-scholarly-dark"
              >
                <option value="booktabs">Journal style (booktabs)</option>
                <option value="grid">Full grid</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="table-caption" className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">
                Caption
              </label>
              <input
                id="table-caption"
                type="text"
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Summary of results"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="table-label" className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">
                Label, for \ref
              </label>
              <input
                id="table-label"
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="tab:results"
                spellCheck={false}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-xs font-medium transition btn-tactile"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canInsert}
            className="px-4 py-1.5 rounded-md bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover dark:hover:bg-scholarly-darkHover text-white text-xs font-medium shadow-xs transition btn-tactile disabled:opacity-50"
          >
            Insert Table
          </button>
        </div>
      </div>
    </div>
  );
};
