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
    <header className="h-14 border-b border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel px-4 flex items-center justify-between select-none relative z-30 transition-colors">
      {/* Left: Back to Projects, Brand, Project Switcher, and Save Status */}
      <div className="flex items-center space-x-3">
        {onBackToProjects && (
          <button
            onClick={onBackToProjects}
            title="Back to All Projects"
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 border border-surface-lightBorder dark:border-surface-darkBorder transition text-xs font-semibold btn-tactile mr-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </button>
        )}

        {/* Archival Paper & Scholarly Logo */}
        <div
          onClick={onBackToProjects}
          className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-surface-lightSubtle dark:bg-surface-darkSubtle p-0.5 border border-surface-lightBorder dark:border-surface-darkBorder shadow-xs flex-shrink-0 cursor-pointer"
          style={{ width: '32px', height: '32px' }}
        >
          <img
            src="/assets/icon.svg?v=4"
            alt="Oberleaf Logo"
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
            className="flex items-center space-x-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition text-left group border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile"
          >
            <div className="flex flex-col">
              <div className="flex items-center space-x-1.5">
                <span className="font-serif font-semibold text-sm tracking-tight text-[#1C1917] dark:text-[#F5F5F4]">
                  Ober<span className="text-scholarly dark:text-scholarly-dark italic font-normal">leaf</span>
                </span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 font-sans font-medium border border-stone-200 dark:border-stone-700">
                  Fast Engine
                </span>
              </div>
              <div className="flex items-center space-x-1 text-xs text-stone-500 dark:text-stone-400 font-medium truncate max-w-[180px]">
                <span className="truncate group-hover:text-[#1C1917] dark:group-hover:text-white transition">
                  {projectName || 'Select Project'}
                </span>
                <ChevronDown className="w-3 h-3 text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-200 flex-shrink-0" />
              </div>
            </div>
          </button>

          {/* Project List Dropdown Menu */}
          {isProjectsDropdownOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-72 rounded-xl bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder shadow-xl p-2 space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100">
              <div className="px-2.5 py-1 text-[11px] font-semibold text-stone-400 dark:text-stone-500 uppercase tracking-wider flex items-center justify-between font-sans">
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

              <div className="pt-1.5 border-t border-surface-lightBorder dark:border-surface-darkBorder">
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
              </div>
            </div>
          )}
        </div>

        {/* Unsaved / Saved State Indicator */}
        <div className="hidden lg:flex items-center space-x-1.5 pl-2 border-l border-surface-lightBorder dark:border-surface-darkBorder text-xs">
          <span className="font-mono text-stone-500 dark:text-stone-400 truncate max-w-[120px]">
            {activeFilePath}
          </span>
          {saveStatus === 'unsaved' && (
            <span className="flex items-center space-x-1 text-diagnostic dark:text-diagnostic-dark text-[11px] font-medium">
              <span>●</span>
              <span>Unsaved</span>
            </span>
          )}
          {saveStatus === 'saving' && (
            <span className="flex items-center space-x-1 text-stone-500 dark:text-stone-400 text-[11px] font-medium">
              <Loader2 className="w-2.5 h-2.5 animate-spin" />
              <span>Saving...</span>
            </span>
          )}
          {saveStatus === 'saved' && (
            <span className="flex items-center space-x-1 text-stone-500 dark:text-stone-400 text-[11px]">
              <CheckCircle2 className="w-3 h-3 text-scholarly dark:text-scholarly-dark" />
              <span>Saved</span>
            </span>
          )}
        </div>
      </div>

      {/* Center Actions: Tactile Oxford Green Recompile Button */}
      <div className="flex items-center space-x-3">
        <button
          onClick={onCompile}
          disabled={isCompiling}
          title="Compile LaTeX (Ctrl+Enter)"
          className="flex items-center space-x-2 bg-[#1B5E20] dark:bg-[#2EA043] hover:bg-[#164E1B] dark:hover:bg-[#278638] text-white px-3.5 py-1.5 rounded-md font-semibold text-xs transition shadow-sm active:translate-y-[0.5px] active:scale-[0.99] disabled:opacity-50 btn-tactile cursor-pointer"
        >
          {isCompiling ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current" />
          )}
          <span>{isCompiling ? 'Compiling...' : 'Recompile'}</span>
          <kbd className="hidden sm:inline-flex items-center ml-1 text-[10px] bg-black/25 text-white/95 px-1.5 py-0.2 rounded font-mono font-normal">
            Ctrl+↵
          </kbd>
        </button>

        {compileDuration !== null && !isCompiling && (
          <span className="text-xs text-stone-500 dark:text-stone-400 font-mono hidden md:inline">
            {(compileDuration / 1000).toFixed(1)}s local
          </span>
        )}
      </div>

      {/* Right Controls: View Mode, Dependency Doctor, Dark/Light */}
      <div className="flex items-center space-x-1.5">
        {/* Layout Switchers */}
        <div className="flex items-center bg-surface-lightSubtle dark:bg-surface-darkSubtle p-0.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder">
          <button
            onClick={() => onViewModeChange('code')}
            title="Full Code Mode (Ctrl+7)"
            className={`p-1.5 rounded-md text-xs transition btn-tactile ${
              viewMode === 'code'
                ? 'bg-surface-lightPanel dark:bg-stone-800 text-scholarly dark:text-scholarly-dark shadow-xs'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('split')}
            title="Split Mode (Ctrl+8)"
            className={`p-1.5 rounded-md text-xs transition btn-tactile ${
              viewMode === 'split'
                ? 'bg-surface-lightPanel dark:bg-stone-800 text-scholarly dark:text-scholarly-dark shadow-xs'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
            }`}
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onViewModeChange('pdf')}
            title="Full PDF Mode (Ctrl+9, double/triple to toggle)"
            className={`p-1.5 rounded-md text-xs transition btn-tactile ${
              viewMode === 'pdf'
                ? 'bg-surface-lightPanel dark:bg-stone-800 text-scholarly dark:text-scholarly-dark shadow-xs'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-200'
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
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-700 dark:text-stone-300 hover:text-scholarly dark:hover:text-scholarly-dark hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder btn-tactile"
          >
            <History className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
            <span className="hidden sm:inline">History</span>
          </button>
        )}

        {/* Dependency Doctor Button */}
        <button
          onClick={onOpenDoctor}
          title="Dependency Doctor & TeX Diagnostics"
          className="relative p-2 rounded-md text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition btn-tactile"
        >
          <Activity className="w-4 h-4" />
          {isDoctorHealthy !== null && (
            <span
              className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ${
                isDoctorHealthy ? 'bg-scholarly dark:bg-scholarly-dark' : 'bg-diagnostic dark:bg-diagnostic-dark'
              }`}
            />
          )}
        </button>

        {/* Dark/Light Toggle */}
        <button
          onClick={toggleTheme}
          title="Toggle Light / Dark Mode"
          className="p-2 rounded-md text-stone-500 hover:text-stone-900 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition btn-tactile"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-300" /> : <Moon className="w-4 h-4 text-stone-700" />}
        </button>
      </div>
    </header>
  );
};
