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
  ListOrdered,
  Target,
  Loader2,
  Omega,
  SquareFunction,
  Code2,
  Eye,
} from 'lucide-react';
import { setEditorMode, useEditorMode } from '../../utils/editorMode';
import { OverflowBar, OverflowItem } from '../Common/OverflowBar';

interface EditorToolbarProps {
  onInsertSnippet: (snippet: string) => void;
  onWrapSelection: (prefix: string, suffix: string, placeholder: string) => void;
  onOpenImageModal: () => void;
  onOpenTableModal: () => void;
  onOpenCitationModal?: () => void;
  onOpenSymbols?: () => void;
  onJumpToPdf?: () => void;
  isJumpingToPdf?: boolean;
  isLiveMathEnabled?: boolean;
  onToggleLiveMath?: () => void;
}

const ICON_BUTTON =
  'p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile';
const LABEL_BUTTON =
  'flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-stone-200/80 dark:hover:bg-stone-800 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile whitespace-nowrap';

const EQUATION_SNIPPET = `\\begin{equation}
  E = mc^2
\\end{equation}\n`;
const ITEMIZE_SNIPPET = `\\begin{itemize}
  \\item Item 1
  \\item Item 2
\\end{itemize}\n`;
const ENUMERATE_SNIPPET = `\\begin{enumerate}
  \\item First
  \\item Second
\\end{enumerate}\n`;

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  onInsertSnippet,
  onWrapSelection,
  onOpenImageModal,
  onOpenTableModal,
  onOpenCitationModal,
  onOpenSymbols,
  onJumpToPdf,
  isJumpingToPdf,
  isLiveMathEnabled = true,
  onToggleLiveMath,
}) => {
  const editorMode = useEditorMode();

  const bold = () => onWrapSelection('\\textbf{', '}', 'text');
  const italic = () => onWrapSelection('\\textit{', '}', 'text');
  const section = () => onInsertSnippet('\\section{Section Title}\n');
  const inlineMath = () => onWrapSelection('$', '$', 'x');
  const equation = () => onInsertSnippet(EQUATION_SNIPPET);
  const bullets = () => onInsertSnippet(ITEMIZE_SNIPPET);
  const numbered = () => onInsertSnippet(ENUMERATE_SNIPPET);
  const cite = () => (onOpenCitationModal ? onOpenCitationModal() : onInsertSnippet('\\cite{citation_key}'));

  const iconButton = (label: string, onClick: () => void, icon: React.ReactNode) => (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={ICON_BUTTON}>
      {icon}
    </button>
  );

  const labelButton = (label: string, text: string, onClick: () => void, icon: React.ReactNode, compact: boolean) => (
    <button type="button" aria-label={label} title={label} onClick={onClick} className={LABEL_BUTTON}>
      {icon}
      {!compact && <span>{text}</span>}
    </button>
  );

  const separator = (id: string): OverflowItem => ({
    id,
    separator: true,
    render: () => <div className="w-px h-4 bg-stone-300 dark:bg-stone-700 mx-0.5" />,
  });

  const items: OverflowItem[] = [
    {
      id: 'bold',
      priority: 6,
      render: () => iconButton('Bold (\\textbf) - Ctrl+B', bold, <Bold className="w-3.5 h-3.5" />),
      menu: [{ label: 'Bold', icon: <Bold className="w-3.5 h-3.5" />, onClick: bold, hint: 'Ctrl+B' }],
    },
    {
      id: 'italic',
      priority: 6,
      render: () => iconButton('Italic (\\textit) - Ctrl+I', italic, <Italic className="w-3.5 h-3.5" />),
      menu: [{ label: 'Italic', icon: <Italic className="w-3.5 h-3.5" />, onClick: italic, hint: 'Ctrl+I' }],
    },
    separator('sep-format'),
    {
      id: 'section',
      priority: 5,
      render: () => iconButton('Insert Section', section, <Heading className="w-3.5 h-3.5" />),
      menu: [{ label: 'Section heading', icon: <Heading className="w-3.5 h-3.5" />, onClick: section }],
    },
    {
      id: 'inline-math',
      priority: 5,
      render: () => iconButton('Inline Math ($...$)', inlineMath, <Sigma className="w-3.5 h-3.5" />),
      menu: [{ label: 'Inline math', icon: <Sigma className="w-3.5 h-3.5" />, onClick: inlineMath, hint: '$...$' }],
    },
    {
      id: 'equation',
      priority: 4,
      render: () =>
        iconButton('Display Equation (\\begin{equation})', equation, <SquareFunction className="w-3.5 h-3.5" />),
      menu: [{ label: 'Numbered equation', icon: <SquareFunction className="w-3.5 h-3.5" />, onClick: equation }],
    },
    ...(onOpenSymbols
      ? [
          {
            id: 'symbols',
            priority: 4,
            render: (compact: boolean) =>
              labelButton(
                'Symbols and LaTeX reference (Ctrl+Shift+M)',
                'Symbols',
                onOpenSymbols,
                <Omega className="w-3.5 h-3.5" />,
                compact
              ),
            menu: [
              { label: 'Symbols and reference', icon: <Omega className="w-3.5 h-3.5" />, onClick: onOpenSymbols, hint: 'Ctrl+Shift+M' },
            ],
          } as OverflowItem,
        ]
      : []),
    separator('sep-insert'),
    {
      id: 'image',
      priority: 3,
      render: (compact) =>
        labelButton(
          'Insert Figure / Image',
          'Image',
          onOpenImageModal,
          <ImageIcon className="w-3.5 h-3.5 text-diagnostic dark:text-diagnostic-dark" />,
          compact
        ),
      menu: [{ label: 'Figure / image', icon: <ImageIcon className="w-3.5 h-3.5" />, onClick: onOpenImageModal }],
    },
    {
      id: 'table',
      priority: 3,
      render: (compact) =>
        labelButton(
          'Insert Table (grid or pasted data)',
          'Table',
          onOpenTableModal,
          <TableIcon className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />,
          compact
        ),
      menu: [{ label: 'Table', icon: <TableIcon className="w-3.5 h-3.5" />, onClick: onOpenTableModal }],
    },
    {
      id: 'cite',
      priority: 3,
      render: (compact) =>
        labelButton(
          'Browse, Look Up and Insert Citations (\\cite)',
          'Cite',
          cite,
          <Quote className="w-3.5 h-3.5 text-citation dark:text-citation-dark" />,
          compact
        ),
      menu: [{ label: 'Citation', icon: <Quote className="w-3.5 h-3.5" />, onClick: cite }],
    },
    separator('sep-lists'),
    {
      id: 'bullets',
      priority: 2,
      render: () => iconButton('Bullet List', bullets, <List className="w-3.5 h-3.5" />),
      menu: [{ label: 'Bullet list', icon: <List className="w-3.5 h-3.5" />, onClick: bullets }],
    },
    {
      id: 'numbered',
      priority: 1,
      render: () => iconButton('Numbered List', numbered, <ListOrdered className="w-3.5 h-3.5" />),
      menu: [{ label: 'Numbered list', icon: <ListOrdered className="w-3.5 h-3.5" />, onClick: numbered }],
    },
    { id: 'spacer', spacer: true, render: () => null },
    {
      id: 'mode',
      priority: 8,
      render: () => (
        <div
          role="radiogroup"
          aria-label="Editor mode"
          className="flex items-center p-0.5 rounded border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-900"
        >
          {(['code', 'visual'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={editorMode === mode}
              onClick={() => setEditorMode(mode)}
              title={mode === 'code' ? 'Show the LaTeX source' : 'Show headings, formatting, math and figures rendered'}
              className={`px-2 py-0.5 rounded-sm text-[11px] font-medium transition whitespace-nowrap ${
                editorMode === mode
                  ? 'bg-white dark:bg-stone-700 text-stone-900 dark:text-stone-100 shadow-sm'
                  : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
              }`}
            >
              {mode === 'code' ? 'Code' : 'Visual'}
            </button>
          ))}
        </div>
      ),
      menu: [
        { label: 'Code editor', icon: <Code2 className="w-3.5 h-3.5" />, onClick: () => setEditorMode('code'), active: editorMode === 'code' },
        { label: 'Visual editor', icon: <Eye className="w-3.5 h-3.5" />, onClick: () => setEditorMode('visual'), active: editorMode === 'visual' },
      ],
    },
    ...(onJumpToPdf
      ? [
          {
            id: 'synctex',
            priority: 7,
            render: (compact: boolean) => (
              <button
                type="button"
                aria-label="Jump to Cursor Location in PDF (SyncTeX: Ctrl+Alt+J)"
                onClick={onJumpToPdf}
                disabled={isJumpingToPdf}
                title="Jump to Cursor Location in PDF (SyncTeX: Ctrl+Alt+J)"
                className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium text-stone-700 dark:text-stone-200 bg-stone-200/80 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 border border-stone-300 dark:border-stone-700 transition disabled:opacity-50 btn-tactile whitespace-nowrap"
              >
                {isJumpingToPdf ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-scholarly dark:text-scholarly-dark" />
                ) : (
                  <Target className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
                )}
                {!compact && <span className="text-[11px]">Go to PDF</span>}
              </button>
            ),
            menu: [{ label: 'Jump to this line in the PDF', icon: <Target className="w-3.5 h-3.5" />, onClick: onJumpToPdf, hint: 'Ctrl+Alt+J' }],
          } as OverflowItem,
        ]
      : []),
    ...(onToggleLiveMath
      ? [
          {
            id: 'live-math',
            priority: 2,
            render: (compact: boolean) => (
              <button
                type="button"
                role="switch"
                aria-checked={isLiveMathEnabled}
                aria-label={isLiveMathEnabled ? 'Live math preview is on. Click to turn off.' : 'Live math preview is off. Click to turn on.'}
                onClick={onToggleLiveMath}
                title={isLiveMathEnabled ? 'Live math preview is on. Click to turn off.' : 'Live math preview is off. Click to turn on.'}
                className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition border btn-tactile whitespace-nowrap ${
                  isLiveMathEnabled
                    ? 'bg-scholarly/10 dark:bg-scholarly-dark/15 border-scholarly/40 dark:border-scholarly-dark/50 text-scholarly dark:text-scholarly-dark font-medium'
                    : 'border-stone-300 dark:border-stone-700 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
                }`}
              >
                <Sigma className="w-3 h-3 flex-shrink-0" />
                {!compact && <span>Preview {isLiveMathEnabled ? 'on' : 'off'}</span>}
              </button>
            ),
            menu: [
              { label: 'Live math preview', icon: <Sigma className="w-3.5 h-3.5" />, onClick: onToggleLiveMath, active: isLiveMathEnabled },
            ],
          } as OverflowItem,
        ]
      : []),
  ];

  return (
    <div className="h-9 flex-shrink-0 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightBorder dark:border-surface-darkBorder px-2 flex items-center select-none text-stone-600 dark:text-stone-300 transition-colors">
      <OverflowBar items={items} gap={2} className="flex-1" moreLabel="More formatting and tools" />
    </div>
  );
};
