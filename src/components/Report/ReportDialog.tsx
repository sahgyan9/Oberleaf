import React, { useEffect, useRef, useState } from 'react';
import { MessageSquareWarning, X, Loader2, Send, Download, ExternalLink, Copy, Check, ChevronDown, ChevronRight } from 'lucide-react';
import {
  previewReport,
  saveTextFile,
  sendProblemReport,
  setTelemetry,
  type ReportPreview,
  type ReportingStatus,
} from '../../utils/reporting';

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  /** Whether this session has compiled the project, so a log is available */
  hasCompile: boolean;
  status: ReportingStatus | null;
  onStatusChange: () => void;
}

/**
 * "Report a problem". The user sees the whole report before it goes
 * anywhere; the document itself is included only when they tick the box.
 * See docs/ERROR_REPORTING.md for where reports go.
 */
export const ReportDialog: React.FC<ReportDialogProps> = ({ isOpen, onClose, projectId, hasCompile, status, onStatusChange }) => {
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [includeSource, setIncludeSource] = useState(false);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [busy, setBusy] = useState<null | 'send' | 'save' | 'github' | 'copy'>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  const request = () => ({ projectId, note, contact, includeSource });

  // A fresh dialog each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    setSentId(null);
    setActionError(null);
    setShowFull(false);
    setTimeout(() => noteRef.current?.focus(), 50);
  }, [isOpen]);

  // Keep the preview in step with what the user typed.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => {
      previewReport(request())
        .then((p) => {
          setPreview(p);
          setPreviewError(null);
        })
        .catch((e) => setPreviewError(e.message));
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, note, contact, includeSource, projectId]);

  if (!isOpen) return null;

  const canSend = !!status?.canSend;
  const fileName = (id: string) => `oberleaf-report-${id}.txt`;

  const run = async (kind: 'send' | 'save' | 'github' | 'copy') => {
    setBusy(kind);
    setActionError(null);
    try {
      if (kind === 'send') {
        setSentId(await sendProblemReport(request()));
        return;
      }
      // The latest text, with the note as it is now.
      const p = await previewReport(request());
      setPreview(p);
      if (kind === 'save') saveTextFile(fileName(p.report.id), p.text);
      if (kind === 'github') {
        // The issue link can only carry a summary; the saved file has the
        // whole log and is attached to the issue.
        saveTextFile(fileName(p.report.id), p.text);
        window.open(p.githubUrl, '_blank', 'noopener');
      }
      if (kind === 'copy') {
        await navigator.clipboard.writeText(p.text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e: any) {
      setActionError(e.message || 'Something went wrong.');
    } finally {
      setBusy(null);
    }
  };

  const toggleSignals = async (on: boolean) => {
    if (await setTelemetry(on ? 'on' : 'off')) onStatusChange();
  };

  const btn =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-tactile disabled:opacity-50 disabled:cursor-not-allowed';
  const secondary = `${btn} border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle`;
  const primary = `${btn} bg-scholarly hover:bg-scholarly-hover text-white dark:bg-scholarly-dark dark:hover:bg-scholarly-darkHover`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-2xl shadow-2xl max-w-lg w-full max-h-full overflow-y-auto p-6 text-stone-900 dark:text-stone-100 relative"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-600 dark:text-stone-300">
            <MessageSquareWarning className="w-5 h-5" />
          </div>
          <div>
            <h3 id="report-title" className="font-serif font-bold text-base">
              Report a problem
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400">You see the whole report before it goes anywhere.</p>
          </div>
        </div>

        {sentId ? (
          <div className="space-y-4">
            <div className="flex items-start gap-2 rounded-lg border border-scholarly/30 bg-scholarly-subtle/60 dark:bg-scholarly-darkSubtle/40 p-3 text-xs">
              <Check className="w-4 h-4 text-scholarly dark:text-scholarly-dark flex-shrink-0" />
              <span>
                Sent as report <span className="font-mono font-semibold">{sentId}</span>. Quote this ID if you write to the developer
                about it.
              </span>
            </div>
            <div className="flex justify-end">
              <button className={primary} onClick={onClose}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 text-xs">
            <label className="block space-y-1">
              <span className="font-medium text-stone-700 dark:text-stone-300">What happened?</span>
              <textarea
                ref={noteRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={4}
                maxLength={4000}
                placeholder="What you did, what you expected, and what you saw instead."
                className="w-full rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-white dark:bg-surface-dark px-2.5 py-2 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-scholarly/40"
              />
            </label>

            {canSend && (
              <label className="block space-y-1">
                <span className="font-medium text-stone-700 dark:text-stone-300">Contact (optional)</span>
                <input
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  maxLength={200}
                  placeholder="E-mail, if you would like a reply"
                  className="w-full rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-white dark:bg-surface-dark px-2.5 py-1.5 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-scholarly/40"
                />
              </label>
            )}

            <div className="rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightSubtle/60 dark:bg-surface-darkSubtle/60 p-3 space-y-2">
              <p className="font-medium text-stone-700 dark:text-stone-300">Included</p>
              <ul className="list-disc pl-4 space-y-0.5 text-stone-600 dark:text-stone-400">
                <li>Oberleaf, Windows and TeX versions</li>
                {hasCompile ? (
                  <li>The last compile: its errors and its log, with your user name and folder names masked</li>
                ) : (
                  <li>No compile yet in this session, so no log</li>
                )}
                <li>Errors the app itself hit in this session, if any</li>
              </ul>
              <label className={`flex items-start gap-2 pt-1 ${hasCompile ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
                <input
                  type="checkbox"
                  checked={includeSource}
                  disabled={!hasCompile}
                  onChange={(e) => setIncludeSource(e.target.checked)}
                  className="mt-0.5 accent-[#1B5E20]"
                />
                <span>
                  <span className="font-medium text-stone-800 dark:text-stone-200">Include my document's main file</span>
                  <span className="block text-stone-500 dark:text-stone-400">
                    Lets the developer reproduce the problem. Leave it off for private or unpublished work.
                  </span>
                </span>
              </label>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowFull((v) => !v)}
                className="flex items-center gap-1 text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200"
                aria-expanded={showFull}
              >
                {showFull ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                <span>Show the full report</span>
              </button>
              {showFull && (
                <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-white dark:bg-surface-dark p-2.5 font-mono text-[10.5px] leading-snug text-stone-700 dark:text-stone-300 whitespace-pre-wrap [overflow-wrap:anywhere]">
                  {previewError ? `Could not build the report: ${previewError}` : preview?.text ?? 'Building…'}
                </pre>
              )}
            </div>

            {canSend && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={status?.telemetry === 'on'}
                  onChange={(e) => void toggleSignals(e.target.checked)}
                  className="mt-0.5 accent-[#1B5E20]"
                />
                <span className="text-stone-600 dark:text-stone-400">
                  Also send anonymous error signals automatically when Oberleaf itself fails. No document text, file names or
                  paths.
                </span>
              </label>
            )}

            {!canSend && (
              <p className="text-stone-500 dark:text-stone-400">
                Sending from the app is not set up in this copy. Save the report and send the file to the developer, or open a GitHub
                issue (needs a GitHub account).
              </p>
            )}

            {actionError && <p className="text-crimson dark:text-crimson-dark">{actionError}</p>}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button className={secondary} onClick={() => void run('copy')} disabled={!!busy}>
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
              <button className={secondary} onClick={() => void run('github')} disabled={!!busy} title="Saves the report file and opens a new GitHub issue">
                {busy === 'github' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5" />}
                <span>GitHub issue</span>
              </button>
              <button className={canSend ? secondary : primary} onClick={() => void run('save')} disabled={!!busy}>
                {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                <span>Save file</span>
              </button>
              {canSend && (
                <button className={primary} onClick={() => void run('send')} disabled={!!busy}>
                  {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send report</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
