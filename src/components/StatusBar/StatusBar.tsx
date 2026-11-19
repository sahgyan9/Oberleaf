import React, { useState, useEffect, useRef } from 'react';
import { FolderOpen, Activity, CheckCircle2, Loader2, Cpu, FileCode, Type, FileText, AlertTriangle, XCircle } from 'lucide-react';
import { describeWordCount, type WordCount } from '../../utils/wordCount';

interface StatusBarProps {
  projectId?: string;
  projectName?: string;
  activeFilePath?: string;
  isCompiling: boolean;
  compileDuration: number | null;
  /** How the last compile ended; 'failed' wrote no PDF, 'errors' wrote one despite errors */
  compileStatus?: 'idle' | 'compiling' | 'success' | 'errors' | 'failed';
  cursorLine?: number;
  cursorColumn?: number;
  isDoctorHealthy: boolean | null;
  isLoadingFile?: boolean;
  /** Words in the open file; omitted for files that are not LaTeX */
  wordCount?: WordCount | null;
  /** Pages in the current PDF; null when there is no PDF or the count is unknown */
  pageCount?: number | null;
  /** Page in view in the PDF viewer; null when the viewer is closed */
  currentPage?: number | null;
  onOpenDoctor: () => void;
  onShowToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

const SEPARATOR = <span aria-hidden="true" className="flex-shrink-0 text-stone-300 dark:text-stone-700">|</span>;

export const StatusBar: React.FC<StatusBarProps> = ({
  projectId,
  projectName,
  activeFilePath,
  isCompiling,
  compileDuration,
  compileStatus,
  cursorLine,
  cursorColumn,
  isDoctorHealthy,
  isLoadingFile = false,
  wordCount,
  pageCount = null,
  currentPage = null,
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

  const serverAddress = window.location.host;

  return (
    // One line, always: every item is nowrap, the right group keeps its width
    // and the left group gives way, truncating the file path first. On a
    // narrow window the items used to wrap onto a second line and overflow
    // the bar.
    <footer className="h-7 w-full bg-surface-lightPanel dark:bg-surface-darkPanel border-t border-surface-lightBorder dark:border-surface-darkBorder px-3 flex items-center justify-between gap-3 text-[11px] font-mono select-none z-30 transition-colors flex-shrink-0 text-stone-600 dark:text-stone-400 whitespace-nowrap overflow-hidden">
      {/* Left: server, compile state, file */}
      <div className="flex items-center gap-2.5 min-w-0 overflow-hidden">
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0" title={`Oberleaf is running on this computer at ${serverAddress}`}>
          <span className="w-2 h-2 rounded-full bg-scholarly dark:bg-scholarly-dark" />
          <span className="font-medium text-stone-700 dark:text-stone-300">Local</span>
        </div>

        <span className="hidden md:inline">{SEPARATOR}</span>

        <div className="flex items-center gap-1.5 flex-shrink-0" role="status" aria-live="polite">
          {isCompiling ? (
            <span className="flex items-center gap-1.5 text-scholarly dark:text-scholarly-dark">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Compiling {(elapsedMs / 1000).toFixed(1)}s</span>
            </span>
          ) : compileStatus === 'failed' ? (
            <span className="flex items-center gap-1 text-crimson dark:text-crimson-dark">
              <XCircle className="w-3 h-3" />
              <span>No PDF</span>
            </span>
          ) : compileDuration !== null && compileStatus === 'errors' ? (
            <span className="flex items-center gap-1 text-diagnostic dark:text-diagnostic-dark">
              <AlertTriangle className="w-3 h-3" />
              <span>Built with errors in {(compileDuration / 1000).toFixed(2)}s</span>
            </span>
          ) : compileDuration !== null ? (
            <span className="flex items-center gap-1 text-scholarly dark:text-scholarly-dark">
              <CheckCircle2 className="w-3 h-3" />
              <span>Built in {(compileDuration / 1000).toFixed(2)}s</span>
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              <span>Ready</span>
            </span>
          )}
        </div>

        {projectName && (
          <>
            {SEPARATOR}
            <div className="flex items-center gap-1.5 min-w-0 text-stone-700 dark:text-stone-300" title={`${projectName} / ${activeFilePath ?? ''}`}>
              <FileCode className="w-3 h-3 text-stone-400 flex-shrink-0" />
              <span className="truncate min-w-0">
                <span className="hidden lg:inline">{projectName} / </span>
                {activeFilePath}
              </span>
              {isLoadingFile && <Loader2 className="w-3 h-3 animate-spin flex-shrink-0 text-stone-400" />}
            </div>
          </>
        )}
      </div>

      {/* Right: page count, word count, folder, cursor, diagnostics */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {pageCount !== null && (
          <>
            <span
              className="flex items-center gap-1"
              title={
                currentPage !== null && currentPage <= pageCount
                  ? `Viewing page ${currentPage} of ${pageCount} in the PDF from the last compile.`
                  : `The PDF from the last compile has ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`
              }
            >
              <FileText className="w-3 h-3 text-stone-400" />
              {currentPage !== null && currentPage <= pageCount ? (
                <span>
                  <span className="hidden sm:inline">Page </span>
                  {currentPage.toLocaleString()} of {pageCount.toLocaleString()}
                </span>
              ) : (
                <span>
                  {pageCount.toLocaleString()} <span className="hidden sm:inline">{pageCount === 1 ? 'page' : 'pages'}</span>
                </span>
              )}
            </span>
            {SEPARATOR}
          </>
        )}
        {wordCount && (
          <>
            <span className="flex items-center gap-1" title={describeWordCount(wordCount)}>
              <Type className="w-3 h-3 text-stone-400" />
              <span>
                {wordCount.words.toLocaleString()} <span className="hidden sm:inline">words</span>
              </span>
            </span>
            {SEPARATOR}
          </>
        )}

        <button
          type="button"
          onClick={handleRevealInExplorer}
          disabled={isOpeningExplorer}
          aria-label="Open the project folder in File Explorer"
          title="Open the project folder in File Explorer"
          className="flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle hover:text-stone-900 dark:hover:text-stone-100 transition font-sans font-medium"
        >
          {isOpeningExplorer ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3.5 h-3.5" />}
          <span className="hidden xl:inline">Open Folder</span>
        </button>

        {cursorLine !== undefined && cursorColumn !== undefined && (
          <>
            {SEPARATOR}
            <span>
              Ln {cursorLine}, Col {cursorColumn}
            </span>
          </>
        )}

        {SEPARATOR}

        <button
          type="button"
          onClick={onOpenDoctor}
          aria-label={isDoctorHealthy === false ? 'TeX Doctor: something needs attention' : 'TeX Doctor'}
          className={`flex items-center gap-1 px-1.5 py-0.5 rounded transition font-sans font-medium ${
            isDoctorHealthy === false
              ? 'bg-diagnostic/10 text-diagnostic dark:text-diagnostic-dark hover:bg-diagnostic/20'
              : 'hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle hover:text-stone-900 dark:hover:text-stone-100'
          }`}
          title="Check the LaTeX installation and this document"
        >
          <Activity className="w-3 h-3" />
          <span className="hidden lg:inline">TeX Doctor</span>
        </button>
      </div>
    </footer>
  );
};
