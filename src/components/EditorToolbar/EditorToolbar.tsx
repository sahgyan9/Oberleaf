import React from 'react';
import {
  Bold,
  Italic,
  Image as ImageIcon,
  Table as TableIcon,
  Sigma,
  Heading,
  Quote,
  List,
  Target,
  Loader2,
} from 'lucide-react';

interface EditorToolbarProps {
  onInsertSnippet: (snippet: string) => void;
  onOpenImageModal: () => void;
  onOpenTableModal: () => void;
  onOpenCitationModal?: () => void;
  onJumpToPdf?: () => void;
  isJumpingToPdf?: boolean;
  isLiveMathEnabled?: boolean;
  onToggleLiveMath?: () => void;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  onInsertSnippet,
  onOpenImageModal,
  onOpenTableModal,
  onOpenCitationModal,
  onJumpToPdf,
  isJumpingToPdf,
  isLiveMathEnabled = true,
  onToggleLiveMath,
}) => {
  return (
    <div className="h-9 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightSubtle dark:border-surface-darkSubtle px-3 flex items-center space-x-1 select-none text-slate-600 dark:text-slate-300">
      {/* Formatting buttons */}
      <button
        onClick={() => onInsertSnippet('\\textbf{text}')}
        title="Bold (\\textbf)"
        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition"
      >
        <Bold className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => onInsertSnippet('\\textit{text}')}
        title="Italic (\\textit)"
        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition"
      >
        <Italic className="w-3.5 h-3.5" />
      </button>

      <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

      {/* Sections & Math */}
      <button
        onClick={() => onInsertSnippet('\\section{Section Title}\n')}
        title="Insert Section"
        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition"
      >
        <Heading className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => onInsertSnippet('$x$')}
        title="Inline Math ($...$)"
        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition font-mono text-xs font-semibold"
      >
        <Sigma className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() =>
          onInsertSnippet(`\\begin{equation}
  E = mc^2
\\end{equation}\n`)
        }
        title="Display Equation (\\begin{equation})"
        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition text-xs font-mono"
      >
        [eq]
      </button>

      <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

      {/* Overleaf-Style Modals: Image & Table */}
      <button
        onClick={onOpenImageModal}
        title="Insert Figure / Image"
        className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition"
      >
        <ImageIcon className="w-3.5 h-3.5 text-brand-cyan" />
        <span className="hidden sm:inline">Image</span>
      </button>

      <button
        onClick={onOpenTableModal}
        title="Insert Table (Visual Generator)"
        className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition"
      >
        <TableIcon className="w-3.5 h-3.5 text-brand-mint" />
        <span className="hidden sm:inline">Table</span>
      </button>

      <div className="w-[1px] h-4 bg-slate-300 dark:bg-slate-700 mx-1" />

      {/* Lists */}
      <button
        onClick={() =>
          onInsertSnippet(`\\begin{itemize}
  \\item Item 1
  \\item Item 2
\\end{itemize}\n`)
        }
        title="Bullet List"
        className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition"
      >
        <List className="w-3.5 h-3.5" />
      </button>

      {/* Citation Picker */}
      <button
        onClick={() => (onOpenCitationModal ? onOpenCitationModal() : onInsertSnippet('\\cite{citation_key}'))}
        title="Browse & Insert Citations (\\cite)"
        className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-brand-mint transition"
      >
        <Quote className="w-3.5 h-3.5 text-brand-ocean" />
        <span className="hidden sm:inline">Cite</span>
      </button>

      {/* Spacer */}
      <div className="flex-1" />

      {/* SyncTeX Forward Jump to PDF Button */}
      {onJumpToPdf && (
        <button
          onClick={onJumpToPdf}
          disabled={isJumpingToPdf}
          title="Jump to Cursor Location in PDF (SyncTeX: Ctrl+Alt+J)"
          className="flex items-center space-x-1.5 px-2 py-1 rounded text-xs font-medium text-slate-800 dark:text-brand-mint bg-brand-mint/10 hover:bg-brand-mint/20 border border-brand-mint/30 transition disabled:opacity-50 select-none mr-2"
        >
          {isJumpingToPdf ? (
            <Loader2 className="w-3 h-3 animate-spin text-brand-mint" />
          ) : (
            <Target className="w-3 h-3 text-brand-mint" />
          )}
          <span className="hidden md:inline">Jump to PDF</span>
          <kbd className="hidden lg:inline text-[9px] px-1 py-0.2 rounded bg-black/10 dark:bg-white/10 font-mono font-normal">
            Ctrl+Alt+J
          </kbd>
        </button>
      )}

      {/* Live Math Toggle */}
      {onToggleLiveMath && (
        <button
          onClick={onToggleLiveMath}
          title={isLiveMathEnabled ? "Live Math Preview is ON. Click to disable." : "Live Math Preview is OFF. Click to enable."}
          className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono transition border ${
            isLiveMathEnabled
              ? 'bg-brand-mint/10 border-brand-mint/40 text-brand-mint'
              : 'border-slate-300 dark:border-slate-700 text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sigma className="w-3 h-3" />
          <span>Live Math: {isLiveMathEnabled ? 'ON' : 'OFF'}</span>
        </button>
      )}
    </div>
  );
};
