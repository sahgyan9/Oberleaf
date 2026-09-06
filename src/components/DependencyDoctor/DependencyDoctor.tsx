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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 select-none font-sans">
      <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-lg rounded-xl p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-surface-lightBorder dark:border-surface-darkBorder pb-3">
          <div>
            <h3 className="text-base font-serif font-semibold text-stone-900 dark:text-stone-100 flex items-center space-x-2">
              <span>TeX Engine Diagnostics & Health</span>
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Verify your local compilation tools for fast, zero-timeout TeX builds.
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Global Banner */}
        <div
          className={`p-3 rounded-lg border text-xs flex items-center space-x-3 ${
            allHealthy
              ? 'bg-scholarly-subtle/50 dark:bg-scholarly-darkSubtle/40 border-scholarly/30 dark:border-scholarly-dark/30 text-scholarly dark:text-scholarly-dark'
              : 'bg-diagnostic-subtle/70 dark:bg-diagnostic-darkSubtle/40 border-diagnostic/30 text-diagnostic dark:text-diagnostic-dark'
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
                ? 'Compilations will run locally on your multi-core CPU with zero cloud timeout quotas.'
                : 'Follow the 1-click install guidance below to equip your workstation.'}
            </p>
          </div>
        </div>

        {/* Dependency Cards */}
        <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
          {dependencies.map((dep) => (
            <div
              key={dep.name}
              className="p-3 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-xs space-y-1.5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  {dep.installed ? (
                    <CheckCircle2 className="w-4 h-4 text-scholarly dark:text-scholarly-dark" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-crimson dark:text-crimson-dark" />
                  )}
                  <span className="font-semibold text-stone-900 dark:text-stone-100">{dep.name}</span>
                  {dep.required && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300">
                      Required
                    </span>
                  )}
                </div>
                <span className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
                  {dep.installed ? dep.version : 'Not Detected'}
                </span>
              </div>

              <p className="text-stone-600 dark:text-stone-300 text-[11px]">{dep.guidance}</p>

              {!dep.installed && dep.wingetCommand && (
                <div className="mt-2 flex items-center justify-between p-2 rounded bg-stone-900 text-stone-200 border border-stone-800 font-mono text-[11px]">
                  <div className="flex items-center space-x-1.5">
                    <Terminal className="w-3.5 h-3.5 text-scholarly-dark" />
                    <span>{dep.wingetCommand}</span>
                  </div>
                  <button
                    onClick={() => handleCopy(dep.wingetCommand!)}
                    className="flex items-center space-x-1 text-[10px] px-2 py-0.5 rounded bg-stone-800 hover:bg-stone-700 text-white transition btn-tactile"
                  >
                    {copiedCmd === dep.wingetCommand ? (
                      <>
                        <Check className="w-3 h-3 text-scholarly-dark" />
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
        <div className="flex items-center justify-between pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder text-xs">
          <a
            href="https://miktex.org/download"
            target="_blank"
            rel="noreferrer"
            className="flex items-center space-x-1 text-stone-500 hover:text-scholarly dark:hover:text-scholarly-dark transition"
          >
            <span>Download MiKTeX installer</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover text-white font-medium transition btn-tactile shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Re-scan System</span>
          </button>
        </div>
      </div>
    </div>
  );
};
