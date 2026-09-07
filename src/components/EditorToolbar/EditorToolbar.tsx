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
    <div className="h-9 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightBorder dark:border-surface-darkBorder px-2 sm:px-3 flex items-center justify-between min-w-0 overflow-x-auto select-none text-stone-600 dark:text-stone-300 transition-colors gap-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {/* Left formatting buttons */}
      <div className="flex items-center space-x-0.5 sm:space-x-1 flex-shrink-0">
        <button
          aria-label="Bold (\\textbf) - Ctrl+B"
          onClick={() => onWrapSelection('\\textbf{', '}', 'text')}
          title="Bold (\\textbf) - Ctrl+B"
          className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          <Bold className="w-3.5 h-3.5" />
        </button>

        <button
          aria-label="Italic (\\textit) - Ctrl+I"
          onClick={() => onWrapSelection('\\textit{', '}', 'text')}
          title="Italic (\\textit) - Ctrl+I"
          className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          <Italic className="w-3.5 h-3.5" />
        </button>

        <div className="w-[1px] h-4 bg-stone-300 dark:bg-stone-700 mx-1 flex-shrink-0" />

        {/* Sections & Math */}
        <button
          aria-label="Insert Section"
          onClick={() => onInsertSnippet('\\section{Section Title}\n')}
          title="Insert Section"
          className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          <Heading className="w-3.5 h-3.5" />
        </button>

        <button
          aria-label="Inline Math ($...$)"
          onClick={() => onWrapSelection('$', '$', 'x')}
          title="Inline Math ($...$)"
          className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition font-mono text-xs font-semibold btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          <Sigma className="w-3.5 h-3.5" />
        </button>

        <button
          aria-label="Display Equation (\\begin{equation})"
          onClick={() =>
            onInsertSnippet(`\\begin{equation}
  E = mc^2
\\end{equation}\n`)
          }
          title="Display Equation (\\begin{equation})"
          className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition text-xs font-mono btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          [eq]
        </button>

        <div className="w-[1px] h-4 bg-stone-300 dark:bg-stone-700 mx-1 flex-shrink-0" />

        {/* Overleaf-Style Modals: Image & Table */}
        <button
          aria-label="Insert Figure / Image"
          onClick={onOpenImageModal}
          title="Insert Figure / Image"
          className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          <ImageIcon className="w-3.5 h-3.5 text-diagnostic dark:text-diagnostic-dark" />
          <span className="hidden sm:inline">Image</span>
        </button>

        <button
          aria-label="Insert Table (Visual Generator)"
          onClick={onOpenTableModal}
          title="Insert Table (Visual Generator)"
          className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          <TableIcon className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
          <span className="hidden sm:inline">Table</span>
        </button>

        <div className="w-[1px] h-4 bg-stone-300 dark:bg-stone-700 mx-1 flex-shrink-0" />

        {/* Lists */}
        <button
          aria-label="Bullet List"
          onClick={() =>
            onInsertSnippet(`\\begin{itemize}
  \\item Item 1
  \\item Item 2
\\end{itemize}\n`)
          }
          title="Bullet List"
          className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          <List className="w-3.5 h-3.5" />
        </button>

        {/* Citation Picker */}
        <button
          aria-label="Browse & Insert Citations (\\cite)"
          onClick={() => (onOpenCitationModal ? onOpenCitationModal() : onInsertSnippet('\\cite{citation_key}'))}
          title="Browse & Insert Citations (\\cite)"
          className="flex items-center space-x-1 px-2 py-1 rounded text-xs hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile flex-shrink-0 whitespace-nowrap"
        >
          <Quote className="w-3.5 h-3.5 text-citation dark:text-citation-dark" />
          <span className="hidden sm:inline">Cite</span>
        </button>
      </div>

      {/* Right actions: SyncTeX Jump to PDF & Live Math toggle */}
      <div className="flex items-center space-x-1.5 flex-shrink-0 ml-auto pl-1">
        {onJumpToPdf && (
          <button
            aria-label="Jump to Cursor Location in PDF (SyncTeX: Ctrl+Alt+J)"
            onClick={onJumpToPdf}
            disabled={isJumpingToPdf}
            title="Jump to Cursor Location in PDF (SyncTeX: Ctrl+Alt+J)"
            className="flex items-center space-x-1 px-2 py-1 rounded text-xs font-medium text-stone-700 dark:text-stone-200 bg-stone-200/80 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 border border-stone-300 dark:border-stone-700 transition disabled:opacity-50 select-none btn-tactile whitespace-nowrap flex-shrink-0"
          >
            {isJumpingToPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-scholarly dark:text-scholarly-dark" />
            ) : (
              <Target className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
            )}
            <span className="hidden xl:inline text-[11px]">SyncTeX</span>
          </button>
        )}

        {/* Live Math Toggle */}
        {onToggleLiveMath && (
          <button
            aria-label={isLiveMathEnabled ? "Live Math Preview is ON. Click to disable." : "Live Math Preview is OFF. Click to enable."}
            onClick={onToggleLiveMath}
            title={isLiveMathEnabled ? "Live Math Preview is ON. Click to disable." : "Live Math Preview is OFF. Click to enable."}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-mono transition border btn-tactile whitespace-nowrap flex-shrink-0 ${
              isLiveMathEnabled
                ? 'bg-[#1B5E20]/15 dark:bg-[#2EA043]/20 border-[#1B5E20]/40 dark:border-[#2EA043]/50 text-[#1B5E20] dark:text-[#2EA043] font-medium'
                : 'border-stone-300 dark:border-stone-700 text-stone-400 hover:text-stone-200'
            }`}
          >
            <Sigma className="w-3 h-3 flex-shrink-0" />
            <span>Math: {isLiveMathEnabled ? 'ON' : 'OFF'}</span>
          </button>
        )}
      </div>
    </div>
  );
};
