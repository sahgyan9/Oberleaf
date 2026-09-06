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
  onWrapSelection: (prefix: string, suffix: string, placeholder: string) => void;
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
  onWrapSelection,
  onOpenImageModal,
  onOpenTableModal,
  onOpenCitationModal,
  onJumpToPdf,
  isJumpingToPdf,
  isLiveMathEnabled = true,
  onToggleLiveMath,
}) => {
  return (
    <div className="h-9 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightBorder dark:border-surface-darkBorder px-3 flex items-center space-x-1 select-none text-stone-600 dark:text-stone-300 transition-colors">
      {/* Formatting buttons */}
      <button
        onClick={() => onWrapSelection('\\textbf{', '}', 'text')}
        title="Bold (\\textbf)"
        className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
      >
        <Bold className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => onWrapSelection('\\textit{', '}', 'text')}
        title="Italic (\\textit)"
        className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
      >
        <Italic className="w-3.5 h-3.5" />
      </button>

      <div className="w-[1px] h-4 bg-stone-300 dark:bg-stone-700 mx-1" />

      {/* Sections & Math */}
      <button
        onClick={() => onInsertSnippet('\\section{Section Title}\n')}
        title="Insert Section"
        className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
      >
        <Heading className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={() => onWrapSelection('$', '$', 'x')}
        title="Inline Math ($...$)"
        className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition font-mono text-xs font-semibold btn-tactile"
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
        className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition text-xs font-mono btn-tactile"
      >
        [eq]
      </button>

      <div className="w-[1px] h-4 bg-stone-300 dark:bg-stone-700 mx-1" />

      {/* Overleaf-Style Modals: Image & Table */}
      <button
        onClick={onOpenImageModal}
        title="Insert Figure / Image"
        className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
      >
        <ImageIcon className="w-3.5 h-3.5 text-diagnostic dark:text-diagnostic-dark" />
        <span className="hidden sm:inline">Image</span>
      </button>

      <button
        onClick={onOpenTableModal}
        title="Insert Table (Visual Generator)"
        className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
      >
        <TableIcon className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
        <span className="hidden sm:inline">Table</span>
      </button>

      <div className="w-[1px] h-4 bg-stone-300 dark:bg-stone-700 mx-1" />

      {/* Lists */}
      <button
        onClick={() =>
          onInsertSnippet(`\\begin{itemize}
  \\item Item 1
  \\item Item 2
\\end{itemize}\n`)
        }
        title="Bullet List"
        className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
      >
        <List className="w-3.5 h-3.5" />
      </button>

      {/* Citation Picker */}
      <button
        onClick={() => (onOpenCitationModal ? onOpenCitationModal() : onInsertSnippet('\\cite{citation_key}'))}
        title="Browse & Insert Citations (\\cite)"
        className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
      >
        <Quote className="w-3.5 h-3.5 text-citation dark:text-citation-dark" />
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
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-medium text-stone-700 dark:text-stone-200 bg-stone-200/80 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 border border-stone-300 dark:border-stone-700 transition disabled:opacity-50 select-none mr-2 btn-tactile"
        >
          {isJumpingToPdf ? (
            <Loader2 className="w-3 h-3 animate-spin text-scholarly dark:text-scholarly-dark" />
          ) : (
            <Target className="w-3.5 h-3.5 text-stone-600 dark:text-stone-300" />
          )}
          <span className="hidden md:inline">Jump to PDF</span>
          <kbd className="hidden lg:inline text-[9px] px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono font-normal">
            Ctrl+Alt+J
          </kbd>
        </button>
      )}

      {/* Live Math Toggle */}
      {onToggleLiveMath && (
        <button
          onClick={onToggleLiveMath}
          title={isLiveMathEnabled ? "Live Math Preview is ON. Click to disable." : "Live Math Preview is OFF. Click to enable."}
          className={`flex items-center space-x-1 px-2.5 py-0.5 rounded text-[11px] font-mono transition border btn-tactile ${
            isLiveMathEnabled
              ? 'bg-[#1B5E20]/15 dark:bg-[#2EA043]/20 border-[#1B5E20]/40 dark:border-[#2EA043]/50 text-[#1B5E20] dark:text-[#2EA043] font-medium'
              : 'border-stone-300 dark:border-stone-700 text-stone-400 hover:text-stone-200'
          }`}
        >
          <Sigma className="w-3 h-3" />
          <span>Live Math: {isLiveMathEnabled ? 'ON' : 'OFF'}</span>
        </button>
      )}
    </div>
  );
};
