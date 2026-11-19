import React, { useState } from 'react';
import { ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { setTelemetry } from '../../utils/reporting';

interface ReportingConsentProps {
  /** Called after the user closed the notice, so the parent can refresh its status */
  onDecided: () => void;
}

/**
 * Shown once, and only when this copy can send anything at all. Error signals
 * are on by default; the switch turns them off right here, and Ctrl+K,
 * "Error signals" changes it later.
 */
export const ReportingConsent: React.FC<ReportingConsentProps> = ({ onDecided }) => {
  const [details, setDetails] = useState(false);
  const [on, setOn] = useState(true);
  const [saving, setSaving] = useState(false);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    setSaving(true);
    await setTelemetry(next ? 'on' : 'off');
    setSaving(false);
  };

  const close = async () => {
    setSaving(true);
    // Stores the choice, so the notice is not shown again.
    await setTelemetry(on ? 'on' : 'off');
    setSaving(false);
    onDecided();
  };

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      className="fixed bottom-10 left-4 z-40 w-[22rem] max-w-[calc(100vw-2rem)] rounded-xl border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel shadow-lg p-4 text-xs text-stone-700 dark:text-stone-300 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <ShieldCheck className="w-4 h-4 text-scholarly dark:text-scholarly-dark" />
        <h3 id="consent-title" className="font-semibold text-stone-900 dark:text-stone-100">
          Anonymous error reports
        </h3>
      </div>
      <p className="leading-relaxed">
        When Oberleaf itself fails, it sends a short description of the error so it gets fixed. Your documents never leave your
        computer this way.
      </p>
      <button
        type="button"
        onClick={() => setDetails((v) => !v)}
        aria-expanded={details}
        className="mt-1.5 flex items-center gap-1 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
      >
        {details ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>What is sent</span>
      </button>
      {details && (
        <ul className="mt-1.5 list-disc pl-4 space-y-0.5 text-stone-600 dark:text-stone-400">
          <li>Sent only for a crash, a compile that fails with no reason, or a TeX message Oberleaf cannot explain.</li>
          <li>The error message with paths and file names removed, the engine, and the Oberleaf, Windows and TeX versions.</li>
          <li>A random ID for this installation, so repeated reports can be counted. Not linked to you.</li>
          <li>Never document text, file or project names, or your user name.</li>
          <li>Change it any time: Ctrl+K, then "Error signals".</li>
        </ul>
      )}
      <div className="mt-3 flex items-center justify-between gap-2">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={saving}
          onClick={() => void toggle()}
          className="flex items-center gap-2 disabled:opacity-50"
        >
          <span
            className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors ${
              on ? 'bg-scholarly dark:bg-scholarly-dark' : 'bg-stone-300 dark:bg-stone-600'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
            />
          </span>
          <span className="font-medium text-stone-800 dark:text-stone-200">{on ? 'On' : 'Off'}</span>
        </button>
        <button
          disabled={saving}
          onClick={() => void close()}
          className="px-3 py-1.5 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder font-medium hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition btn-tactile disabled:opacity-50"
        >
          Got it
        </button>
      </div>
    </div>
  );
};
