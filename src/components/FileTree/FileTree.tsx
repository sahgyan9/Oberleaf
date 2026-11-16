import React, { useRef, useState, useEffect } from 'react';
import {
  FileText,
  Image as ImageIcon,
  Folder,
  FolderOpen,
  Upload,
  Plus,
  FileCode,
  FileCheck,
  MoreVertical,
  Edit2,
  Copy,
  Trash2,
  FolderPlus,
  PanelLeftClose,
  ChevronRight,
  ChevronDown,
  FileInput,
} from 'lucide-react';
import { isImagePath, PROJECT_IMAGE_DRAG_TYPE } from '../../utils/imageHelper';
import { OverflowBar, OverflowItem } from '../Common/OverflowBar';
import { SidebarTabs } from '../Common/SidebarTabs';

const HEADER_ACTION =
  'p-1.5 rounded hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-500 dark:text-stone-400 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile';

const headerAction = (label: string, onClick: () => void, icon: React.ReactNode) => (
  <button type="button" aria-label={label} title={label} onClick={onClick} className={HEADER_ACTION}>
    {icon}
  </button>
);

export interface FileEntry {
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  children?: FileEntry[];
}

interface ContextMenuState {
  x: number;
  y: number;
  item: FileEntry;
}

interface FileTreeProps {
  files: FileEntry[];
  selectedFilePath: string | null;
  /** True when the open file has edits that are not on disk yet. */
  hasUnsavedChanges?: boolean;
  onSelectFile: (filePath: string) => void;
  onUploadFiles: (files: File[]) => void;
  onNewFile: (folderPath?: string) => void;
  onNewFolder: (folderPath?: string) => void;
  onRenameItem: (oldPath: string, newName: string) => void;
  onDeleteItem: (path: string) => void;
  onDuplicateItem: (path: string) => void;
  /** Project-relative path of the main document (the file Compile builds). */
  mainFilePath?: string;
  onSetMainFile?: (path: string) => void;
  onToggleCollapse?: () => void;
  onRevealInExplorer?: (path?: string) => void;
  onShowToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
  activeTab?: 'files' | 'outline';
  onTabChange?: (tab: 'files' | 'outline') => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  selectedFilePath,
  hasUnsavedChanges = false,
  onSelectFile,
  onUploadFiles,
  onNewFile,
  onNewFolder,
  onRenameItem,
  onDeleteItem,
  onDuplicateItem,
  mainFilePath = 'main.tex',
  onSetMainFile,
  onToggleCollapse,
  onRevealInExplorer,
  onShowToast,
  activeTab = 'files',
  onTabChange,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({ figures: true });
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  // Close context menu on outside click or escape
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    // Only OS files are uploads; an image row dragged out of this tree is not.
    if (!e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onUploadFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const toggleFolder = (folderPath: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenFolders((prev) => ({
      ...prev,
      [folderPath]: prev[folderPath] === undefined ? false : !prev[folderPath],
    }));
  };

  const renderIcon = (ext?: string) => {
    switch (ext) {
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.svg':
      case '.webp':
        return <ImageIcon className="w-3.5 h-3.5 text-diagnostic dark:text-diagnostic-dark flex-shrink-0" />;
      case '.tex':
        return <FileCode className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark flex-shrink-0" />;
      case '.bib':
        return <FileCheck className="w-3.5 h-3.5 text-citation dark:text-citation-dark flex-shrink-0" />;
      case '.pdf':
        return <FileText className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 flex-shrink-0" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, item: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: Math.min(e.clientX, window.innerWidth - 180),
      y: Math.min(e.clientY, window.innerHeight - 200),
      item,
    });
  };

  const relPathOf = (item: FileEntry) => item.relativePath || item.name;
  // The main document, or a folder that contains it.
  const holdsMainFile = (item: FileEntry) => {
    const rel = relPathOf(item);
    return mainFilePath === rel || mainFilePath.startsWith(`${rel}/`);
  };

  const renderTree = (items: FileEntry[], depth: number = 0) => {
    return items.map((item) => {
      const isSelected = selectedFilePath === item.relativePath || selectedFilePath === item.path;

      if (item.type === 'directory') {
        const isOpen = openFolders[item.relativePath] ?? openFolders[item.name] ?? true;
        return (
          <div key={item.path} className="space-y-0.5 select-none">
            <div
              onClick={(e) => toggleFolder(item.relativePath, e)}
              onContextMenu={(e) => handleContextMenu(e, item)}
              title={item.name}
              className="group flex items-center gap-1 pl-1.5 pr-1 py-1.5 rounded text-xs text-stone-700 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle cursor-pointer transition"
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                {isOpen ? (
                  <ChevronDown className="w-3 h-3 text-stone-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-stone-400 flex-shrink-0" />
                )}
                {isOpen ? (
                  <FolderOpen className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 flex-shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 flex-shrink-0" />
                )}
                <span className="font-medium truncate min-w-0">{item.name}</span>
              </div>

              <button
                type="button"
                aria-label={`Actions for ${item.name}`}
                onClick={(e) => handleContextMenu(e, item)}
                className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded"
              >
                <MoreVertical className="w-3.5 h-3.5" />
              </button>
            </div>

            {isOpen && item.children && (
              // The guide line carries the indentation; rows inside need none of their own.
              <div className="border-l border-surface-lightBorder dark:border-surface-darkBorder ml-[11px] pl-1 space-y-0.5">
                {renderTree(item.children, depth + 1)}
              </div>
            )}
          </div>
        );
      }

      return (
        <div
          key={item.path}
          onContextMenu={(e) => handleContextMenu(e, item)}
          onClick={() => onSelectFile(item.relativePath || item.name)}
          draggable={isImagePath(item.name)}
          onDragStart={(e) => {
            // Dragging an image row into the editor inserts it as a figure.
            e.dataTransfer.setData(PROJECT_IMAGE_DRAG_TYPE, item.relativePath);
            e.dataTransfer.effectAllowed = 'copy';
          }}
          title={isImagePath(item.name) ? `${item.name}. Drag into the editor to insert as a figure.` : item.name}
          className={`group flex items-center gap-1 pl-1.5 pr-1 py-1.5 rounded text-xs cursor-pointer transition select-none border-l-2 ${
            isSelected
              ? 'bg-stone-200/70 dark:bg-stone-800 text-[#1C1917] dark:text-[#F5F5F4] font-medium border-scholarly dark:border-scholarly-dark'
              : 'border-transparent text-stone-700 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {renderIcon(item.extension)}
            <span className="truncate min-w-0">{item.name}</span>
            {relPathOf(item) === mainFilePath && (
              <span
                title="Main document: Compile builds this file"
                className="flex-shrink-0 rounded px-1 text-[10px] leading-4 font-medium text-stone-500 dark:text-stone-400 border border-surface-lightBorder dark:border-surface-darkBorder"
              >
                main
              </span>
            )}
            {/* The save indicator lives in the status bar, which says nothing
                about *which* file is dirty. Mark it here, where the user is
                choosing what to open next. */}
            {isSelected && hasUnsavedChanges && (
              <span
                title="Unsaved changes"
                aria-label="Unsaved changes"
                className="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"
              />
            )}
          </div>

          <button
            type="button"
            aria-label={`Actions for ${item.name}`}
            onClick={(e) => handleContextMenu(e, item)}
            className="flex-shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
        </div>
      );
    });
  };

  return (
    <aside
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`h-full w-full bg-surface-lightPanel dark:bg-surface-darkPanel border-r border-surface-lightBorder dark:border-surface-darkBorder flex flex-col select-none relative transition-colors ${
        isDragOver ? 'ring-2 ring-scholarly dark:ring-scholarly-dark ring-inset bg-scholarly-subtle/30 dark:bg-scholarly-darkSubtle/30' : ''
      }`}
    >
      {/* Hidden Multi-file input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        className="hidden"
        multiple
        accept=".png,.jpg,.jpeg,.svg,.webp,.pdf,.bib,.tex,.sty,.cls,.txt"
      />

      {/* Header: tabs stay, actions fold into a menu when the sidebar is narrow */}
      <div className="h-11 px-2 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center flex-shrink-0">
        <OverflowBar
          className="flex-1"
          gap={2}
          moreLabel="More file actions"
          menuAlign="left"
          moreButtonClassName={HEADER_ACTION}
          items={[
            {
              id: 'tabs',
              priority: 10,
              render: () =>
                onTabChange ? (
                  <SidebarTabs activeTab={activeTab} onTabChange={onTabChange} />
                ) : (
                  <span className="px-1 text-[11px] font-semibold uppercase tracking-[0.05em] text-stone-400 dark:text-stone-500">
                    Files
                  </span>
                ),
            },
            { id: 'spacer', spacer: true, render: () => null },
            {
              id: 'new-file',
              priority: 5,
              render: () => headerAction('New File', () => onNewFile(), <Plus className="w-3.5 h-3.5" />),
              menu: [{ label: 'New file', icon: <Plus className="w-3.5 h-3.5" />, onClick: () => onNewFile() }],
            },
            {
              id: 'new-folder',
              priority: 3,
              render: () => headerAction('New Folder', () => onNewFolder(), <FolderPlus className="w-3.5 h-3.5" />),
              menu: [{ label: 'New folder', icon: <FolderPlus className="w-3.5 h-3.5" />, onClick: () => onNewFolder() }],
            },
            {
              id: 'upload',
              priority: 4,
              render: () =>
                headerAction('Upload Files (or drop them on this panel)', () => fileInputRef.current?.click(), <Upload className="w-3.5 h-3.5" />),
              menu: [{ label: 'Upload files', icon: <Upload className="w-3.5 h-3.5" />, onClick: () => fileInputRef.current?.click() }],
            },
            ...(onRevealInExplorer
              ? [
                  {
                    id: 'reveal',
                    priority: 1,
                    render: () =>
                      headerAction('Show Project Folder in File Explorer', () => onRevealInExplorer(), <FolderOpen className="w-3.5 h-3.5" />),
                    menu: [
                      { label: 'Show in File Explorer', icon: <FolderOpen className="w-3.5 h-3.5" />, onClick: () => onRevealInExplorer() },
                    ],
                  } as OverflowItem,
                ]
              : []),
            ...(onToggleCollapse
              ? [
                  {
                    id: 'collapse',
                    priority: 8,
                    render: () =>
                      headerAction('Collapse Sidebar (Ctrl+B)', onToggleCollapse, <PanelLeftClose className="w-3.5 h-3.5" />),
                    menu: [
                      { label: 'Collapse sidebar', icon: <PanelLeftClose className="w-3.5 h-3.5" />, onClick: onToggleCollapse, hint: 'Ctrl+B' },
                    ],
                  } as OverflowItem,
                ]
              : []),
          ]}
        />
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {files.length === 0 ? (
          <div className="p-4 text-center text-xs text-stone-400">No files found</div>
        ) : (
          renderTree(files)
        )}
      </div>

      {/* Drag & Drop Hint */}
      <div className="p-2 border-t border-surface-lightBorder dark:border-surface-darkBorder text-[11px] text-center text-stone-400 dark:text-stone-500 flex-shrink-0">
        Drop files here to upload
      </div>

      {/* Context Menu Floating Portal */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 w-44 rounded-lg bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder shadow-xl py-1 text-xs text-stone-700 dark:text-stone-200 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-surface-lightBorder dark:border-surface-darkBorder font-semibold text-[11px] text-stone-400 truncate">
            {contextMenu.item.name}
          </div>

          <button
            onClick={() => {
              const newName = prompt('Enter new name:', contextMenu.item.name);
              if (newName && newName !== contextMenu.item.name) {
                onRenameItem(contextMenu.item.relativePath || contextMenu.item.name, newName);
              }
              setContextMenu(null);
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-left transition"
          >
            <Edit2 className="w-3.5 h-3.5 text-stone-500" />
            <span>Rename</span>
          </button>

          {contextMenu.item.type === 'file' && (
            <button
              onClick={() => {
                onDuplicateItem(contextMenu.item.relativePath || contextMenu.item.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-left transition"
            >
              <Copy className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
              <span>Duplicate</span>
            </button>
          )}

          {onSetMainFile &&
            contextMenu.item.type === 'file' &&
            contextMenu.item.name.toLowerCase().endsWith('.tex') &&
            relPathOf(contextMenu.item) !== mainFilePath && (
              <button
                onClick={() => {
                  onSetMainFile(relPathOf(contextMenu.item));
                  setContextMenu(null);
                }}
                className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-left transition"
              >
                <FileInput className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
                <span>Set as Main Document</span>
              </button>
            )}

          {contextMenu.item.type === 'directory' && (
            <>
              <button
                onClick={() => {
                  onNewFile(contextMenu.item.relativePath);
                  setContextMenu(null);
                }}
                className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-left transition"
              >
                <Plus className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
                <span>New File Here</span>
              </button>
              <button
                onClick={() => {
                  onNewFolder(contextMenu.item.relativePath);
                  setContextMenu(null);
                }}
                className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-left transition"
              >
                <FolderPlus className="w-3.5 h-3.5 text-stone-500" />
                <span>New Folder Here</span>
              </button>
            </>
          )}

          {onRevealInExplorer && (
            <button
              onClick={() => {
                onRevealInExplorer(contextMenu.item.relativePath || contextMenu.item.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-left transition"
            >
              <FolderOpen className="w-3.5 h-3.5 text-scholarly-teal dark:text-scholarly-tealDark" />
              <span>Reveal in Explorer</span>
            </button>
          )}

          <div className="h-[1px] bg-surface-lightBorder dark:border-surface-darkBorder my-1" />

          <button
            onClick={() => {
              if (holdsMainFile(contextMenu.item)) {
                const message =
                  relPathOf(contextMenu.item) === mainFilePath
                    ? `${contextMenu.item.name} is the main document. Set another .tex file as the main document before deleting it.`
                    : `${contextMenu.item.name} holds the main document (${mainFilePath}). Set another .tex file as the main document before deleting it.`;
                if (onShowToast) {
                  onShowToast(message, 'warning');
                } else {
                  alert(message);
                }
                setContextMenu(null);
                return;
              }
              if (
                confirm(
                  `Are you sure you want to delete "${contextMenu.item.name}"? This action cannot be undone.`
                )
              ) {
                onDeleteItem(contextMenu.item.relativePath || contextMenu.item.name);
              }
              setContextMenu(null);
            }}
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-rose-500/10 text-rose-600 dark:text-rose-400 text-left transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </aside>
  );
};
