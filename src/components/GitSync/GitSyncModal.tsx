import React, { useState, useEffect, useCallback } from 'react';
import {
  Github,
  GitBranch,
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Lock,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

export interface GitSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onSyncSuccess?: () => void;
}

export interface GitSyncStatus {
  currentBranch: string;
  remoteUrl: string | null;
  ahead: number;
  behind: number;
  isClean: boolean;
  tracking: string | null;
}

export const GitSyncModal: React.FC<GitSyncModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onSyncSuccess,
}) => {
  const [status, setStatus] = useState<GitSyncStatus | null>(null);
  const [remoteUrl, setRemoteUrlInput] = useState<string>('');
  const [token, setToken] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPushing, setIsPushing] = useState<boolean>(false);
  const [isPulling, setIsPulling] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/status`);
      if (res.ok) {
        const data: GitSyncStatus = await res.json();
        setStatus(data);
        if (data.remoteUrl && !remoteUrl) {
          setRemoteUrlInput(data.remoteUrl);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      setActionMessage(null);
      fetchStatus();
    }
  }, [isOpen, fetchStatus]);

  const handleSaveRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remoteUrl.trim()) return;

    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/remote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ remoteUrl: remoteUrl.trim(), token: token.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: 'Remote repository connected.' });
        await fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Failed to set remote URL' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePush = async () => {
    setIsPushing(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: data.message || 'Pushed successfully!' });
        await fetchStatus();
        if (onSyncSuccess) onSyncSuccess();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Push failed.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsPushing(false);
    }
  };

  const handlePull = async () => {
    setIsPulling(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({ type: 'success', text: data.message || 'Pulled latest changes!' });
        await fetchStatus();
        if (onSyncSuccess) onSyncSuccess();
      } else {
        setActionMessage({ type: 'error', text: data.error || 'Pull failed.' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsPulling(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 font-sans p-4">
      <div className="w-full max-w-lg bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between bg-surface-light dark:bg-surface-dark">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-scholarly/10 dark:bg-scholarly-dark/20 text-scholarly dark:text-scholarly-dark flex items-center justify-center border border-scholarly/20">
              <Github className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold font-serif text-stone-900 dark:text-stone-100 flex items-center space-x-2">
                <span>GitHub / GitLab Sync</span>
                <span className="text-[10px] font-sans px-2 py-0.5 rounded-full bg-scholarly/10 text-scholarly dark:text-scholarly-dark font-medium">
                  Free Versioning
                </span>
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Push and pull your papers to any remote Git repository without fees
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Status Badge Bar */}
          <div className="p-3.5 rounded-xl bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <GitBranch className="w-4 h-4 text-scholarly dark:text-scholarly-dark" />
              <span className="text-xs font-mono font-medium text-stone-800 dark:text-stone-200">
                {status?.currentBranch || 'main'}
              </span>
            </div>

            <div className="flex items-center space-x-3 text-xs">
              {status?.remoteUrl ? (
                <div className="flex items-center space-x-2">
                  <span className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-medium text-[11px]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Connected</span>
                  </span>
                  {status.ahead > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px] font-semibold">
                      ↑ {status.ahead} unpushed
                    </span>
                  )}
                  {status.behind > 0 && (
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-semibold">
                      ↓ {status.behind} unpulled
                    </span>
                  )}
                  {status.ahead === 0 && status.behind === 0 && (
                    <span className="text-stone-500 text-[11px]">Synced</span>
                  )}
                </div>
              ) : (
                <span className="text-stone-500 text-[11px]">No remote configured</span>
              )}

              <button
                onClick={fetchStatus}
                disabled={isLoading}
                title="Refresh Git Status"
                className="p-1 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Action Message Feedback */}
          {actionMessage && (
            <div
              className={`p-3 rounded-xl text-xs flex items-start space-x-2 ${
                actionMessage.type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
                  : 'bg-red-500/10 text-red-700 dark:text-red-300 border border-red-500/20'
              }`}
            >
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span className="font-medium">{actionMessage.text}</span>
            </div>
          )}

          {/* Remote URL Form */}
          <form onSubmit={handleSaveRemote} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                Remote Repository URL (HTTPS)
              </label>
              <input
                type="text"
                value={remoteUrl}
                onChange={(e) => setRemoteUrlInput(e.target.value)}
                placeholder="https://github.com/username/my-paper.git"
                className="w-full px-3 py-2 rounded-xl text-xs bg-surface-light dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-stone-700 dark:text-stone-300 flex items-center space-x-1">
                  <Lock className="w-3 h-3 text-stone-400" />
                  <span>GitHub Token / PAT (for private repos)</span>
                </label>
                <a
                  href="https://github.com/settings/tokens"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[10px] text-scholarly dark:text-scholarly-dark hover:underline flex items-center space-x-0.5"
                >
                  <span>Generate token</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </div>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx (stored locally only)"
                className="w-full px-3 py-2 rounded-xl text-xs bg-surface-light dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-none focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 font-mono"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isLoading || !remoteUrl.trim()}
                className="px-3.5 py-1.5 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-200 text-xs font-medium hover:bg-surface-lightBorder transition disabled:opacity-50"
              >
                {isLoading ? 'Saving...' : 'Save Remote'}
              </button>
            </div>
          </form>

          {/* Sync Actions Bar */}
          <div className="pt-2 border-t border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between">
            <button
              type="button"
              onClick={handlePull}
              disabled={isPulling || isPushing || !status?.remoteUrl}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-light dark:bg-surface-dark text-stone-800 dark:text-stone-200 text-xs font-medium hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition disabled:opacity-50"
            >
              {isPulling ? (
                <Loader2 className="w-4 h-4 animate-spin text-scholarly" />
              ) : (
                <ArrowDownCircle className="w-4 h-4 text-blue-500" />
              )}
              <span>Pull Changes</span>
            </button>

            <button
              type="button"
              onClick={handlePush}
              disabled={isPushing || isPulling || !status?.remoteUrl}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white text-xs font-medium transition disabled:opacity-50 shadow-sm"
            >
              {isPushing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUpCircle className="w-4 h-4" />
              )}
              <span>Push to GitHub</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
