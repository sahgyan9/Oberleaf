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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none font-sans">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-md rounded-xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-surface-lightBorder dark:border-surface-darkBorder pb-3">
          <div className="flex items-center space-x-2 text-stone-900 dark:text-stone-100 font-serif font-semibold text-base">
            <TableIcon className="w-4 h-4 text-scholarly dark:text-scholarly-dark" />
            <span>Visual Table Generator</span>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 text-xs">
          {/* Interactive Grid Selector */}
          <div>
            <label className="block text-stone-600 dark:text-stone-400 mb-2 font-medium">
              Dimensions: <span className="text-scholarly dark:text-scholarly-dark font-mono font-medium">{hoverRows} Rows × {hoverCols} Columns</span>
            </label>
            <div
              className="grid grid-cols-6 gap-1 p-2 bg-surface-lightSubtle dark:bg-surface-darkSubtle rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder w-fit"
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
                        ? 'bg-scholarly-subtle/80 dark:bg-scholarly-darkSubtle border-scholarly dark:border-scholarly-dark'
                        : 'bg-transparent border-stone-300 dark:border-stone-700'
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
                className="rounded accent-scholarly"
              />
              <span className="text-stone-700 dark:text-stone-300">Header row</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hasBorders}
                onChange={(e) => setHasBorders(e.target.checked)}
                className="rounded accent-scholarly"
              />
              <span className="text-stone-700 dark:text-stone-300">Borders (\\hline)</span>
            </label>
          </div>

          {/* Caption */}
          <div>
            <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Caption</label>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md p-2 text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-sans"
            />
          </div>

          {/* Label */}
          <div>
            <label className="block text-stone-600 dark:text-stone-400 mb-1 font-medium">Reference Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md p-2 text-stone-900 dark:text-stone-100 focus:border-scholarly dark:focus:border-scholarly-dark outline-none font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-surface-lightBorder dark:border-surface-darkBorder">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-xs font-medium transition btn-tactile"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 rounded-md bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white text-xs font-medium shadow-xs transition btn-tactile"
          >
            Insert Table
          </button>
        </div>
      </div>
    </div>
  );
};
