import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  GitCommit,
  RotateCcw,
  RefreshCw,
  X,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileCode,
  Tag,
  Loader2,
  ArrowUpCircle,
  ArrowDownCircle,
  Github,
  Bookmark,
} from 'lucide-react';
import { DiffEditor } from '@monaco-editor/react';
import { useTheme } from '../../context/ThemeContext';

export interface HistoryCommit {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author_name: string;
  isMilestone: boolean;
}

export interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  activeFilePath: string;
  onRevertSuccess: () => void;
  onOpenSyncModal?: () => void;
  onShowToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  projectId,
  activeFilePath,
  onRevertSuccess,
  onOpenSyncModal,
  onShowToast,
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

  // GitHub-Style Commit state
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [commitDescription, setCommitDescription] = useState<string>('');
  const [showDescriptionInput, setShowDescriptionInput] = useState<boolean>(false);
  const [isCommitting, setIsCommitting] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [commitStatus, setCommitStatus] = useState<string | null>(null);

  // Timeline Filter & Git Settings
  const [filterMode, setFilterMode] = useState<'all' | 'milestones'>('all');
  const [autoCommitOnCompile, setAutoCommitOnCompile] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<{
    ahead: number;
    behind: number;
    remoteUrl: string | null;
  } | null>(null);

  // Revert confirmation state
  const [showConfirmRevert, setShowConfirmRevert] = useState<boolean>(false);
  const [isReverting, setIsReverting] = useState<boolean>(false);

  // Fetch Sync Status
  const fetchSyncStatus = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/git/status`);
      if (res.ok) {
        const data = await res.json();
        setSyncStatus({
          ahead: data.ahead || 0,
          behind: data.behind || 0,
          remoteUrl: data.remoteUrl || null,
        });
      }
    } catch {
      // ignore
    }
  }, [projectId]);

  // Fetch Git Settings
  const fetchSettings = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/git/settings`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.autoCommitOnCompile === 'boolean') {
          setAutoCommitOnCompile(data.autoCommitOnCompile);
        }
      }
    } catch {
      // ignore
    }
  }, [projectId]);

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
      fetchSyncStatus();
      fetchSettings();
    }
  }, [isOpen, fetchHistory, fetchSyncStatus, fetchSettings]);

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

  // GitHub-style Commit & Push Handler
  const handleCommitExplicit = async (pushAfter: boolean = false) => {
    if (!commitMessage.trim() || isCommitting || isPushing) return;

    setIsCommitting(true);
    setCommitStatus(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commitMessage.trim(),
          description: commitDescription.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setCommitStatus(`Error: ${data.error || 'Commit failed'}`);
        return;
      }

      setCommitMessage('');
      setCommitDescription('');
      setShowDescriptionInput(false);
      await fetchHistory();
      await fetchSyncStatus();

      if (pushAfter) {
        if (!syncStatus?.remoteUrl) {
          setCommitStatus('Committed! Connect GitHub to push.');
          if (onOpenSyncModal) onOpenSyncModal();
        } else {
          setIsPushing(true);
          try {
            const pushRes = await fetch(`/api/projects/${projectId}/git/push`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({}),
            });
            const pushData = await pushRes.json();
            if (pushRes.ok) {
              setCommitStatus('Committed and pushed to GitHub!');
              await fetchSyncStatus();
            } else {
              setCommitStatus(`Committed locally. Push failed: ${pushData.error}`);
            }
          } catch (e: any) {
            setCommitStatus(`Committed locally. Push error: ${e.message}`);
          } finally {
            setIsPushing(false);
          }
        }
      } else {
        setCommitStatus('Version committed locally.');
      }

      setTimeout(() => setCommitStatus(null), 3500);
    } catch {
      setCommitStatus('Failed to create commit.');
    } finally {
      setIsCommitting(false);
    }
  };

  const handleToggleAutoCommit = async () => {
    const nextVal = !autoCommitOnCompile;
    setAutoCommitOnCompile(nextVal);
    try {
      await fetch(`/api/projects/${projectId}/git/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoCommitOnCompile: nextVal }),
      });
    } catch {
      // ignore
    }
  };

  const handleQuickPush = async () => {
    if (!syncStatus?.remoteUrl) {
      if (onOpenSyncModal) onOpenSyncModal();
      return;
    }
    setIsPushing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchSyncStatus();
      }
    } catch {
      // ignore
    } finally {
      setIsPushing(false);
    }
  };

  const handleQuickPull = async () => {
    if (!syncStatus?.remoteUrl) {
      if (onOpenSyncModal) onOpenSyncModal();
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        await fetchHistory();
        await fetchSyncStatus();
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
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
        onShowToast?.(`Restored checkpoint ${selectedCommit.shortHash} successfully.`, 'success');
        await fetchHistory();
        await fetchSyncStatus();
      } else {
        const err = await res.json();
        if (onShowToast) onShowToast(`Restore failed: ${err.error}`, 'error');
        else alert(`Restore failed: ${err.error}`);
      }
    } catch (e: any) {
      if (onShowToast) onShowToast(`Restore error: ${e.message}`, 'error');
      else alert(`Restore error: ${e.message}`);
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

  const displayedCommits =
    filterMode === 'milestones'
      ? commits.filter((c) => c.isMilestone)
      : commits;

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
                <span>Version History & Remote Sync</span>
                <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-surface-lightBorder dark:border-surface-darkBorder">
                  GitHub & Git
                </span>
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Comment and commit each version, push to GitHub, and compare diffs
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* Remote Sync Header Actions */}
            {onOpenSyncModal && (
              <button
                aria-label="Configure GitHub Remote"
                onClick={onOpenSyncModal}
                title="Configure GitHub Remote"
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-700 dark:text-stone-300 text-xs hover:border-scholarly transition"
              >
                <Github className="w-3.5 h-3.5" />
                <span className="text-[11px] font-medium">
                  {syncStatus?.remoteUrl ? 'GitHub Configured' : 'Connect GitHub'}
                </span>
              </button>
            )}

            {syncStatus?.remoteUrl && (
              <div className="flex items-center space-x-1">
                <button
                  aria-label="Pull changes from GitHub"
                  onClick={handleQuickPull}
                  disabled={isLoading}
                  title="Pull changes from GitHub"
                  className="p-1.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-600 dark:text-stone-300 hover:text-blue-500 transition"
                >
                  <ArrowDownCircle className="w-3.5 h-3.5" />
                </button>
                <button
                  aria-label={`Push ${syncStatus.ahead} commits to GitHub`}
                  onClick={handleQuickPush}
                  disabled={isPushing}
                  title={`Push ${syncStatus.ahead} commits to GitHub`}
                  className="flex items-center space-x-1 px-2 py-1.5 rounded-lg bg-scholarly dark:bg-scholarly-dark text-white text-[11px] font-medium hover:bg-scholarly-hover transition"
                >
                  {isPushing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                  )}
                  <span>Push {syncStatus.ahead > 0 ? `(${syncStatus.ahead})` : ''}</span>
                </button>
              </div>
            )}

            <button
              aria-label="Refresh Timeline"
              onClick={() => {
                fetchHistory();
                fetchSyncStatus();
              }}
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

        {/* GitHub-Style Commit & Push Bar */}
        <div className="px-4 py-3 bg-surface-lightSubtle dark:bg-surface-darkSubtle border-b border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0 space-y-2">
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <Tag className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleCommitExplicit(false);
                  }
                }}
                placeholder="Write a version comment (e.g. 'Revised methodology and abstract for review')..."
                className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 placeholder:text-stone-400 font-sans"
              />
            </div>

            <button
              type="button"
              onClick={() => setShowDescriptionInput(!showDescriptionInput)}
              className="text-[11px] text-stone-500 hover:text-scholarly dark:hover:text-scholarly-dark px-2 py-1 rounded transition"
            >
              {showDescriptionInput ? '- Desc' : '+ Desc'}
            </button>

            {/* Commit Button */}
            <button
              type="button"
              onClick={() => handleCommitExplicit(false)}
              disabled={!commitMessage.trim() || isCommitting}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-800 dark:text-stone-200 font-medium text-xs transition disabled:opacity-50 flex-shrink-0 shadow-xs"
            >
              {isCommitting && !isPushing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <GitCommit className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" />
              )}
              <span>Commit</span>
            </button>

            {/* Commit & Push Button */}
            <button
              type="button"
              onClick={() => handleCommitExplicit(true)}
              disabled={!commitMessage.trim() || isCommitting || isPushing}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white font-medium text-xs transition disabled:opacity-50 flex-shrink-0 shadow-xs"
            >
              {isPushing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowUpCircle className="w-3.5 h-3.5" />
              )}
              <span>Commit & Push</span>
            </button>
          </div>

          {showDescriptionInput && (
            <textarea
              value={commitDescription}
              onChange={(e) => setCommitDescription(e.target.value)}
              placeholder="Add an optional extended description of changes in this version..."
              rows={2}
              className="w-full p-2.5 rounded-lg text-xs bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly text-stone-900 dark:text-stone-100 placeholder:text-stone-400 font-sans"
            />
          )}

          {/* Feedback & Settings Bar */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <div>
              {commitStatus && (
                <p className="text-scholarly dark:text-scholarly-dark flex items-center space-x-1 font-medium animate-in fade-in">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>{commitStatus}</span>
                </p>
              )}
            </div>

            <div className="flex items-center space-x-4 text-stone-500 dark:text-stone-400">
              <label className="flex items-center space-x-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoCommitOnCompile}
                  onChange={handleToggleAutoCommit}
                  className="rounded border-stone-300 text-scholarly focus:ring-0 w-3 h-3"
                />
                <span>Auto-save snapshot on compile</span>
              </label>
            </div>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="px-4 py-2 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between bg-surface-light dark:bg-surface-dark text-xs flex-shrink-0">
          <div className="flex items-center space-x-1 bg-surface-lightSubtle dark:bg-surface-darkSubtle p-0.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                filterMode === 'all'
                  ? 'bg-surface-lightPanel dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              All Snapshots ({commits.length})
            </button>
            <button
              onClick={() => setFilterMode('milestones')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition ${
                filterMode === 'milestones'
                  ? 'bg-surface-lightPanel dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-xs'
                  : 'text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
              }`}
            >
              <Bookmark className="w-3 h-3 text-scholarly dark:text-scholarly-dark" />
              <span>Milestones Only ({commits.filter((c) => c.isMilestone).length})</span>
            </button>
          </div>

          <span className="text-[10px] text-stone-400 font-mono">click a commit to view diff</span>
        </div>

        {/* Main Content Area: 2 Columns (Timeline List + Diff Viewer) */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Timeline Commits */}
          <div className="w-80 border-r border-surface-lightBorder dark:border-surface-darkBorder flex flex-col bg-surface-light dark:bg-surface-dark flex-shrink-0">
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {displayedCommits.length === 0 && !isLoading && (
                <div className="p-6 text-center text-xs text-stone-400 font-sans">
                  <GitCommit className="w-8 h-8 mx-auto mb-2 opacity-40 text-stone-500" />
                  <p>No commits match the selected filter.</p>
                  {filterMode === 'milestones' && (
                    <p className="text-[10px] mt-1 text-stone-500">
                      Type a comment in the box above and click "Commit" to create a milestone version.
                    </p>
                  )}
                </div>
              )}

              {displayedCommits.map((commit) => {
                const isSelected = selectedCommit?.hash === commit.hash;
                const isMilestone = commit.isMilestone;

                return (
                  <button
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit)}
                    className={`w-full text-left p-2.5 rounded-lg border transition text-xs flex flex-col space-y-1.5 relative group btn-tactile ${
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
                      {isMilestone ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-scholarly dark:text-scholarly-dark uppercase tracking-wider flex-shrink-0 mt-0.5 flex items-center space-x-0.5">
                          <Bookmark className="w-2.5 h-2.5" />
                          <span>Version</span>
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400 uppercase tracking-wider flex-shrink-0 mt-0.5">
                          Auto
                        </span>
                      )}
                      <p className={`text-xs font-medium line-clamp-2 leading-relaxed ${isMilestone ? 'text-stone-900 dark:text-stone-100 font-semibold' : 'text-stone-700 dark:text-stone-300'}`}>
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
