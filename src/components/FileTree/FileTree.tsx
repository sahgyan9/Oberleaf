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
} from 'lucide-react';

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
  onSelectFile: (filePath: string) => void;
  onUploadFiles: (files: File[]) => void;
  onNewFile: (folderPath?: string) => void;
  onNewFolder: (folderPath?: string) => void;
  onRenameItem: (oldPath: string, newName: string) => void;
  onDeleteItem: (path: string) => void;
  onDuplicateItem: (path: string) => void;
  onToggleCollapse?: () => void;
}

export const FileTree: React.FC<FileTreeProps> = ({
  files,
  selectedFilePath,
  onSelectFile,
  onUploadFiles,
  onNewFile,
  onNewFolder,
  onRenameItem,
  onDeleteItem,
  onDuplicateItem,
  onToggleCollapse,
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
        return <ImageIcon className="w-3.5 h-3.5 text-brand-mint flex-shrink-0" />;
      case '.tex':
        return <FileCode className="w-3.5 h-3.5 text-brand-cyan flex-shrink-0" />;
      case '.bib':
        return <FileCheck className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />;
      case '.pdf':
        return <FileText className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />;
      default:
        return <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />;
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
              className="group flex items-center justify-between px-2 py-1.5 rounded text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer transition"
              style={{ paddingLeft: `${Math.max(8, depth * 14 + 8)}px` }}
            >
              <div className="flex items-center space-x-1.5 truncate">
                {isOpen ? (
                  <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                )}
                {isOpen ? (
                  <FolderOpen className="w-3.5 h-3.5 text-brand-ocean flex-shrink-0" />
                ) : (
                  <Folder className="w-3.5 h-3.5 text-brand-ocean flex-shrink-0" />
                )}
                <span className="font-medium truncate">{item.name}</span>
              </div>

              <button
                onClick={(e) => handleContextMenu(e, item)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white rounded"
              >
                <MoreVertical className="w-3 h-3" />
              </button>
            </div>

            {isOpen && item.children && (
              <div className="border-l border-slate-200 dark:border-slate-800/80 ml-3">
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
          className={`group flex items-center justify-between px-2.5 py-1.5 rounded text-xs cursor-pointer transition select-none ${
            isSelected
              ? 'bg-brand-indigo/15 dark:bg-brand-indigo/35 text-brand-indigo dark:text-brand-mint font-medium shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
          }`}
          style={{ paddingLeft: `${Math.max(10, depth * 14 + 10)}px` }}
        >
          <div className="flex items-center space-x-2 truncate">
            {renderIcon(item.extension)}
            <span className="truncate">{item.name}</span>
          </div>

          <button
            onClick={(e) => handleContextMenu(e, item)}
            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-white rounded"
          >
            <MoreVertical className="w-3 h-3" />
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
      className={`h-full w-full bg-surface-lightPanel dark:bg-surface-darkPanel border-r border-surface-lightSubtle dark:border-surface-darkSubtle flex flex-col select-none relative transition-colors ${
        isDragOver ? 'ring-2 ring-brand-mint ring-inset bg-brand-mint/5' : ''
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

      {/* Header */}
      <div className="p-3 border-b border-surface-lightSubtle dark:border-surface-darkSubtle flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Files
        </span>
        <div className="flex items-center space-x-0.5">
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Import Files (or Drag & Drop multiple)"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-brand-mint transition"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNewFile()}
            title="New File"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-brand-mint transition"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onNewFolder()}
            title="New Folder"
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-brand-mint transition"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              title="Collapse Sidebar (Ctrl+B)"
              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-200 transition ml-0.5"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* File List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {files.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-400">No files found</div>
        ) : (
          renderTree(files)
        )}
      </div>

      {/* Drag & Drop Hint */}
      <div className="p-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-center text-slate-400 dark:text-slate-500 flex-shrink-0">
        Drop multiple files here
      </div>

      {/* Context Menu Floating Portal */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 w-44 rounded-lg bg-surface-lightPanel dark:bg-surface-darkPanel border border-slate-200 dark:border-slate-800 shadow-xl py-1 text-xs text-slate-700 dark:text-slate-200 animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 border-b border-slate-100 dark:border-slate-800/80 font-semibold text-[11px] text-slate-400 truncate">
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
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
          >
            <Edit2 className="w-3.5 h-3.5 text-brand-cyan" />
            <span>Rename</span>
          </button>

          {contextMenu.item.type === 'file' && (
            <button
              onClick={() => {
                onDuplicateItem(contextMenu.item.relativePath || contextMenu.item.name);
                setContextMenu(null);
              }}
              className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
            >
              <Copy className="w-3.5 h-3.5 text-brand-mint" />
              <span>Duplicate</span>
            </button>
          )}

          {contextMenu.item.type === 'directory' && (
            <>
              <button
                onClick={() => {
                  onNewFile(contextMenu.item.relativePath);
                  setContextMenu(null);
                }}
                className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
              >
                <Plus className="w-3.5 h-3.5 text-brand-mint" />
                <span>New File Here</span>
              </button>
              <button
                onClick={() => {
                  onNewFolder(contextMenu.item.relativePath);
                  setContextMenu(null);
                }}
                className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition"
              >
                <FolderPlus className="w-3.5 h-3.5 text-brand-ocean" />
                <span>New Folder Here</span>
              </button>
            </>
          )}

          <div className="h-[1px] bg-slate-200 dark:bg-slate-800 my-1" />

          <button
            onClick={() => {
              if (contextMenu.item.name === 'main.tex') {
                alert('main.tex cannot be deleted.');
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
            className="w-full flex items-center space-x-2 px-3 py-1.5 hover:bg-rose-500/10 text-rose-500 text-left transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      )}
    </aside>
  );
};
