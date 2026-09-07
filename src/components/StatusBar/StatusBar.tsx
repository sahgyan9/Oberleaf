import React, { useState, useEffect, useRef } from 'react';
import {
  FolderOpen,
  Activity,
  CheckCircle2,
  Loader2,
  Cpu,
  FileCode,
} from 'lucide-react';

interface StatusBarProps {
  projectId?: string;
  projectName?: string;
  activeFilePath?: string;
  isCompiling: boolean;
  compileDuration: number | null;
  cursorLine?: number;
  cursorColumn?: number;
  isDoctorHealthy: boolean | null;
  isLoadingFile?: boolean;
  onOpenDoctor: () => void;
  onShowToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const StatusBar: React.FC<StatusBarProps> = ({
  projectId,
  projectName,
  activeFilePath,
  isCompiling,
  compileDuration,
  cursorLine,
  cursorColumn,
  isDoctorHealthy,
  isLoadingFile = false,
  onOpenDoctor,
  onShowToast,
}) => {
  const [isOpeningExplorer, setIsOpeningExplorer] = useState(false);

  // Compile timeouts are configurable up to "no limit", so a long build used to
  // sit on a static spinner with no way to tell progress from a hang.
  const [elapsedMs, setElapsedMs] = useState(0);
  const compileStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isCompiling) {
      compileStartRef.current = null;
      setElapsedMs(0);
      return;
    }
    compileStartRef.current = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => {
      if (compileStartRef.current !== null) {
        setElapsedMs(Date.now() - compileStartRef.current);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [isCompiling]);

  const handleRevealInExplorer = async () => {
    setIsOpeningExplorer(true);
    try {
      const res = await fetch('/api/system/reveal-in-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || undefined,
          filePath: activeFilePath || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        onShowToast?.(`Revealed in File Explorer: ${data.path}`, 'info');
      } else {
        onShowToast?.(data.error || 'Could not open File Explorer.', 'error');
      }
    } catch (err: any) {
      onShowToast?.(`Explorer connection error: ${err.message}`, 'error');
    } finally {
      setIsOpeningExplorer(false);
    }
  };

  return (
    <footer className="h-7 w-full bg-surface-lightPanel dark:bg-surface-darkPanel border-t border-surface-lightBorder dark:border-surface-darkBorder px-3 flex items-center justify-between text-[11px] font-mono select-none z-30 transition-colors flex-shrink-0 text-stone-600 dark:text-stone-400">
      {/* Left side: Server status & Compile state */}
      <div className="flex items-center space-x-3 overflow-hidden">
        {/* Local daemon badge */}
        <div className="flex items-center space-x-1.5" title="Oberleaf local server daemon running on port 3001">
          <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)] animate-pulse" />
          <span className="font-semibold text-stone-700 dark:text-stone-300">Local Daemon :3001</span>
        </div>

        <span className="text-stone-300 dark:text-stone-700">|</span>

        {/* Compiler engine state */}
        <div className="flex items-center space-x-1.5">
          {isCompiling ? (
            <div className="flex items-center space-x-1.5 text-scholarly-teal dark:text-scholarly-tealDark animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>
                Compiling {activeFilePath || 'document'}... {(elapsedMs / 1000).toFixed(1)}s
              </span>
            </div>
          ) : compileDuration !== null ? (
            <div className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="w-3 h-3" />
              <span>Built in {compileDuration.toFixed(2)}s</span>
            </div>
          ) : (
            <div className="flex items-center space-x-1 text-stone-500 dark:text-stone-400">
              <Cpu className="w-3 h-3" />
              <span>LaTeX Engine Ready</span>
            </div>
          )}
        </div>

        {/* Active Project & File indicator */}
        {projectName && (
          <>
            <span className="text-stone-300 dark:text-stone-700 hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center space-x-1.5 text-stone-700 dark:text-stone-300 truncate max-w-[240px]">
              <FileCode className="w-3 h-3 text-stone-400 flex-shrink-0" />
              <span className="truncate">{projectName}</span>
              {activeFilePath && <span className="text-stone-400">/ {activeFilePath}</span>}
              {isLoadingFile && (
                <span className="flex items-center space-x-1 text-stone-400">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Opening...</span>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* Right side: Explorer Reveal, Editor Coordinates, TeX Doctor */}
      <div className="flex items-center space-x-2.5 flex-shrink-0">
        {/* Reveal in Explorer Action */}
        <button
          onClick={handleRevealInExplorer}
          disabled={isOpeningExplorer}
          title="Open project folder in Windows File Explorer"
          className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle hover:text-stone-900 dark:hover:text-stone-100 transition text-[11px] font-sans font-medium text-stone-600 dark:text-stone-300 cursor-pointer"
        >
          {isOpeningExplorer ? (
            <Loader2 className="w-3 h-3 animate-spin text-stone-500" />
          ) : (
            <FolderOpen className="w-3.5 h-3.5 text-scholarly-teal dark:text-scholarly-tealDark" />
          )}
          <span className="hidden md:inline">Reveal in Explorer</span>
        </button>

        <span className="text-stone-300 dark:text-stone-700">|</span>

        {/* Cursor Position */}
        {cursorLine !== undefined && cursorColumn !== undefined && (
          <>
            <span className="text-stone-500 dark:text-stone-400">
              Ln {cursorLine}, Col {cursorColumn}
            </span>
            <span className="text-stone-300 dark:text-stone-700">|</span>
          </>
        )}

        {/* Dependency Doctor Pill */}
        <button
          onClick={onOpenDoctor}
          className={`flex items-center space-x-1 px-1.5 py-0.5 rounded transition ${
            isDoctorHealthy === false
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
              : 'hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-600 dark:text-stone-300'
          }`}
          title="TeX Toolchain Health Doctor"
        >
          <Activity className="w-3 h-3" />
          <span className="hidden lg:inline">TeX Doctor</span>
        </button>
      </div>
    </footer>
  );
};
