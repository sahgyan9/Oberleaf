import React, { useState } from 'react';
import { ArrowDownToLine, CheckCircle2, ArrowUpCircle, Loader2, X, RefreshCw, AlertTriangle } from 'lucide-react';

export interface UpdateInfo {
  hasUpdate: boolean;
  /** See server/updater.ts: only 'behind' can be updated */
  state?: 'up-to-date' | 'behind' | 'ahead' | 'diverged';
  aheadBy?: number;
  behindBy?: number;
  currentCommit: string;
  latestCommit: string;
  commitMessage?: string;
  checkedAt: string;
  error?: string;
  isOffline?: boolean;
}

interface UpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  updateInfo: UpdateInfo | null;
  onCheckAgain: () => Promise<void>;
  isChecking: boolean;
}

// Gives the old process time to exit, then polls until the new one answers
// (or 60 s pass; the reload then shows the startup screen's own error state).
async function waitForServerRestart(): Promise<void> {
  await new Promise((r) => setTimeout(r, 1500));
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch('/health', { cache: 'no-store' });
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  isOpen,
  onClose,
  updateInfo,
  onCheckAgain,
  isChecking,
}) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [updateSuccess, setUpdateSuccess] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApplyUpdate = async () => {
    setIsUpdating(true);
    setUpdateError(null);
    try {
      const res = await fetch('/api/system/apply-update', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        if (data.restart) {
          // The server restarts itself to load the update; reload once it answers again.
          setUpdateSuccess(`${data.message} Restarting Oberleaf...`);
          await waitForServerRestart();
          window.location.reload();
          return;
        }
        setUpdateSuccess(`${data.message} Reloading Oberleaf...`);
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setUpdateError([data.message, data.error].filter(Boolean).join(' ') || 'Failed to apply update.');
      }
    } catch (err: any) {
      setUpdateError(`Could not reach local server: ${err.message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  const hasUpdate = updateInfo?.hasUpdate;
  const localCommits = updateInfo?.aheadBy ?? 0;
  const plural = (n: number) => (n === 1 ? '' : 's');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-2xl shadow-2xl max-w-md w-full p-6 text-stone-900 dark:text-stone-100 relative">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          disabled={isUpdating}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center space-x-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
            hasUpdate
              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              : 'bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-600 dark:text-stone-300'
          }`}>
            {hasUpdate ? <ArrowDownToLine className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5 text-scholarly-green dark:text-scholarly-greenDark" />}
          </div>
          <div>
            <h3 className="font-serif font-bold text-base text-stone-900 dark:text-stone-100">
              {hasUpdate
                ? 'Update Available'
                : updateInfo?.state === 'ahead'
                ? 'Local Changes Not on GitHub'
                : updateInfo?.state === 'diverged'
                ? 'Local and GitHub Versions Differ'
                : 'Oberleaf is Up to Date'}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">
              Oberleaf Update Manager
            </p>
          </div>
        </div>

        {/* Version Information Card */}
        <div className="p-3.5 rounded-xl bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder space-y-2 mb-4 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-stone-500 dark:text-stone-400">Current Version:</span>
            <span className="font-mono font-semibold px-2 py-0.5 rounded bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder">
              {updateInfo?.currentCommit || 'Installed'}
            </span>
          </div>
          {hasUpdate && (
            <div className="flex items-center justify-between">
              <span className="text-stone-500 dark:text-stone-400">Latest Available:</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                {updateInfo?.latestCommit}
              </span>
            </div>
          )}
          {updateInfo?.commitMessage && (
            <div className="pt-2 border-t border-surface-lightBorder/60 dark:border-surface-darkBorder/60">
              <span className="text-[11px] text-stone-400 block mb-0.5">What's new:</span>
              <p className="font-medium text-stone-800 dark:text-stone-200 italic">
                "{updateInfo.commitMessage}"
              </p>
            </div>
          )}
        </div>

        {/* Status / Notice Messages */}
        {hasUpdate ? (
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed mb-5">
            {updateInfo?.behindBy ?? 'New'} commit{plural(updateInfo?.behindBy ?? 2)} on GitHub. Updating fast-forwards this copy; it stops without changing anything if that would overwrite local edits. Your documents in <code className="text-emerald-600 dark:text-emerald-400 font-mono">projects/</code> are not part of the update.
          </p>
        ) : updateInfo?.state === 'ahead' ? (
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed mb-5">
            This copy has {localCommits} commit{plural(localCommits)} that GitHub does not have, so there is nothing to download. Push them to share them.
          </p>
        ) : updateInfo?.state === 'diverged' ? (
          <div className="flex items-start space-x-2 text-xs text-amber-600 dark:text-amber-400 mb-5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              This copy has {localCommits} local commit{plural(localCommits)} and GitHub has {updateInfo.behindBy ?? 0} new one{plural(updateInfo.behindBy ?? 0)}. Combining them needs a git merge, so Oberleaf will not update automatically.
            </span>
          </div>
        ) : updateInfo?.isOffline ? (
          <div className="flex items-center space-x-2 text-xs text-amber-600 dark:text-amber-400 mb-5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>Cannot reach GitHub right now. You can continue writing offline without interruptions.</span>
          </div>
        ) : (
          <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed mb-5">
            You are running the newest version of Oberleaf. All local compilation tools and LaTeX engines are synchronized.
          </p>
        )}

        {/* Error / Success Alerts */}
        {updateError && (
          <div className="p-3 mb-4 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-xs">
            {updateError}
          </div>
        )}
        {updateSuccess && (
          <div className="p-3 mb-4 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-xs font-medium">
            {updateSuccess}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-2.5">
          {hasUpdate ? (
            <>
              <button
                onClick={onClose}
                disabled={isUpdating}
                className="px-3.5 py-2 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 text-xs font-medium transition"
              >
                Later
              </button>
              <button
                onClick={handleApplyUpdate}
                disabled={isUpdating}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm btn-tactile disabled:opacity-50 cursor-pointer"
              >
                {isUpdating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
                  </>
                ) : (
                  <>
                    <ArrowUpCircle className="w-3.5 h-3.5" />
                    <span>Update Now</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onCheckAgain}
                disabled={isChecking}
                className="px-3 py-1.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-xs font-medium transition flex items-center space-x-1.5 btn-tactile"
              >
                <RefreshCw className={`w-3 h-3 ${isChecking ? 'animate-spin text-scholarly-green' : ''}`} />
                <span>Check Again</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-800 dark:text-stone-200 text-xs font-semibold transition border border-surface-lightBorder dark:border-surface-darkBorder"
              >
                Done
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
