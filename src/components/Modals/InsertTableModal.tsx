import React, { useState } from 'react';
import { X, Table as TableIcon } from 'lucide-react';

interface InsertTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (latexSnippet: string) => void;
}

export const InsertTableModal: React.FC<InsertTableModalProps> = ({
  isOpen,
  onClose,
  onInsert,
}) => {
  const [rows, setRows] = useState<number>(3);
  const [cols, setCols] = useState<number>(3);
  const [hoverRows, setHoverRows] = useState<number>(3);
  const [hoverCols, setHoverCols] = useState<number>(3);
  const [hasHeader, setHasHeader] = useState<boolean>(true);
  const [hasBorders, setHasBorders] = useState<boolean>(true);
  const [caption, setCaption] = useState<string>('Summary of Results');
  const [label, setLabel] = useState<string>('tab:results');

  if (!isOpen) return null;

  const handleConfirm = () => {
    const colAlign = hasBorders
      ? `|${Array(cols).fill('c').join('|')}|`
      : Array(cols).fill('c').join(' ');

    let body = '';
    for (let r = 0; r < rows; r++) {
      const rowCells = [];
      for (let c = 0; c < cols; c++) {
        if (r === 0 && hasHeader) {
          rowCells.push(`\\textbf{Col ${c + 1}}`);
        } else {
          rowCells.push(`Data ${r},${c + 1}`);
        }
      }
      body += `    ${rowCells.join(' & ')} \\\\ ${hasBorders ? '\\hline' : ''}\n`;
    }

    const snippet = `\\begin{table}[htbp]
  \\centering
  \\caption{${caption}}
  \\label{${label}}
  \\begin{tabular}{${colAlign}}
    ${hasBorders ? '\\hline' : ''}
${body}  \\end{tabular}
\\end{table}
`;

    onInsert(snippet);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightSubtle dark:border-surface-darkSubtle w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div className="flex items-center space-x-2 text-slate-900 dark:text-white font-semibold text-sm">
            <TableIcon className="w-4 h-4 text-brand-mint" />
            <span>Visual Table Generator</span>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Interactive Grid Selector */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-2 font-medium">
              Dimensions: <span className="text-brand-mint font-mono">{hoverRows} Rows × {hoverCols} Columns</span>
            </label>
            <div
              className="grid grid-cols-6 gap-1 p-2 bg-surface-lightSubtle dark:bg-surface-darkSubtle rounded-lg border border-slate-200 dark:border-slate-800 w-fit"
              onMouseLeave={() => {
                setHoverRows(rows);
                setHoverCols(cols);
              }}
            >
              {Array.from({ length: 36 }).map((_, idx) => {
                const r = Math.floor(idx / 6) + 1;
                const c = (idx % 6) + 1;
                const isHovered = r <= hoverRows && c <= hoverCols;

                return (
                  <div
                    key={idx}
                    onMouseEnter={() => {
                      setHoverRows(r);
                      setHoverCols(c);
                    }}
                    onClick={() => {
                      setRows(r);
                      setCols(c);
                    }}
                    className={`w-6 h-6 rounded-sm border cursor-pointer transition ${
                      isHovered
                        ? 'bg-brand-mint/30 border-brand-mint'
                        : 'bg-transparent border-slate-300 dark:border-slate-700'
                    }`}
                  />
                );
              })}
            </div>
          </div>

          {/* Options */}
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasHeader}
                onChange={(e) => setHasHeader(e.target.checked)}
                className="rounded accent-brand-mint"
              />
              <span className="text-slate-700 dark:text-slate-300">Header row</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasBorders}
                onChange={(e) => setHasBorders(e.target.checked)}
                className="rounded accent-brand-mint"
              />
              <span className="text-slate-700 dark:text-slate-300">Borders (\\hline)</span>
            </label>
          </div>

          {/* Caption */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Caption</label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-300 dark:border-slate-700 rounded-md p-2 text-slate-900 dark:text-white focus:border-brand-mint outline-none"
            />
          </div>

          {/* Label */}
          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1 font-medium">Reference Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-300 dark:border-slate-700 rounded-md p-2 text-slate-900 dark:text-white focus:border-brand-mint outline-none font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium transition"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-md bg-brand-mint text-slate-950 hover:brightness-110 text-xs font-semibold shadow-md shadow-brand-mint/20 transition"
          >
            Insert Table
          </button>
        </div>
      </div>
    </div>
  );
};
