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
}

export const TopBar: React.FC<TopBarProps> = ({
  projectName,
  projectId,
  projects,
  onSelectProject,
  onNewProject,
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
}) => {
  const { theme, toggleTheme } = useTheme();
  const [isProjectsDropdownOpen, setIsProjectsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsProjectsDropdownOpen(false);
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
    <header className="h-14 border-b border-surface-lightSubtle dark:border-surface-darkSubtle bg-surface-lightPanel dark:bg-surface-darkPanel px-4 flex items-center justify-between select-none relative z-30">
      {/* Left: Brand, Project Switcher, and Save Status */}
      <div className="flex items-center space-x-3">
        {/* Infinite Fold Mini Logo */}
        <div
          className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-[#0B0F19] p-1 border border-brand-cyan/30 shadow-sm shadow-brand-mint/20 flex-shrink-0"
          style={{ width: '32px', height: '32px' }}
        >
          <img
            src="/assets/icon.svg"
            alt="Overleaf Copy Logo"
            width={32}
            height={32}
            className="w-full h-full object-contain"
          />
        </div>

        {/* Brand & Project Switcher Dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setIsProjectsDropdownOpen((prev) => !prev)}
            title="Switch or Browse Projects"
            className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800/80 transition text-left group border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
          >
            <div className="flex flex-col">
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-white">
                  Overleaf <span className="text-brand-mint">Copy</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-indigo/10 dark:bg-brand-indigo/30 text-brand-indigo dark:text-brand-cyan font-mono">
                  local
                </span>
              </div>
              <div className="flex items-center space-x-1 text-xs text-slate-500 dark:text-slate-400 font-medium truncate max-w-[180px]">
                <span className="truncate group-hover:text-slate-900 dark:group-hover:text-white transition">
                  {projectName || 'Select Project'}
                </span>
                <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-200 flex-shrink-0" />
              </div>
            </div>
          </button>

          {/* Project List Dropdown Menu */}
          {isProjectsDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl bg-surface-lightPanel dark:bg-surface-darkPanel border border-slate-200 dark:border-slate-800 shadow-2xl p-2 space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Your Projects ({projects.length})</span>
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
                          ? 'bg-brand-indigo/15 dark:bg-brand-indigo/35 text-brand-indigo dark:text-brand-mint font-medium'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <FolderOpen className="w-3.5 h-3.5 text-brand-ocean flex-shrink-0" />
                        <div className="truncate">
                          <p className="truncate">{proj.name}</p>
                          <p className="text-[10px] text-slate-400 font-normal">
                            {formatDate(proj.updatedAt)}
                          </p>
                        </div>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-brand-mint flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>

              <div className="pt-1.5 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => {
                    setIsProjectsDropdownOpen(false);
                    onNewProject();
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 p-2 rounded-lg bg-brand-mint/10 hover:bg-brand-mint/20 text-brand-mint font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create New Project</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Unsaved / Saved State Indicator */}
        <div className="hidden lg:flex items-center space-x-1.5 pl-2 border-l border-slate-200 dark:border-slate-800 text-xs">
          <span className="font-mono text-slate-500 dark:text-slate-400 truncate max-w-[120px]">
            {activeFilePath}
          </span>
          {saveStatus === 'unsaved' && (
            <span className="flex items-center space-x-1 text-amber-500 text-[11px] font-medium animate-pulse">
              <span>●</span>
              <span>Unsaved</span>
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="flex items-center space-x-1 text-brand-cyan text-[11px] font-medium">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Saving...</span>
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center space-x-1 text-slate-400 dark:text-slate-500 text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-brand-mint/70" />
              <span>Saved</span>
            </span>
          )}
        </div>
      </div>

      {/* Center Actions: Recompile Button */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onCompile}
          disabled={isCompiling}
          title="Compile LaTeX (Ctrl+Enter)"
          className="flex items-center space-x-2 bg-brand-mint hover:brightness-110 active:scale-95 text-slate-950 px-4 py-1.5 rounded-md font-semibold text-xs transition shadow-md shadow-brand-mint/25 disabled:opacity-50"
        >
          {isCompiling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isCompiling ? 'Compiling...' : 'Recompile'}</span>
          <kbd className="hidden sm:inline-block text-[10px] bg-black/15 px-1 rounded font-mono font-normal">
            Ctrl+↵
          </kbd>
        </button>

        {compileDuration !== null && !isCompiling && (
          <span className="text-xs text-slate-400 font-mono hidden md:inline">
            {(compileDuration / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      {/* Right Controls: View Mode, Dependency Doctor, Dark/Light */}
      <div className="flex items-center space-x-1.5">
        {/* Layout Switchers */}
        <div className="flex items-center bg-surface-lightSubtle dark:bg-surface-darkSubtle p-0.5 rounded-lg border border-slate-200 dark:border-slate-800">
          <button
            onClick={() => onViewModeChange('code')}
            title="Full Code Mode (Ctrl+Shift+1)"
            className={`p-1.5 rounded-md text-xs transition ${
              viewMode === 'code'
                ? 'bg-white dark:bg-slate-800 text-brand-mint shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('split')}
            title="Split Mode (Ctrl+Shift+2)"
            className={`p-1.5 rounded-md text-xs transition ${
              viewMode === 'split'
                ? 'bg-white dark:bg-slate-800 text-brand-mint shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('pdf')}
            title="Full PDF Mode (Ctrl+Shift+3)"
            className={`p-1.5 rounded-md text-xs transition ${
              viewMode === 'pdf'
                ? 'bg-white dark:bg-slate-800 text-brand-mint shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* History & Checkpoints Button */}
        {onOpenHistory && (
          <button
            onClick={onOpenHistory}
            title="Version History & Git Checkpoints"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:text-brand-mint dark:hover:text-brand-mint hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <History className="w-3.5 h-3.5 text-brand-mint" />
            <span className="hidden sm:inline">History</span>
          </button>
        )}

        {/* Dependency Doctor Button */}
        <button
          onClick={onOpenDoctor}
          title="Dependency Doctor & TeX Diagnostics"
          className="relative p-2 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          <Activity className="w-4 h-4" />
          {isDoctorHealthy !== null && (
            <span
              className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                isDoctorHealthy ? 'bg-brand-mint' : 'bg-amber-500 animate-ping'
              }`}
            />
          )}
        </button>

        {/* Dark/Light Toggle */}
        <button
          onClick={toggleTheme}
          title="Toggle Light / Dark Mode"
          className="p-2 rounded-md text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-brand-indigo" />}
        </button>
      </div>
    </header>
  );
};
