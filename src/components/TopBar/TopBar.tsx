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
  Wrench,
  ArrowDownToLine,
  Search,
  Power,
} from 'lucide-react';
import { OverflowBar, OverflowItem } from '../Common/OverflowBar';
import { useTheme } from '../../context/ThemeContext';

export type ViewMode = 'split' | 'code' | 'pdf';

export interface ProjectInfo {
  id: string;
  name: string;
  template: string;
  updatedAt: string;
  lastModifiedRelative?: string;
  owner?: string;
  isArchived?: boolean;
  hasPdf?: boolean;
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
  onOpenCommandPalette?: () => void;
  onQuit?: () => void;
}

const ICON_ACTION =
  'flex items-center justify-center w-8 h-8 rounded-lg text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile';
const LABEL_ACTION_BASE =
  'flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition border btn-tactile whitespace-nowrap';
const LABEL_ACTION_IDLE =
  'text-stone-700 dark:text-stone-300 hover:text-scholarly dark:hover:text-scholarly-dark hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder';
const LABEL_ACTION = `${LABEL_ACTION_BASE} ${LABEL_ACTION_IDLE}`;

const VIEW_MODES: { id: ViewMode; label: string; menuLabel: string; hint: string; Icon: typeof Code2 }[] = [
  { id: 'code', label: 'Full Code Mode (Ctrl+7)', menuLabel: 'Editor only', hint: 'Ctrl+7', Icon: Code2 },
  { id: 'split', label: 'Split Mode (Ctrl+8)', menuLabel: 'Editor and PDF', hint: 'Ctrl+8', Icon: Columns },
  { id: 'pdf', label: 'Full PDF Mode (Ctrl+9)', menuLabel: 'PDF only', hint: 'Ctrl+9', Icon: FileText },
];

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
  onOpenCommandPalette,
  onQuit,
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isProjectsDropdownOpen, setIsProjectsDropdownOpen] = useState(false);
  const [isToolsOpen, setIsToolsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  const [isAddingShortcut, setIsAddingShortcut] = useState(false);
  const [shortcutAdded, setShortcutAdded] = useState(false);
  const [hasShortcut, setHasShortcut] = useState<boolean | null>(() => {
    const cached = localStorage.getItem('oberleaf_has_shortcut');
    return cached !== null ? cached === 'true' : null;
  });

  useEffect(() => {
    let isMounted = true;
    const checkShortcut = async () => {
      try {
        const res = await fetch('/api/system/shortcut-status');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success) {
            setHasShortcut(!!data.exists);
            localStorage.setItem('oberleaf_has_shortcut', data.exists ? 'true' : 'false');
          }
        }
      } catch {
        // Silently preserve cached status
      }
    };
    checkShortcut();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddShortcut = async () => {
    setIsAddingShortcut(true);
    setShortcutAdded(false);
    try {
      const res = await fetch('/api/system/create-shortcut', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setShortcutAdded(true);
        setHasShortcut(true);
        localStorage.setItem('oberleaf_has_shortcut', 'true');
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
    <header className="h-14 border-b border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel px-3 sm:px-4 flex items-center select-none relative z-30 transition-colors gap-2 min-w-0">
      {/* Left: Back to Projects, Brand / Project Switcher, and Save Status */}
      <div className="flex items-center gap-2 min-w-0 flex-shrink">
        {onBackToProjects && (
          <button
            aria-label="Back to All Projects"
            onClick={onBackToProjects}
            title="Back to All Projects"
            className="flex items-center space-x-1.5 h-8 px-2.5 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 border border-surface-lightBorder dark:border-surface-darkBorder transition text-xs font-semibold btn-tactile flex-shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </button>
        )}

        {/* Brand & Project Switcher Dropdown */}
        <div className="relative min-w-0" ref={dropdownRef}>
          <button
            aria-label="Switch or Browse Projects"
            onClick={() => setIsProjectsDropdownOpen((prev) => !prev)}
            title="Switch or Browse Projects"
            className="flex items-center gap-2 h-8 px-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition text-left group border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile max-w-full min-w-0"
          >
            <div className="w-5 h-5 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src="/assets/icon.svg?v=4"
                alt="Oberleaf"
                className="w-full h-full object-contain"
              />
            </div>
            <span className="hidden xl:inline font-serif font-semibold text-sm tracking-tight text-[#1C1917] dark:text-[#F5F5F4] whitespace-nowrap">
              Ober<span className="text-scholarly dark:text-scholarly-dark italic font-normal">leaf</span>
            </span>
            <span className="hidden xl:inline text-stone-300 dark:text-stone-600 font-light text-xs select-none">/</span>
            <span className="text-xs font-medium text-stone-700 dark:text-stone-300 group-hover:text-[#1C1917] dark:group-hover:text-white transition truncate min-w-0 max-w-[180px]" title={projectName}>
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
      <div className="flex items-center gap-2 flex-shrink-0 px-1">
        <button
          aria-label="Compile LaTeX (Ctrl+Enter)"
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
          <kbd className="hidden md:inline-flex items-center ml-1 text-[10px] bg-black/25 text-white/95 px-1.5 py-0.5 rounded font-mono font-normal">
            Ctrl+↵
          </kbd>
        </button>

        {compileDuration !== null && !isCompiling && (
          <span className="text-xs text-stone-500 dark:text-stone-400 font-mono hidden xl:inline whitespace-nowrap">
            {(compileDuration / 1000).toFixed(1)}s local
          </span>
        )}
      </div>

      {/* Right controls. They sit in an OverflowBar so that on a narrow window the
          labels drop first and the rest move into its More menu; before this
          the row was fixed-width and its last buttons were pushed off screen. */}
      <OverflowBar
        className="flex-1"
        gap={6}
        moreLabel="More actions"
        moreButtonClassName={ICON_ACTION}
        items={[
          { id: 'spacer', spacer: true, render: () => null },
          {
            id: 'view-mode',
            priority: 9,
            render: () => (
              <div className="flex items-center bg-surface-lightSubtle dark:bg-surface-darkSubtle p-0.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder h-8">
                {VIEW_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-label={m.label}
                    aria-pressed={viewMode === m.id}
                    onClick={() => onViewModeChange(m.id)}
                    title={m.label}
                    className={`h-7 px-2 rounded-md text-xs transition btn-tactile flex items-center justify-center ${
                      viewMode === m.id
                        ? 'bg-surface-lightPanel dark:bg-stone-800 text-scholarly dark:text-scholarly-dark shadow-xs font-medium'
                        : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    <m.Icon className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            ),
            menu: VIEW_MODES.map((m) => ({
              label: m.menuLabel,
              icon: <m.Icon className="w-3.5 h-3.5" />,
              onClick: () => onViewModeChange(m.id),
              active: viewMode === m.id,
              hint: m.hint,
            })),
          },
          ...(onOpenCommandPalette
            ? [
                {
                  id: 'palette',
                  priority: 7,
                  render: (compact: boolean) => (
                    <button
                      type="button"
                      aria-label="Search files, sections and commands (Ctrl+K)"
                      onClick={onOpenCommandPalette}
                      title="Search files, sections and commands (Ctrl+K)"
                      className={LABEL_ACTION}
                    >
                      <Search className="w-3.5 h-3.5" />
                      {!compact && <kbd className="font-mono text-[10px] text-stone-400 dark:text-stone-500">Ctrl+K</kbd>}
                    </button>
                  ),
                  menu: [{ label: 'Search and commands', icon: <Search className="w-3.5 h-3.5" />, onClick: onOpenCommandPalette, hint: 'Ctrl+K' }],
                } as OverflowItem,
              ]
            : []),
          ...(onOpenComments
            ? [
                {
                  id: 'comments',
                  priority: 5,
                  render: (compact: boolean) => (
                    <button
                      type="button"
                      aria-label="Review Comments (Alt+M)"
                      onClick={onOpenComments}
                      title="Review Comments (Alt+M)"
                      className={LABEL_ACTION}
                    >
                      <MessageSquare className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      {!compact && <span>Comments</span>}
                      {openCommentsCount > 0 && (
                        <span className="px-1.5 rounded-full bg-scholarly dark:bg-scholarly-dark text-white text-[10px] font-bold">
                          {openCommentsCount}
                        </span>
                      )}
                    </button>
                  ),
                  menu: [
                    {
                      label: openCommentsCount > 0 ? `Comments (${openCommentsCount} open)` : 'Comments',
                      icon: <MessageSquare className="w-3.5 h-3.5" />,
                      onClick: onOpenComments,
                      hint: 'Alt+M',
                    },
                  ],
                } as OverflowItem,
              ]
            : []),
          ...(onOpenCollab
            ? [
                {
                  id: 'collab',
                  priority: 4,
                  render: (compact: boolean) => (
                    <button
                      type="button"
                      aria-label="Live Peer-to-Peer Collaboration"
                      onClick={onOpenCollab}
                      title="Live Peer-to-Peer Collaboration"
                      className={`${LABEL_ACTION_BASE} ${
                        isCollabActive
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                          : LABEL_ACTION_IDLE
                      }`}
                    >
                      <Users className={`w-3.5 h-3.5 ${isCollabActive ? 'text-emerald-500' : ''}`} />
                      {(!compact || isCollabActive) && <span>{isCollabActive ? `Live (${collabPeersCount})` : 'Collab'}</span>}
                    </button>
                  ),
                  menu: [
                    {
                      label: isCollabActive ? `Collaboration: live (${collabPeersCount})` : 'Collaborate',
                      icon: <Users className="w-3.5 h-3.5" />,
                      onClick: onOpenCollab,
                    },
                  ],
                } as OverflowItem,
              ]
            : []),
          ...(onOpenHistory
            ? [
                {
                  id: 'history',
                  priority: 6,
                  render: (compact: boolean) => (
                    <button
                      type="button"
                      aria-label="Version History & Git Checkpoints"
                      onClick={onOpenHistory}
                      title="Version History & Git Checkpoints"
                      className={LABEL_ACTION}
                    >
                      <History className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
                      {!compact && <span>History</span>}
                    </button>
                  ),
                  menu: [{ label: 'Version history', icon: <History className="w-3.5 h-3.5" />, onClick: onOpenHistory }],
                } as OverflowItem,
              ]
            : []),
          ...(hasUpdate && onOpenUpdateModal
            ? [
                {
                  id: 'update',
                  priority: 8,
                  render: (compact: boolean) => (
                    <button
                      type="button"
                      aria-label="An Oberleaf update is available. View details and install."
                      onClick={onOpenUpdateModal}
                      title="An Oberleaf update is available. View details and install."
                      className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-500/25 transition btn-tactile whitespace-nowrap"
                    >
                      <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      {!compact && <span>Update Available</span>}
                    </button>
                  ),
                  menu: [{ label: 'Update available', icon: <ArrowDownToLine className="w-3.5 h-3.5" />, onClick: onOpenUpdateModal }],
                } as OverflowItem,
              ]
            : []),
          {
            id: 'sep-tools',
            separator: true,
            render: () => <div className="h-4 w-px bg-surface-lightBorder dark:bg-surface-darkBorder" />,
          },
          {
            // No menu entry: this one always stays in the bar.
            id: 'tools',
            priority: 100,
            render: () => (
              <div className="relative" ref={toolsRef}>
                <button
                  aria-label="Workspace Tools & Diagnostics"
                  onClick={() => setIsToolsOpen((prev) => !prev)}
                  title="Workspace Tools & Diagnostics"
                  className="relative flex items-center justify-center w-8 h-8 rounded-lg text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile"
                >
                  <Wrench className="w-4 h-4" />
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
                        <span>{shortcutAdded ? 'Shortcut Added!' : (hasShortcut ? 'Recreate Desktop Shortcut' : 'Add Desktop Shortcut')}</span>
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

                    {/* Quit: stops the background server */}
                    {onQuit && (
                      <div className="pt-1 border-t border-surface-lightBorder dark:border-surface-darkBorder">
                        <button
                          onClick={() => {
                            setIsToolsOpen(false);
                            onQuit();
                          }}
                          className="w-full flex items-center space-x-2 px-2.5 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-200 transition text-left"
                        >
                          <Power className="w-4 h-4 text-stone-700 dark:text-stone-300" />
                          <span>Quit Oberleaf</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'theme',
            priority: 2,
            render: () => (
              <button
                type="button"
                aria-label="Toggle Light / Dark Mode"
                onClick={toggleTheme}
                title="Toggle Light / Dark Mode"
                className={ICON_ACTION}
              >
                {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-stone-700" />}
              </button>
            ),
            menu: [
              {
                label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
                icon: theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />,
                onClick: toggleTheme,
              },
            ],
          },
          ...(onToggleFullscreen
            ? [
                {
                  id: 'fullscreen',
                  priority: 1,
                  render: () => (
                    <button
                      type="button"
                      aria-label={isFullscreen ? 'Exit Full Screen (F11, Ctrl+Shift+F, or Esc)' : 'Enter Full Screen (F11 or Ctrl+Shift+F)'}
                      onClick={onToggleFullscreen}
                      title={isFullscreen ? 'Exit Full Screen (F11, Ctrl+Shift+F, or Esc)' : 'Enter Full Screen (F11 or Ctrl+Shift+F)'}
                      className={
                        isFullscreen
                          ? 'flex items-center justify-center w-8 h-8 rounded-lg transition border btn-tactile bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-scholarly dark:text-scholarly-dark border-scholarly/20 dark:border-scholarly-dark/30'
                          : ICON_ACTION
                      }
                    >
                      {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                  ),
                  menu: [
                    {
                      label: isFullscreen ? 'Exit full screen' : 'Full screen',
                      icon: isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />,
                      onClick: onToggleFullscreen,
                      hint: 'F11',
                    },
                  ],
                } as OverflowItem,
              ]
            : []),
        ]}
      />
    </header>
  );
};
