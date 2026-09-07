import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Sun,
  Moon,
  Columns,
  Code2,
  FileText,
  Activity,
  Plus,
  Loader2,
  ChevronDown,
  Check,
  FolderOpen,
  CheckCircle2,
  History,
  ArrowLeft,
  Maximize2,
  Minimize2,
  Github,
  MessageSquare,
  Users,
  Eraser,
  MonitorUp,
  MoreHorizontal,
  ArrowDownToLine,
} from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

export type ViewMode = 'split' | 'code' | 'pdf';

export interface ProjectInfo {
  id: string;
  name: string;
  template: string;
  updatedAt: string;
}

interface TopBarProps {
  projectName: string;
  projectId: string;
  projects: ProjectInfo[];
  onSelectProject: (pId: string) => void;
  onNewProject: () => void;
  onBackToProjects?: () => void;
  onCompile: () => void;
  isCompiling: boolean;
  compileDuration: number | null;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onOpenHistory?: () => void;
  onOpenDoctor: () => void;
  isDoctorHealthy: boolean | null;
  activeFilePath: string;
  saveStatus: 'saved' | 'saving' | 'unsaved';
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  onOpenSyncModal?: () => void;
  gitSyncStatus?: { ahead: number; behind: number; remoteUrl: string | null } | null;
  onOpenComments?: () => void;
  openCommentsCount?: number;
  onOpenCollab?: () => void;
  isCollabActive?: boolean;
  collabPeersCount?: number;
  onCleanBuild?: () => void;
  hasUpdate?: boolean;
  onOpenUpdateModal?: () => void;
  onCheckForUpdates?: () => void;
  onShowToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  projectId,
  projects,
  onSelectProject,
  onNewProject,
  onBackToProjects,
  onCompile,
  isCompiling,
  compileDuration,
  viewMode,
  onViewModeChange,
  onOpenHistory,
  onOpenDoctor,
  isDoctorHealthy,
  activeFilePath,
  saveStatus,
  isFullscreen = false,
  onToggleFullscreen,
  onOpenSyncModal,
  gitSyncStatus,
  onOpenComments,
  openCommentsCount = 0,
  onOpenCollab,
  isCollabActive = false,
  collabPeersCount = 0,
  onCleanBuild,
  hasUpdate = false,
  onOpenUpdateModal,
  onCheckForUpdates,
  onShowToast,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isProjectsDropdownOpen, setIsProjectsDropdownOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [isAddingShortcut, setIsAddingShortcut] = useState(false);
  const [shortcutAdded, setShortcutAdded] = useState(false);

  const handleAddShortcut = async () => {
    setIsAddingShortcut(true);
    setShortcutAdded(false);
    try {
      const res = await fetch('/api/system/create-shortcut', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setShortcutAdded(true);
        onShowToast?.('Desktop & Start Menu shortcut added.', 'success');
        setTimeout(() => setShortcutAdded(false), 3500);
      } else {
        if (onShowToast) onShowToast(data.error || 'Could not create shortcut.', 'error');
        else alert(data.error || 'Could not create shortcut.');
      }
    } catch (err: any) {
      if (onShowToast) onShowToast(`Error connecting to server: ${err.message}`, 'error');
      else alert(`Error connecting to server: ${err.message}`);
    } finally {
      setIsAddingShortcut(false);
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsProjectsDropdownOpen(false);
      }
      if (toolsRef.current && !toolsRef.current.contains(e.target as Node)) {
        setIsToolsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <header className="h-14 border-b border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel px-3 sm:px-4 flex items-center justify-between select-none relative z-30 transition-colors gap-2">
      {/* Left: Back to Projects, Brand / Project Switcher, and Save Status */}
      <div className="flex items-center space-x-2.5 flex-shrink-0">
        {onBackToProjects && (
          <button
            onClick={onBackToProjects}
            title="Back to All Projects"
            className="flex items-center space-x-1.5 h-8 px-2.5 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 border border-surface-lightBorder dark:border-surface-darkBorder transition text-xs font-semibold btn-tactile flex-shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </button>
        )}

        {/* Brand & Project Switcher Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsProjectsDropdownOpen((prev) => !prev)}
            title="Switch or Browse Projects"
            className="flex items-center space-x-2 h-8 px-2.5 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition text-left group border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile"
          >
            <div className="w-5 h-5 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src="/assets/icon.svg?v=4"
                alt="Oberleaf"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="font-serif font-semibold text-sm tracking-tight text-[#1C1917] dark:text-[#F5F5F4] whitespace-nowrap">
              Ober<span className="text-scholarly dark:text-scholarly-dark italic font-normal">leaf</span>
            </span>
            <span className="text-stone-300 dark:text-stone-600 font-light text-xs select-none">/</span>
            <span className="text-xs font-medium text-stone-700 dark:text-stone-300 group-hover:text-[#1C1917] dark:group-hover:text-white transition truncate max-w-[150px]">
              {projectName || 'Select Project'}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-200 flex-shrink-0" />
          </button>

          {/* Project List Dropdown Menu */}
          {isProjectsDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder shadow-xl p-2 space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100 z-50">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider flex items-center justify-between font-sans">
                <span>Your Projects ({projects.length})</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-medium border border-stone-200 dark:border-stone-700">
                  Fast Engine
                </span>
              </div>

              <div className="max-h-60 overflow-y-auto space-y-0.5 pr-1">
                {projects.map((proj) => {
                  const isCurrent = proj.id === projectId;
                  return (
                    <button
                      key={proj.id}
                      onClick={() => {
                        onSelectProject(proj.id);
                        setIsProjectsDropdownOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition ${
                        isCurrent
                          ? 'bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-scholarly dark:text-scholarly-dark font-medium border border-scholarly/20 dark:border-scholarly-dark/30'
                          : 'hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <FolderOpen className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400 flex-shrink-0" />
                        <div className="truncate">
                          <p className="truncate font-medium" title={proj.name}>{proj.name}</p>
                          <p className="text-[10px] text-stone-400 dark:text-stone-500 font-normal">
                            {formatDate(proj.updatedAt)}
                          </p>
                        </div>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-1.5 border-t border-surface-lightBorder dark:border-surface-darkBorder space-y-1">
                <button
                  onClick={() => {
                    setIsProjectsDropdownOpen(false);
                    onNewProject();
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 p-2 rounded-lg bg-surface-lightSubtle hover:bg-stone-200/60 dark:bg-surface-darkSubtle dark:hover:bg-stone-800 text-scholarly dark:text-scholarly-dark font-medium transition border border-surface-lightBorder dark:border-surface-darkBorder btn-tactile"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create New Project</span>
                </button>
                {onCheckForUpdates && (
                  <button
                    onClick={() => {
                      setIsProjectsDropdownOpen(false);
                      onCheckForUpdates();
                    }}
                    className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-600 dark:text-stone-300 font-medium transition text-left text-xs"
                  >
                    <div className="flex items-center space-x-2">
                      <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span>Check for Updates</span>
                    </div>
                    {hasUpdate && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Active File & Save Status */}
        <div className="hidden lg:flex items-center space-x-2 pl-3 border-l border-surface-lightBorder dark:border-surface-darkBorder text-xs h-5">
          <span className="font-mono text-stone-500 dark:text-stone-400 truncate max-w-[120px]">
            {activeFilePath}
          </span>
          {saveStatus === 'unsaved' && (
            <span className="flex items-center space-x-1 text-diagnostic dark:text-diagnostic-dark text-[11px] font-medium whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-diagnostic dark:bg-diagnostic-dark" />
              <span>Unsaved</span>
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="flex items-center space-x-1 text-stone-500 dark:text-stone-400 text-[11px] font-medium whitespace-nowrap">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Saving...</span>
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center space-x-1 text-stone-400 dark:text-stone-500 text-[11px] whitespace-nowrap">
              <CheckCircle2 className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
              <span>Saved</span>
            </span>
          )}
        </div>
      </div>

      {/* Center Actions: Tactile Oxford Green Recompile Button */}
      <div className="flex items-center space-x-2 flex-shrink-0 px-2">
        <button
          onClick={onCompile}
          disabled={isCompiling}
          title="Compile LaTeX (Ctrl+Enter)"
          className="flex items-center space-x-2 bg-[#1B5E20] dark:bg-[#2EA043] hover:bg-[#164E1B] dark:hover:bg-[#278638] text-white px-3.5 h-8 rounded-lg font-semibold text-xs transition shadow-sm active:translate-y-[0.5px] active:scale-[0.99] disabled:opacity-50 btn-tactile cursor-pointer whitespace-nowrap"
        >
          {isCompiling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isCompiling ? 'Compiling...' : 'Recompile'}</span>
          <kbd className="hidden sm:inline-flex items-center ml-1 text-[10px] bg-black/25 text-white/95 px-1.5 py-0.5 rounded font-mono font-normal">
            Ctrl+↵
          </kbd>
        </button>

        {compileDuration !== null && !isCompiling && (
          <span className="text-xs text-stone-500 dark:text-stone-400 font-mono hidden xl:inline whitespace-nowrap">
            {(compileDuration / 1000).toFixed(1)}s local
          </span>
        )}
      </div>

      {/* Right Controls: View Mode, Collaboration, Tools & System */}
      <div className="flex items-center space-x-1.5 flex-shrink-0">
        {/* Layout Switchers */}
        <div className="flex items-center bg-surface-lightSubtle dark:bg-surface-darkSubtle p-0.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder h-8">
          <button
            onClick={() => onViewModeChange('code')}
            title="Full Code Mode (Ctrl+7)"
            className={`h-7 px-2 rounded-md text-xs transition btn-tactile flex items-center justify-center ${
              viewMode === 'code'
                ? 'bg-surface-lightPanel dark:bg-stone-800 text-scholarly dark:text-scholarly-dark shadow-xs font-medium'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('split')}
            title="Split Mode (Ctrl+8)"
            className={`h-7 px-2 rounded-md text-xs transition btn-tactile flex items-center justify-center ${
              viewMode === 'split'
                ? 'bg-surface-lightPanel dark:bg-stone-800 text-scholarly dark:text-scholarly-dark shadow-xs font-medium'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('pdf')}
            title="Full PDF Mode (Ctrl+9)"
            className={`h-7 px-2 rounded-md text-xs transition btn-tactile flex items-center justify-center ${
              viewMode === 'pdf'
                ? 'bg-surface-lightPanel dark:bg-stone-800 text-scholarly dark:text-scholarly-dark shadow-xs font-medium'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-surface-lightBorder dark:bg-surface-darkBorder mx-1 hidden sm:block" />

        {/* Comments Button */}
        {onOpenComments && (
          <button
            onClick={onOpenComments}
            title="Review Comments (Alt+M)"
            className="flex items-center space-x-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-scholarly dark:hover:text-scholarly-dark hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile whitespace-nowrap"
          >
            <MessageSquare className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
            <span className="hidden md:inline">Comments</span>
            {openCommentsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-scholarly dark:bg-scholarly-dark text-white text-[10px] font-bold">
                {openCommentsCount}
              </span>
            )}
          </button>
        )}

        {/* Live Collab Button */}
        {onOpenCollab && (
          <button
            onClick={onOpenCollab}
            title="Live Peer-to-Peer Collaboration"
            className={`flex items-center space-x-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition border btn-tactile whitespace-nowrap ${
              isCollabActive
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                : 'text-stone-700 dark:text-stone-300 hover:text-scholarly dark:hover:text-scholarly-dark hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder'
            }`}
          >
            <Users className={`w-3.5 h-3.5 ${isCollabActive ? 'text-emerald-500 animate-pulse' : ''}`} />
            <span className="hidden md:inline">
              {isCollabActive ? `Live (${collabPeersCount})` : 'Collab'}
            </span>
          </button>
        )}

        {/* History & Checkpoints Button */}
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            title="Version History & Git Checkpoints"
            className="flex items-center space-x-1.5 h-8 px-2.5 rounded-lg text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-scholarly dark:hover:text-scholarly-dark hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile whitespace-nowrap"
          >
            <History className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
            <span className="hidden md:inline">History</span>
          </button>
        )}

        {/* Update Available Badge */}
        {hasUpdate && onOpenUpdateModal && (
          <button
            onClick={onOpenUpdateModal}
            title="A new Oberleaf update is available! Click to view details and install."
            className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold animate-pulse hover:bg-emerald-500/25 transition btn-tactile cursor-pointer mr-0.5"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span className="hidden sm:inline">Update Available</span>
          </button>
        )}

        <div className="h-4 w-px bg-surface-lightBorder dark:bg-surface-darkBorder mx-1 hidden sm:block" />

        {/* Workspace Tools Dropdown */}
        <div className="relative" ref={toolsRef}>
          <button
            onClick={() => setIsToolsOpen((prev) => !prev)}
            title="Workspace Tools & Diagnostics"
            className="relative flex items-center justify-center w-8 h-8 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile"
          >
            <MoreHorizontal className="w-4 h-4" />
            {((isDoctorHealthy !== null && !isDoctorHealthy) || (gitSyncStatus && gitSyncStatus.ahead > 0)) && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-diagnostic dark:bg-diagnostic-dark" />
            )}
          </button>

          {isToolsOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder shadow-xl p-1.5 space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100 z-50">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider font-sans">
                Workspace Tools
              </div>

              {/* GitHub Remote Sync */}
              {onOpenSyncModal && (
                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onOpenSyncModal();
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-200 transition text-left"
                >
                  <div className="flex items-center space-x-2">
                    <Github className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                    <span>GitHub Remote Sync</span>
                  </div>
                  {gitSyncStatus && gitSyncStatus.ahead > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-600 dark:text-amber-400 font-bold">
                      ↑{gitSyncStatus.ahead}
                    </span>
                  )}
                </button>
              )}

              {/* Dependency Doctor */}
              <button
                onClick={() => {
                  setIsToolsOpen(false);
                  onOpenDoctor();
                }}
                className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-200 transition text-left"
              >
                <div className="flex items-center space-x-2">
                  <Activity className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                  <span>TeX Diagnostics & Doctor</span>
                </div>
                {isDoctorHealthy !== null && (
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isDoctorHealthy ? 'bg-scholarly dark:bg-scholarly-dark' : 'bg-diagnostic dark:bg-diagnostic-dark'
                    }`}
                  />
                )}
              </button>

              {/* Clean Build Cache */}
              {onCleanBuild && (
                <button
                  onClick={() => {
                    setIsToolsOpen(false);
                    onCleanBuild();
                  }}
                  className="w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-200 transition text-left"
                >
                  <Eraser className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                  <span>Clean Build Cache</span>
                </button>
              )}

              {/* Reveal in File Explorer */}
              <button
                onClick={async () => {
                  setIsToolsOpen(false);
                  try {
                    const res = await fetch('/api/system/reveal-in-explorer', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ projectId }),
                    });
                    const data = await res.json();
                    if (res.ok && data.success) {
                      onShowToast?.(`Opened in File Explorer: ${data.path}`, 'info');
                    } else {
                      onShowToast?.(data.error || 'Failed to open File Explorer.', 'error');
                    }
                  } catch (err: any) {
                    onShowToast?.(`Connection error: ${err.message}`, 'error');
                  }
                }}
                className="w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-200 transition text-left"
              >
                <FolderOpen className="w-4 h-4 text-scholarly-teal dark:text-scholarly-tealDark" />
                <span>Reveal in File Explorer</span>
              </button>

              {/* Add Desktop Shortcut */}
              <div className="pt-1 border-t border-surface-lightBorder dark:border-surface-darkBorder">
                <button
                  onClick={handleAddShortcut}
                  disabled={isAddingShortcut}
                  className="w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-200 transition text-left disabled:opacity-50"
                >
                  {isAddingShortcut ? (
                    <Loader2 className="w-4 h-4 animate-spin text-scholarly" />
                  ) : shortcutAdded ? (
                    <Check className="w-4 h-4 text-scholarly" />
                  ) : (
                    <MonitorUp className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                  )}
                  <span>{shortcutAdded ? 'Shortcut Added!' : 'Add Desktop Shortcut'}</span>
                </button>
                {onCheckForUpdates && (
                  <button
                    onClick={() => {
                      setIsToolsOpen(false);
                      onCheckForUpdates();
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-200 transition text-left"
                  >
                    <div className="flex items-center space-x-2">
                      <ArrowDownToLine className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      <span>Check for Updates</span>
                    </div>
                    {hasUpdate && (
                      <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[10px] font-bold">New</span>
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-surface-lightBorder dark:bg-surface-darkBorder mx-1" />

        {/* Dark/Light Toggle */}
        <button
          onClick={toggleTheme}
          title="Toggle Light / Dark Mode"
          className="flex items-center justify-center w-8 h-8 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-stone-700" />}
        </button>

        {/* Full Screen Zen Mode Toggle */}
        {onToggleFullscreen && (
          <button
            onClick={onToggleFullscreen}
            title={
              isFullscreen
                ? 'Exit Full Screen Zen Mode (F11, Ctrl+Shift+F, or Esc)'
                : 'Enter Full Screen Zen Mode (F11 or Ctrl+Shift+F)'
            }
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition border btn-tactile ${
              isFullscreen
                ? 'bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-scholarly dark:text-scholarly-dark shadow-xs border-scholarly/20 dark:border-scholarly-dark/30'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder'
            }`}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        )}
      </div>
    </header>
  );
};
