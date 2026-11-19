// Client side of problem reports and error signals (server/reporting.ts,
// docs/ERROR_REPORTING.md). The server decides what may leave the machine;
// this file only asks it.

export type TelemetryChoice = 'unset' | 'on' | 'off';

export interface ReportingStatus {
  telemetry: TelemetryChoice;
  /** A PostHog key is configured, so reports can be sent from the app */
  canSend: boolean;
  githubRepo: string;
}

export interface ReportRequest {
  projectId?: string;
  note: string;
  contact: string;
  includeSource: boolean;
}

export interface ReportPreview {
  text: string;
  githubUrl: string;
  canSend: boolean;
  report: { id: string };
}

export async function fetchReportingStatus(): Promise<ReportingStatus | null> {
  try {
    const res = await fetch('/api/system/reporting');
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function setTelemetry(telemetry: 'on' | 'off'): Promise<boolean> {
  try {
    const res = await fetch('/api/system/reporting', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telemetry }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function previewReport(req: ReportRequest): Promise<ReportPreview> {
  const res = await fetch('/api/system/report/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not build the report.');
  return data;
}

export async function sendProblemReport(req: ReportRequest): Promise<string> {
  const res = await fetch('/api/system/report/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'The report could not be sent.');
  return data.id;
}

/** "Diagnosis wrong or unclear?": sends the last compile's diagnoses, no log. Returns the feedback ID. */
export async function sendDiagnosisFeedback(projectId: string): Promise<string> {
  const res = await fetch('/api/system/report/diagnosis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projectId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not send.');
  return data.id;
}

/** The optional sentence added after the one-click feedback. */
export async function sendDiagnosisNote(id: string, note: string): Promise<void> {
  const res = await fetch('/api/system/report/diagnosis-note', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, note }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not send.');
}

/** Downloads text as a file through a temporary link. */
export function saveTextFile(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Stack frames name this page's own URLs; keep the file and line, drop the
// origin and Vite's cache-busting query.
function cleanStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined;
  return stack
    .split('\n')
    .slice(0, 8)
    .map((l) => l.replace(/https?:\/\/[^/\s)]+\//g, '').replace(/\?[^:\s)]*(?=:\d)/g, ''))
    .join('\n');
}

let installed = false;

/**
 * Uncaught errors in the page (a component that crashes leaves its panel
 * blank) are passed to the server, which keeps them for the next report and
 * sends a signal only if the user turned signals on.
 */
export function installCrashReporter(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const seen = new Set<string>();

  const report = (message: string, stack?: string, where?: string) => {
    if (!message || seen.has(message) || seen.size > 20) return;
    // Noise that is not Oberleaf's: browser extensions and a benign
    // ResizeObserver notice.
    if (/ResizeObserver loop/.test(message) || /chrome-extension:|moz-extension:/.test(stack ?? '')) return;
    seen.add(message);
    void fetch('/api/system/report/client-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, stack: cleanStack(stack), where }),
    }).catch(() => undefined);
  };

  window.addEventListener('error', (e) => report(e.message, e.error?.stack, 'window.onerror'));
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    report(reason?.message ?? String(reason), reason?.stack, 'unhandledrejection');
  });
}
