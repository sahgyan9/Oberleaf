import React, { useEffect, useRef, useState } from 'react';
import { MessageSquareWarning, X, Loader2, Send, Download, ExternalLink, Copy, Check, ChevronDown } from 'lucide-react';
import { previewReport, saveTextFile, sendProblemReport, type ReportPreview, type ReportingStatus } from '../../utils/reporting';

interface ReportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  /** Whether this session has compiled the project, so a log is available */
  hasCompile: boolean;
  status: ReportingStatus | null;
}

type Action = 'send' | 'save' | 'github' | 'copy';

/**
 * "Report a problem": a description, one line saying what goes with it (the
 * whole report is a click away under "View"), and Send. The document itself
 * is included only when the user ticks the box. Copy, Save file and GitHub
 * issue sit under "More", or are the main buttons when this copy cannot send.
 * See docs/ERROR_REPORTING.md for where reports go.
 */
export const ReportDialog: React.FC<ReportDialogProps> = ({ isOpen, onClose, projectId, hasCompile, status }) => {
  const [note, setNote] = useState('');
  const [contact, setContact] = useState('');
  const [includeSource, setIncludeSource] = useState(false);
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [showFull, setShowFull] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState<null | Action>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const request = () => ({ projectId, note, contact, includeSource });

  // A fresh dialog each time it opens.
  useEffect(() => {
    if (!isOpen) return;
    setSentId(null);
    setActionError(null);
    setShowFull(false);
    setMoreOpen(false);
    setTimeout(() => noteRef.current?.focus(), 50);
  }, [isOpen]);

  // Esc closes the "More" menu first, then the dialog (not while sending).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (moreOpen) setMoreOpen(false);
      else if (!busy) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, moreOpen, busy, onClose]);

  // A click anywhere outside the "More" menu closes it.
  useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [moreOpen]);

  // The full report is built only when the user asks to see it.
  useEffect(() => {
    if (!isOpen || !showFull) return;
    const t = setTimeout(() => {
      previewReport(request())
        .then((p) => {
          setPreview(p);
          setPreviewError(null);
        })
        .catch((e) => setPreviewError(e.message));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, showFull, note, contact, includeSource, projectId]);

  if (!isOpen) return null;

  const canSend = !!status?.canSend;
  const fileName = (id: string) => `oberleaf-report-${id}.txt`;

  const run = async (kind: Action) => {
    setMoreOpen(false);
    setBusy(kind);
    setActionError(null);
    try {
      if (kind === 'send') {
        setSentId(await sendProblemReport(request()));
        return;
      }
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

  const btn =
    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition btn-tactile disabled:opacity-50 disabled:cursor-not-allowed';
  const secondary = `${btn} border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle`;
  const primary = `${btn} bg-scholarly hover:bg-scholarly-hover text-white dark:bg-scholarly-dark dark:hover:bg-scholarly-darkHover`;
  const field =
    'w-full rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-white dark:bg-surface-dark px-2.5 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-scholarly/40';

  const otherActions: Array<{ kind: Action; label: string; icon: React.ReactNode; title?: string }> = [
    { kind: 'copy', label: copied ? 'Copied' : 'Copy', icon: copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" /> },
    { kind: 'save', label: 'Save file', icon: <Download className="w-3.5 h-3.5" /> },
    {
      kind: 'github',
      label: 'GitHub issue',
      icon: <ExternalLink className="w-3.5 h-3.5" />,
      title: 'Saves the report file and opens a new GitHub issue',
    },
  ];

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
        className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-2xl shadow-2xl max-w-md w-full max-h-full overflow-y-auto p-5 text-stone-900 dark:text-stone-100 relative"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3.5 right-3.5 p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 mb-3.5">
          <MessageSquareWarning className="w-4 h-4 text-stone-500 dark:text-stone-400" />
          <h3 id="report-title" className="font-serif font-bold text-base">
            Report a problem
          </h3>
        </div>

        {sentId ? (
          <div className="space-y-4 text-xs">
            <div className="flex items-start gap-2 rounded-lg border border-scholarly/30 bg-scholarly-subtle/60 dark:bg-scholarly-darkSubtle/40 p-3">
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
          <div className="space-y-3 text-xs">
            <textarea
              ref={noteRef}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={4000}
              aria-label="What happened?"
              placeholder="What happened? What you did, what you expected, and what you saw instead."
              className={`${field} py-2`}
            />
            {canSend && (
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={200}
                aria-label="Contact (optional)"
                placeholder="Your e-mail, if you would like a reply (optional)"
                className={`${field} py-1.5`}
              />
            )}

            <p className="text-stone-500 dark:text-stone-400 leading-relaxed">
              {hasCompile
                ? 'Sent with it: Oberleaf, Windows and TeX versions and the last compile log, with your user name and folder names masked.'
                : 'Sent with it: Oberleaf, Windows and TeX versions. No compile yet in this session, so no log.'}{' '}
              <button
                type="button"
                onClick={() => setShowFull((v) => !v)}
                aria-expanded={showFull}
                className="underline underline-offset-2 text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-stone-100"
              >
                {showFull ? 'Hide' : 'View'}
              </button>
            </p>
            {showFull && (
              <pre className="max-h-56 overflow-auto rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-white dark:bg-surface-dark p-2.5 font-mono text-[10.5px] leading-snug text-stone-700 dark:text-stone-300 whitespace-pre-wrap [overflow-wrap:anywhere]">
                {previewError ? `Could not build the report: ${previewError}` : preview?.text ?? 'Building…'}
              </pre>
            )}

            <label className={`flex items-start gap-2 ${hasCompile ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
              <input
                type="checkbox"
                checked={includeSource}
                disabled={!hasCompile}
                onChange={(e) => setIncludeSource(e.target.checked)}
                className="mt-0.5 accent-[#1B5E20]"
              />
              <span className="text-stone-700 dark:text-stone-300">
                Include my document's main file <span className="text-stone-500 dark:text-stone-400">(leave off for private work)</span>
              </span>
            </label>

            {!canSend && (
              <p className="text-stone-500 dark:text-stone-400">
                Sending from the app is not set up in this copy. Save the report and send the file, or open a GitHub issue.
              </p>
            )}

            {actionError && <p className="text-crimson dark:text-crimson-dark">{actionError}</p>}

            {canSend ? (
              <div className="flex items-center justify-end gap-2 pt-1">
                <div ref={moreRef} className="relative">
                  <button
                    className={secondary}
                    onClick={() => setMoreOpen((v) => !v)}
                    disabled={!!busy}
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                  >
                    {busy && busy !== 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                    <span>More</span>
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  {moreOpen && (
                    <div
                      role="menu"
                      className="absolute right-0 bottom-full mb-1 w-40 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel shadow-lg py-1 z-10"
                    >
                      {otherActions.map((a) => (
                        <button
                          key={a.kind}
                          role="menuitem"
                          title={a.title}
                          onClick={() => void run(a.kind)}
                          className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs text-stone-700 dark:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle"
                        >
                          {a.icon}
                          <span>{a.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <button className={primary} onClick={() => void run('send')} disabled={!!busy}>
                  {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Send report</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                {[otherActions[0], otherActions[2], otherActions[1]].map((a) => (
                  <button
                    key={a.kind}
                    className={a.kind === 'save' ? primary : secondary}
                    title={a.title}
                    onClick={() => void run(a.kind)}
                    disabled={!!busy}
                  >
                    {busy === a.kind ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : a.icon}
                    <span>{a.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
