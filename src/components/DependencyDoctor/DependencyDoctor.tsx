import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Terminal,
  ExternalLink,
} from 'lucide-react';

export interface DependencyItem {
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  required: boolean;
  guidance: string;
  wingetCommand?: string;
}

interface DependencyDoctorProps {
  isOpen: boolean;
  onClose: () => void;
  dependencies: DependencyItem[];
  allHealthy: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const DependencyDoctor: React.FC<DependencyDoctorProps> = ({
  isOpen,
  onClose,
  dependencies,
  allHealthy,
  onRefresh,
  isRefreshing,
}) => {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (cmd: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightSubtle dark:border-surface-darkSubtle w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center space-x-2">
              <span>Dependency Doctor & System Health</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Don Norman diagnostic helper for your local LaTeX compilation environment.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global Banner */}
        <div
          className={`p-3 rounded-lg border text-xs flex items-center space-x-3 ${
            allHealthy
              ? 'bg-brand-mint/10 border-brand-mint/30 text-emerald-600 dark:text-brand-mint'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
          }`}
        >
          {allHealthy ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
          )}
          <div>
            <p className="font-semibold">
              {allHealthy
                ? 'All core tools detected! Your environment is ready to compile LaTeX.'
                : 'Some LaTeX dependencies are missing from your PATH.'}
            </p>
            <p className="text-[11px] opacity-90 mt-0.5">
              {allHealthy
                ? 'Compilations will run locally on your multi-core CPU with zero timeouts.'
                : 'Follow the 1-click install guidance below to equip your machine.'}
            </p>
          </div>
        </div>

        {/* Dependency Cards */}
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {dependencies.map((dep) => (
            <div
              key={dep.name}
              className="p-3 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-slate-200 dark:border-slate-800 text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {dep.installed ? (
                    <CheckCircle2 className="w-4 h-4 text-brand-mint" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-500" />
                  )}
                  <span className="font-semibold text-slate-900 dark:text-white">{dep.name}</span>
                  {dep.required && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-200 dark:bg-slate-800 text-slate-500">
                      Required
                    </span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-slate-500">
                  {dep.installed ? dep.version : 'Not Detected'}
                </span>
              </div>

              <p className="text-slate-600 dark:text-slate-300 text-[11px]">{dep.guidance}</p>

              {!dep.installed && dep.wingetCommand && (
                <div className="mt-2 flex items-center justify-between p-2 rounded bg-black/40 border border-slate-700/60 font-mono text-[11px]">
                  <div className="flex items-center space-x-1.5 text-slate-300">
                    <Terminal className="w-3.5 h-3.5 text-brand-mint" />
                    <span>{dep.wingetCommand}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(dep.wingetCommand!)}
                    className="flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded bg-brand-ocean/30 hover:bg-brand-ocean text-white transition"
                  >
                    {copiedCmd === dep.wingetCommand ? (
                      <>
                        <Check className="w-3 h-3 text-brand-mint" />
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
              )}
            </div>
          ))}
        </div>

        {/* Action Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-200 dark:border-slate-800 text-xs">
          <a
            href="https://miktex.org/download"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 text-slate-500 hover:text-brand-mint transition"
          >
            <span>Download MiKTeX installer</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-brand-ocean hover:bg-brand-ocean/80 text-white font-medium transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Re-scan System</span>
          </button>
        </div>
      </div>
    </div>
  );
};
