import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  ExternalLink,
  Wrench,
  Loader2,
} from 'lucide-react';

export interface DependencyItem {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  required: boolean;
  guidance: string;
  /** Command the user can run themselves */
  wingetCommand?: string;
  /** Present when the server can run the repair */
  autoFix?: {
    actionId: string;
    label: string;
    effect: string;
  };
}

export interface DoctorFixOutcome {
  ok: boolean;
  /** Whether the follow-up scan reports this item as working */
  resolved: boolean;
  ranCommand: string;
  output: string;
}

interface DependencyDoctorProps {
  isOpen: boolean;
  onClose: () => void;
  dependencies: DependencyItem[];
  /** Kept for callers; the summary is derived from the dependency list itself */
  allHealthy?: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
  onRunFix: (actionId: string, dependencyId: string) => Promise<DoctorFixOutcome>;
  checkedAt?: string | null;
}

type FixState = { status: 'running' } | ({ status: 'done' } & DoctorFixOutcome);

export const DependencyDoctor: React.FC<DependencyDoctorProps> = ({
  isOpen,
  onClose,
  dependencies,
  onRefresh,
  isRefreshing,
  onRunFix,
  checkedAt,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [fixStates, setFixStates] = useState<Record<string, FixState>>({});

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose]
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const anyFixRunning = Object.values(fixStates).some((s) => s.status === 'running');

  const runFix = async (dep: DependencyItem) => {
    if (!dep.autoFix || anyFixRunning) return;
    setFixStates((s) => ({ ...s, [dep.id]: { status: 'running' } }));
    try {
      const outcome = await onRunFix(dep.autoFix.actionId, dep.id);
      setFixStates((s) => ({ ...s, [dep.id]: { status: 'done', ...outcome } }));
    } catch (err: any) {
      setFixStates((s) => ({
        ...s,
        [dep.id]: { status: 'done', ok: false, resolved: false, ranCommand: '', output: err?.message ?? 'Request failed' },
      }));
    }
  };

  const attention = dependencies
    .filter((d) => !d.installed)
    .sort((a, b) => Number(b.required) - Number(a.required));
  const working = dependencies.filter((d) => d.installed);
  const missingRequired = attention.filter((d) => d.required);

  // The summary has to match what the user can do: a missing engine blocks
  // every compile, while a stale setting only breaks some documents.
  const summary = missingRequired.length
    ? {
        tone: 'blocked' as const,
        title: `Oberleaf cannot compile yet: ${missingRequired.map((d) => d.name).join(', ')} not found.`,
        body: 'Install the required tools below, then re-scan.',
      }
    : attention.length
    ? {
        tone: 'partial' as const,
        title: `Compiling works. ${attention.length} item${attention.length === 1 ? '' : 's'} can make specific documents fail.`,
        body: attention.some((d) => d.autoFix)
          ? 'Items with a fix button can be repaired from here.'
          : 'Each item below says what to run.',
      }
    : {
        tone: 'ok' as const,
        title: 'Everything Oberleaf compiles with is installed and working.',
        body: 'Compiles run locally, with no time limit.',
      };

  const checkedLabel = checkedAt
    ? new Date(checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="TeX Diagnostics"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 font-sans"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-xl rounded-xl p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-lightBorder dark:border-surface-darkBorder pb-3">
          <div>
            <h3 className="text-base font-serif font-semibold text-stone-900 dark:text-stone-100">TeX Diagnostics</h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Checks the tools Oberleaf compiles with on this computer.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close diagnostics"
            className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Summary */}
        <div
          role="status"
          className={`p-3 rounded-lg border text-xs flex items-start gap-3 ${
            summary.tone === 'ok'
              ? 'bg-scholarly-subtle/50 dark:bg-scholarly-darkSubtle/40 border-scholarly/30 dark:border-scholarly-dark/30 text-scholarly dark:text-scholarly-dark'
              : summary.tone === 'partial'
              ? 'bg-diagnostic-subtle/70 dark:bg-diagnostic-darkSubtle/40 border-diagnostic/30 text-diagnostic dark:text-diagnostic-dark'
              : 'bg-crimson-subtle/70 dark:bg-crimson-darkSubtle/50 border-crimson/30 text-crimson dark:text-crimson-dark'
          }`}
        >
          {summary.tone === 'ok' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : summary.tone === 'partial' ? (
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <div>
            <p className="font-semibold">{summary.title}</p>
            <p className="text-[11px] opacity-90 mt-0.5">{summary.body}</p>
          </div>
        </div>

        <div className="space-y-3 max-h-[26rem] overflow-y-auto pr-1">
          {/* Needs attention */}
          {attention.length > 0 && (
            <section className="space-y-2">
              <h4 className="text-[10px] uppercase tracking-wide font-semibold text-stone-500 dark:text-stone-400">
                Needs attention
              </h4>
              {attention.map((dep) => {
                const fixState = fixStates[dep.id];
                const running = fixState?.status === 'running';
                const failed = fixState?.status === 'done' && !fixState.resolved;

                return (
                  <div
                    key={dep.id}
                    className={`rounded-lg border text-xs overflow-hidden ${
                      dep.required
                        ? 'border-crimson/30 dark:border-crimson-dark/30'
                        : 'border-surface-lightBorder dark:border-surface-darkBorder'
                    } bg-surface-lightSubtle dark:bg-surface-darkSubtle`}
                  >
                    <div className="p-3 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <AlertCircle
                            className={`w-4 h-4 flex-shrink-0 ${
                              dep.required ? 'text-crimson dark:text-crimson-dark' : 'text-diagnostic dark:text-diagnostic-dark'
                            }`}
                          />
                          <span className="font-semibold text-stone-900 dark:text-stone-100 truncate">{dep.name}</span>
                        </div>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                            dep.required
                              ? 'bg-crimson-subtle dark:bg-crimson-darkSubtle text-crimson dark:text-crimson-dark'
                              : 'bg-stone-100 dark:bg-stone-700/60 text-stone-500 dark:text-stone-400'
                          }`}
                        >
                          {dep.required ? 'Required' : 'Optional'}
                        </span>
                      </div>
                      <p className="text-stone-600 dark:text-stone-300 text-[11px] leading-relaxed">{dep.guidance}</p>
                    </div>

                    {/* One-click repair: what it will do, then the button */}
                    {dep.autoFix && (
                      <div className="px-3 py-2.5 border-t border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel space-y-2">
                        <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-snug">{dep.autoFix.effect}</p>
                        <div className="flex items-center gap-2.5">
                          <button
                            onClick={() => runFix(dep)}
                            disabled={running || anyFixRunning || isRefreshing}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-dark dark:hover:bg-scholarly text-white shadow-xs transition btn-tactile disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                            <span>{running ? 'Running…' : failed ? `Try again: ${dep.autoFix.label}` : dep.autoFix.label}</span>
                          </button>
                          {running && (
                            <span className="text-[10px] text-stone-500 dark:text-stone-400">
                              Re-scans automatically when finished
                            </span>
                          )}
                        </div>

                        {failed && fixState?.status === 'done' && (
                          <div className="rounded border border-crimson/30 bg-crimson-subtle/50 dark:bg-crimson-darkSubtle/40 p-2 space-y-1">
                            <p className="text-[11px] font-medium text-crimson dark:text-crimson-dark">
                              {fixState.ok
                                ? 'The repair ran, but the re-scan still reports this problem.'
                                : 'The repair did not complete.'}
                            </p>
                            {fixState.output && (
                              <pre className="font-mono text-[10px] text-stone-700 dark:text-stone-300 whitespace-pre-wrap max-h-24 overflow-y-auto select-text">
                                {fixState.output}
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual path: always available when there is a command */}
                    {dep.wingetCommand && (
                      <div className="px-3 pb-3 pt-2 border-t border-surface-lightBorder dark:border-surface-darkBorder space-y-1">
                        <p className="text-[10px] text-stone-500 dark:text-stone-400">
                          {dep.autoFix
                            ? 'Or run it yourself in a terminal:'
                            : dep.wingetCommand.startsWith('winget')
                            ? 'Run in a terminal. The installer runs outside Oberleaf; re-scan when it finishes.'
                            : 'Run in a terminal, then re-scan:'}
                        </p>
                        <div className="flex items-center justify-between p-2 rounded bg-stone-900 text-stone-200 border border-stone-800 font-mono text-[11px]">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Terminal className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
                            <span className="truncate select-text" title={dep.wingetCommand}>
                              {dep.wingetCommand}
                            </span>
                          </div>
                          <button
                            onClick={() => handleCopy(dep.wingetCommand!)}
                            className="ml-2 flex-shrink-0 flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-white transition btn-tactile"
                          >
                            {copiedCmd === dep.wingetCommand ? (
                              <>
                                <Check className="w-3 h-3" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {!dep.autoFix && !dep.wingetCommand && dep.required && (
                      <div className="px-3 pb-3">
                        <a
                          href={`https://www.google.com/search?q=install+${encodeURIComponent(dep.name)}+latex+windows`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-stone-500 hover:text-scholarly dark:hover:text-scholarly-dark transition"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Search install instructions for {dep.name}</span>
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          )}

          {/* Working: compact, lower visual weight */}
          {working.length > 0 && (
            <section className="space-y-1">
              <h4 className="text-[10px] uppercase tracking-wide font-semibold text-stone-500 dark:text-stone-400">
                Working
              </h4>
              <div className="rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder divide-y divide-surface-lightBorder dark:divide-surface-darkBorder">
                {working.map((dep) => {
                  const fixState = fixStates[dep.id];
                  const justFixed = fixState?.status === 'done' && fixState.resolved;
                  return (
                    <div key={dep.id} className="px-3 py-2 flex items-center justify-between gap-3 text-xs" title={dep.guidance}>
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 text-scholarly dark:text-scholarly-dark" />
                        <span className="text-stone-800 dark:text-stone-200 truncate">{dep.name}</span>
                        {justFixed && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-scholarly dark:text-scholarly-dark flex-shrink-0">
                            Fixed just now
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] text-stone-500 dark:text-stone-400 truncate max-w-[45%]">
                        {dep.version ?? 'Detected'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder text-xs">
          <div className="flex items-center gap-3">
            <a
              href="https://miktex.org/download"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-stone-500 hover:text-scholarly dark:hover:text-scholarly-dark transition"
            >
              <span>MiKTeX download page</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            {checkedLabel && <span className="text-[10px] text-stone-400">Checked at {checkedLabel}</span>}
          </div>

          <button
            onClick={onRefresh}
            disabled={isRefreshing || anyFixRunning}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800 font-medium transition btn-tactile disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Scanning…' : 'Re-scan'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
