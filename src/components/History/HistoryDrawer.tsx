import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  GitCommit,
  RotateCcw,
  Plus,
  RefreshCw,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Tag,
  Loader2,
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { useTheme } from '../../context/ThemeContext';

export interface HistoryCommit {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author_name: string;
}

export interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  activeFilePath: string;
  onRevertSuccess: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  projectId,
  activeFilePath,
  onRevertSuccess,
}) => {
  const { theme } = useTheme();
  const [commits, setCommits] = useState<HistoryCommit[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [selectedCommit, setSelectedCommit] = useState<HistoryCommit | null>(null);
  const [diffData, setDiffData] = useState<{
    filePath: string;
    oldContent: string;
    newContent: string;
    diff: string;
  } | null>(null);
  const [isLoadingDiff, setIsLoadingDiff] = useState<boolean>(false);

  // Checkpoint creation state
  const [checkpointName, setCheckpointName] = useState<string>('');
  const [isCreatingCheckpoint, setIsCreatingCheckpoint] = useState<boolean>(false);
  const [checkpointStatus, setCheckpointStatus] = useState<string | null>(null);

  // Revert confirmation state
  const [showConfirmRevert, setShowConfirmRevert] = useState<boolean>(false);
  const [isReverting, setIsReverting] = useState<boolean>(false);

  // Load Git History Commits
  const fetchHistory = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/history`);
      if (res.ok) {
        const data: HistoryCommit[] = await res.json();
        setCommits(data);
        if (data.length > 0 && !selectedCommit) {
          setSelectedCommit(data[0]);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [projectId, selectedCommit]);

  useEffect(() => {
    if (isOpen) {
      fetchHistory();
    }
  }, [isOpen, fetchHistory]);

  // Load Diff for Selected Commit
  const fetchDiff = useCallback(
    async (commit: HistoryCommit) => {
      if (!projectId || !commit) return;
      setIsLoadingDiff(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/history/${commit.hash}/diff?file=${encodeURIComponent(
            activeFilePath
          )}`
        );
        if (res.ok) {
          const data = await res.json();
          setDiffData(data);
        }
      } catch {
        // ignore
      } finally {
        setIsLoadingDiff(false);
      }
    },
    [projectId, activeFilePath]
  );

  useEffect(() => {
    if (selectedCommit) {
      fetchDiff(selectedCommit);
    }
  }, [selectedCommit, fetchDiff]);

  // Create Checkpoint Handler
  const handleCreateCheckpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkpointName.trim() || isCreatingCheckpoint) return;

    setIsCreatingCheckpoint(true);
    setCheckpointStatus(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/history/checkpoint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: checkpointName.trim() }),
      });

      if (res.ok) {
        setCheckpointName('');
        setCheckpointStatus('Checkpoint preserved.');
        await fetchHistory();
        setTimeout(() => setCheckpointStatus(null), 3000);
      }
    } catch {
      setCheckpointStatus('Failed to create checkpoint.');
    } finally {
      setIsCreatingCheckpoint(false);
    }
  };

  // Revert / Restore Project Handler
  const handleRevert = async () => {
    if (!selectedCommit || isReverting) return;
    setIsReverting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/history/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: selectedCommit.hash }),
      });

      if (res.ok) {
        setShowConfirmRevert(false);
        onRevertSuccess();
        await fetchHistory();
      } else {
        const err = await res.json();
        alert(`Restore failed: ${err.error}`);
      }
    } catch (e: any) {
      alert(`Restore error: ${e.message}`);
    } finally {
      setIsReverting(false);
    }
  };

  const formatCommitDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

      if (diffSec < 60) return 'Just now';
      if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
      if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 font-sans">
      <div className="w-full max-w-5xl h-full bg-surface-lightPanel dark:bg-surface-darkPanel border-l border-surface-lightBorder dark:border-surface-darkBorder flex flex-col shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Top Header */}
        <div className="h-14 px-4 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between bg-surface-light dark:bg-surface-dark flex-shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-center text-scholarly dark:text-scholarly-dark">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-serif font-semibold text-stone-900 dark:text-stone-100 flex items-center space-x-2">
                <span>Version History & Git Checkpoints</span>
                <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-surface-lightBorder dark:border-surface-darkBorder">
                  Local Git
                </span>
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Visual side-by-side diff comparison and 1-click restore without cloud limitations
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={fetchHistory}
              disabled={isLoading}
              title="Refresh Timeline"
              className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition btn-tactile"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-scholarly' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition btn-tactile"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Checkpoint Creation Bar */}
        <div className="px-4 py-3 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
          <form onSubmit={handleCreateCheckpoint} className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Tag className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={checkpointName}
                onChange={(e) => setCheckpointName(e.target.value)}
                placeholder="Name a checkpoint (e.g., Before rewriting methodology, Submitted draft v1)..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 placeholder:text-stone-400 font-sans"
              />
            </div>
            <button
              type="submit"
              disabled={!checkpointName.trim() || isCreatingCheckpoint}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white font-medium text-xs transition disabled:opacity-50 flex-shrink-0 btn-tactile shadow-xs"
            >
              {isCreatingCheckpoint ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              <span>Save Checkpoint</span>
            </button>
          </form>

          {checkpointStatus && (
            <p className="text-[11px] text-scholarly dark:text-scholarly-dark mt-1.5 flex items-center space-x-1 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              <span>{checkpointStatus}</span>
            </p>
          )}
        </div>

        {/* Main Content Area: 2 Columns (Timeline List + Diff Viewer) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Timeline Commits */}
          <div className="w-80 border-r border-surface-lightBorder dark:border-surface-darkBorder flex flex-col bg-surface-light dark:bg-surface-dark flex-shrink-0">
            <div className="px-3 py-2 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between text-xs text-stone-500">
              <span className="font-semibold uppercase tracking-wider text-[10px]">
                Snapshots ({commits.length})
              </span>
              <span className="text-[10px] text-stone-400 font-mono">click to diff</span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {commits.length === 0 && !isLoading && (
                <div className="p-4 text-center text-xs text-stone-400 font-sans">
                  <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-40 text-stone-500" />
                  <p>No commits recorded yet.</p>
                  <p className="text-[10px] mt-1 text-stone-500">
                    Snapshots are created automatically before every compile.
                  </p>
                </div>
              )}

              {commits.map((commit) => {
                const isSelected = selectedCommit?.hash === commit.hash;
                const isCheckpoint = commit.message.toLowerCase().includes('checkpoint');
                const isAutoCompile = commit.message.toLowerCase().includes('snapshot');

                return (
                  <button
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit)}
                    className={`w-full text-left p-2.5 rounded-lg border transition text-xs flex flex-col space-y-1 relative group btn-tactile ${
                      isSelected
                        ? 'bg-stone-200/70 dark:bg-stone-800 border-l-2 border-scholarly dark:border-scholarly-dark shadow-xs'
                        : 'bg-surface-lightPanel dark:bg-surface-darkPanel border-surface-lightBorder dark:border-surface-darkBorder hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 font-medium">
                        {commit.shortHash}
                      </span>
                      <span className="text-[10px] text-stone-400 flex items-center space-x-1">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatCommitDate(commit.date)}</span>
                      </span>
                    </div>

                    <div className="flex items-start space-x-1.5">
                      {isCheckpoint ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-scholarly dark:text-scholarly-dark uppercase tracking-wider flex-shrink-0 mt-0.5">
                          Checkpoint
                        </span>
                      ) : isAutoCompile ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400 uppercase tracking-wider flex-shrink-0 mt-0.5">
                          Auto
                        </span>
                      ) : null}
                      <p className="text-xs text-stone-800 dark:text-stone-200 font-medium line-clamp-2 leading-relaxed">
                        {commit.message}
                      </p>
                    </div>

                    <div className="text-[10px] text-stone-400 truncate">
                      by {commit.author_name || 'Author'}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Visual Side-by-Side Diff Editor */}
          <div className="flex-1 flex flex-col bg-surface-lightPanel dark:bg-surface-darkPanel overflow-hidden">
            {/* Diff Header */}
            <div className="h-11 px-4 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between text-xs bg-surface-lightSubtle dark:bg-surface-darkSubtle flex-shrink-0">
              <div className="flex items-center space-x-2">
                <FileCode className="w-4 h-4 text-scholarly dark:text-scholarly-dark" />
                <span className="font-mono font-medium text-stone-900 dark:text-stone-100">
                  {activeFilePath}
                </span>
                {selectedCommit && (
                  <span className="text-[11px] text-stone-500 font-mono">
                    (Comparing snapshot <span className="text-scholarly dark:text-scholarly-dark">{selectedCommit.shortHash}</span> with current)
                  </span>
                )}
              </div>

              {selectedCommit && (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowConfirmRevert(true)}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded bg-crimson-subtle dark:bg-crimson-darkSubtle text-crimson dark:text-crimson-dark border border-crimson/30 hover:bg-crimson/20 transition text-xs font-medium btn-tactile"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Restore this version</span>
                  </button>
                </div>
              )}
            </div>

            {/* Monaco DiffEditor Viewport */}
            <div className="flex-1 relative overflow-hidden">
              {isLoadingDiff ? (
                <div className="h-full flex items-center justify-center space-x-2 text-xs text-stone-400">
                  <Loader2 className="w-4 h-4 animate-spin text-scholarly" />
                  <span>Loading diff comparison...</span>
                </div>
              ) : diffData ? (
                <DiffEditor
                  height="100%"
                  language="latex"
                  theme={theme === 'dark' ? 'brandDark' : 'vs'}
                  original={diffData.oldContent}
                  modified={diffData.newContent}
                  options={{
                    fontSize: 13,
                    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                    readOnly: true,
                    renderSideBySide: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    automaticLayout: true,
                    originalEditable: false,
                  }}
                />
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-stone-400 text-xs p-6 space-y-2">
                  <GitCommit className="w-8 h-8 opacity-40 text-stone-500" />
                  <p>Select a snapshot from the timeline on the left to view diff changes.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Confirmation Modal for Reverting */}
        {showConfirmRevert && selectedCommit && (
          <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in duration-150">
            <div className="w-full max-w-md bg-surface-lightPanel dark:bg-surface-darkPanel border border-crimson/40 rounded-xl p-5 shadow-2xl space-y-4">
              <div className="flex items-center space-x-3 text-crimson dark:text-crimson-dark">
                <div className="w-10 h-10 rounded-full bg-crimson-subtle dark:bg-crimson-darkSubtle flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">
                    Restore Project to Checkpoint?
                  </h3>
                  <p className="text-xs text-stone-500 font-mono">
                    Commit: <span>{selectedCommit.shortHash}</span>
                  </p>
                </div>
              </div>

              <div className="text-xs text-stone-700 dark:text-stone-300 bg-surface-lightSubtle dark:bg-surface-darkSubtle p-3 rounded-lg space-y-2 border border-surface-lightBorder dark:border-surface-darkBorder">
                <p>
                  This will restore all files in the project to match snapshot{' '}
                  <strong className="text-stone-900 dark:text-stone-100">"{selectedCommit.message}"</strong>.
                </p>
                <p className="text-stone-500 dark:text-stone-400 text-[11px]">
                  ✓ A safety checkpoint of your current state will be automatically created before restoring,
                  so no writing will be permanently lost.
                </p>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowConfirmRevert(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 transition btn-tactile"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRevert}
                  disabled={isReverting}
                  className="px-4 py-1.5 rounded-lg text-xs font-medium bg-crimson hover:bg-crimson-dark text-white transition flex items-center space-x-1.5 shadow-xs disabled:opacity-50 btn-tactile"
                >
                  {isReverting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Confirm Restore</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
