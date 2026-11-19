// Problem reports and opt-in error signals.
//
// Two ways information can leave this machine, both described in
// docs/ERROR_REPORTING.md:
//
//  1. A problem report. The user opens "Report a problem", sees the whole
//     report as text, and sends it, opens a GitHub issue with it, or saves it.
//     Nothing goes anywhere without that click.
//  2. Error signals. Off until the user turns them on. When Oberleaf itself
//     fails (a crash, a compile that fails with no reason, a TeX message the
//     parser cannot explain), a short anonymous signature is sent.
//
// Both go to the PostHog project named in config/reporting.json (or the
// OBERLEAF_POSTHOG_KEY / OBERLEAF_POSTHOG_HOST environment variables). With no
// key configured, nothing is sent and the UI offers GitHub and "save file".
//
// Every path in a log is redacted before it is shown or sent: the Windows user
// name and the project's folder names become same-length filler, so a saved
// log still wraps where TeX wrapped it and parses the same way as a fixture.

import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import type { CompileResult } from './compiler.js';
import { GENERIC_EXPLANATION } from './compiler.js';

const execAsync = promisify(exec);
const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─── Configuration and settings ─────────────────────────────────────────────

export interface ReportingConfig {
  /** PostHog project API key (phc_...). Public by design: it can only write events. */
  posthogKey: string;
  posthogHost: string;
  /** owner/name of the public GitHub repository for issues */
  githubRepo: string;
}

export function loadReportingConfig(root = APP_ROOT): ReportingConfig {
  let file: Partial<ReportingConfig> = {};
  try {
    file = JSON.parse(fs.readFileSync(path.join(root, 'config', 'reporting.json'), 'utf8'));
  } catch {
    // No config file: GitHub and save-to-file still work.
  }
  return {
    posthogKey: (process.env.OBERLEAF_POSTHOG_KEY ?? file.posthogKey ?? '').trim(),
    posthogHost: (process.env.OBERLEAF_POSTHOG_HOST ?? file.posthogHost ?? 'https://us.i.posthog.com').replace(/\/+$/, ''),
    githubRepo: file.githubRepo ?? 'sahgyan9/Oberleaf',
  };
}

export type TelemetryChoice = 'unset' | 'on' | 'off';

export interface ReportingSettings {
  /**
   * 'unset' until the user has seen the one-time notice. Signals are on by
   * default: they flow unless this is 'off'.
   */
  telemetry: TelemetryChoice;
  /** Random, generated here, not derived from anything about the user or machine */
  installId: string;
}

function settingsDir(): string {
  if (process.env.OBERLEAF_SETTINGS_DIR) return process.env.OBERLEAF_SETTINGS_DIR;
  const base =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'Oberleaf');
}

const settingsPath = () => path.join(settingsDir(), 'reporting.json');

export function readReportingSettings(): ReportingSettings {
  try {
    const raw = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
    if (raw && typeof raw.installId === 'string' && ['unset', 'on', 'off'].includes(raw.telemetry)) return raw;
  } catch {
    // First run, or an unreadable file: start over.
  }
  const fresh: ReportingSettings = { telemetry: 'unset', installId: crypto.randomUUID() };
  writeReportingSettings(fresh);
  return fresh;
}

export function writeReportingSettings(s: ReportingSettings): void {
  try {
    fs.mkdirSync(settingsDir(), { recursive: true });
    fs.writeFileSync(settingsPath(), JSON.stringify(s, null, 2), 'utf8');
  } catch {
    // Read-only profile: the choice lasts for this run only.
  }
}

// ─── Redaction ──────────────────────────────────────────────────────────────

// Folder names that say nothing about the person. Every other folder between
// the home directory and the project (the project's own name, "OneDrive -
// <University>") is redacted.
const GENERIC_SEGMENTS = new Set(
  ['documents', 'onedrive', 'desktop', 'downloads', 'oberleaf projects', 'projects', 'appdata', 'local', 'temp', 'programs'].map((s) =>
    s.toLowerCase()
  )
);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Replaces one path segment wherever it appears between separators, also when
 * TeX's 79-column wrap splits it across lines. The replacement keeps the
 * length and the line breaks, so wrapped logs stay parseable.
 */
function redactSegment(text: string, segment: string, filler: string): string {
  if (segment.length < 2) return text;
  const body = segment.split('').map(escapeRegExp).join('(?:\\r?\\n)?');
  const pattern = new RegExp(`(?<=[\\\\/](?:\\r?\\n)?)${body}(?=(?:\\r?\\n)?(?:[\\\\/]|$|[\\s)'"\`]))`, 'gim');
  return text.replace(pattern, (m) => m.replace(/[^\r\n]/g, filler));
}

export interface RedactionContext {
  username: string;
  homeDir: string;
  projectDir?: string;
}

export function defaultRedactionContext(projectDir?: string): RedactionContext {
  return { username: os.userInfo().username, homeDir: os.homedir(), projectDir };
}

/** The segments of the project path that could identify someone. */
export function identifyingSegments(ctx: RedactionContext): string[] {
  const segments = new Set<string>();
  if (ctx.username) segments.add(ctx.username);
  if (ctx.projectDir) {
    const rel = path.relative(ctx.homeDir, ctx.projectDir);
    const parts = (rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel : ctx.projectDir).split(/[\\/]+/);
    for (const p of parts) {
      if (!p || /^[A-Za-z]:$/.test(p) || GENERIC_SEGMENTS.has(p.toLowerCase())) continue;
      segments.add(p);
    }
  }
  // Longest first, so "cv-elip" is not half-replaced by a shorter "cv".
  return [...segments].sort((a, b) => b.length - a.length);
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Log text with user names, project folder names and e-mail addresses masked. */
export function redact(text: string, ctx: RedactionContext): string {
  let out = text;
  for (const seg of identifyingSegments(ctx)) out = redactSegment(out, seg, seg === ctx.username ? 'u' : 'p');
  return out.replace(EMAIL, (m) => m.replace(/[^@.]/g, 'x'));
}

// ─── Error signatures ───────────────────────────────────────────────────────

// Files that come with TeX, whose names say nothing about the user.
const DISTRIBUTION_FILE = /\.(sty|cls|clo|cfg|def|fd|bst|ldf|dtx|ins|map|enc|pfb|tfm)$/i;

/**
 * What an error looks like with everything specific to one document removed:
 * paths, file names the user chose, line numbers. Two people hitting the same
 * bug produce the same signature.
 */
export function errorSignature(message: string): string {
  return (
    message
      // Windows paths, which may hold spaces ("Oberleaf Projects"): up to the
      // file extension when there is one, else to the next space.
      .replace(/[A-Za-z]:[\\/][^\n'`"()]*?\.[A-Za-z0-9]{1,5}(?=$|[\s'`"():,;])/g, '<path>')
      .replace(/[A-Za-z]:[\\/][^\s'`"()]*/g, '<path>')
      // Anything else with a slash, or a backslash inside a word
      // (chapters\intro.tex). A TeX command (\textbf) starts with its
      // backslash and has no slash, so it stays.
      .replace(/[^\s'`"()]*\/[^\s'`"()]*/g, '<path>')
      .replace(/\b[\w.-]+\\[^\s'`"()]+/g, '<path>')
      .replace(/[`']([^'`\s]+\.[A-Za-z0-9]{1,5})'/g, (m, name: string) => (DISTRIBUTION_FILE.test(name) ? m : "`<file>'"))
      .replace(/\b(line|lines|l\.)\s*\d+(--\d+)?/gi, '$1 N')
      .replace(EMAIL, '<email>')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  );
}

// ─── System information ─────────────────────────────────────────────────────

export interface SystemInfo {
  appVersion: string;
  commit: string;
  installed: boolean;
  os: string;
  node: string;
  tex: { pdflatex: string; latexmk: string };
}

let systemInfoCache: Promise<SystemInfo> | null = null;

async function firstLine(cmd: string, cwd?: string): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout: 10_000, windowsHide: true });
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    return lines.find((l) => /\d+\.\d+/.test(l) && !/^Initial Win CP/i.test(l)) ?? lines[0] ?? '';
  } catch {
    return 'not found';
  }
}

export function collectSystemInfo(): Promise<SystemInfo> {
  systemInfoCache ??= (async () => {
    let appVersion = 'unknown';
    try {
      appVersion = JSON.parse(fs.readFileSync(path.join(APP_ROOT, 'package.json'), 'utf8')).version;
    } catch {
      // keep 'unknown'
    }
    const [commit, pdflatex, latexmk] = await Promise.all([
      firstLine('git rev-parse --short HEAD', APP_ROOT),
      firstLine('pdflatex --version'),
      firstLine('latexmk --version'),
    ]);
    return {
      appVersion,
      commit: /^[0-9a-f]{6,}$/.test(commit) ? commit : 'unknown',
      installed: /[\\/]Programs[\\/]Oberleaf/i.test(APP_ROOT),
      os: `${os.type()} ${os.release()} ${os.arch()}`,
      node: process.version,
      tex: { pdflatex, latexmk },
    };
  })();
  return systemInfoCache;
}

// ─── What the report draws on ───────────────────────────────────────────────

interface RememberedCompile {
  at: string;
  projectDir: string;
  mainFile: string;
  result: CompileResult;
}

const lastCompiles = new Map<string, RememberedCompile>();

/** Keeps the last compile per project so a report can include its full log. */
export function rememberCompile(projectId: string, projectDir: string, mainFile: string, result: CompileResult): void {
  lastCompiles.set(projectId, { at: new Date().toISOString(), projectDir, mainFile, result });
}

export interface ClientErrorEntry {
  at: string;
  message: string;
  stack?: string;
  where?: string;
}

const clientErrors: ClientErrorEntry[] = [];

export function rememberClientError(e: ClientErrorEntry): void {
  clientErrors.push(e);
  if (clientErrors.length > 20) clientErrors.shift();
}

// ─── The report ─────────────────────────────────────────────────────────────

export interface ProblemReport {
  id: string;
  createdAt: string;
  note: string;
  contact?: string;
  system: SystemInfo;
  compile?: {
    at: string;
    engine?: string;
    success: boolean;
    durationMs: number;
    errors: Array<{ file: string; line: number; message: string; explanation?: string; severity?: string }>;
    warnings: Array<{ kind: string; file: string; line: number; message: string }>;
    log: string;
  };
  source?: { file: string; text: string };
  clientErrors: ClientErrorEntry[];
}

export interface ReportRequest {
  projectId?: string;
  note?: string;
  contact?: string;
  includeSource?: boolean;
}

const LOG_LIMIT = 60_000;
const SOURCE_LIMIT = 60_000;

// Keeps the end of a long log, where TeX stops, and says how much was cut.
function tail(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `[first ${text.length - limit} characters omitted]\n${text.slice(-limit)}`;
}

export async function buildReport(req: ReportRequest, readSource?: (projectDir: string, mainFile: string) => string): Promise<ProblemReport> {
  const last = req.projectId ? lastCompiles.get(req.projectId) : undefined;
  const ctx = defaultRedactionContext(last?.projectDir);
  const clean = (s: string) => redact(s, ctx);
  const fileName = (f: string) => clean(f.replace(/\\/g, '/'));

  const report: ProblemReport = {
    id: crypto.randomBytes(4).toString('hex'),
    createdAt: new Date().toISOString(),
    note: (req.note ?? '').slice(0, 4000),
    ...(req.contact?.trim() ? { contact: req.contact.trim().slice(0, 200) } : {}),
    system: await collectSystemInfo(),
    clientErrors: clientErrors.map((e) => ({ ...e, message: clean(e.message), stack: e.stack ? clean(e.stack) : undefined })),
  };

  if (last) {
    const r = last.result;
    report.compile = {
      at: last.at,
      engine: r.engine,
      success: r.success,
      durationMs: r.durationMs,
      errors: r.errors.map((e) => ({
        file: fileName(e.file),
        line: e.line,
        message: clean(e.message),
        explanation: e.friendlyExplanation,
        severity: e.severity,
      })),
      warnings: (r.warningItems ?? []).slice(0, 200).map((w) => ({ kind: w.kind, file: fileName(w.file), line: w.line, message: clean(w.message) })),
      log: tail(clean(r.rawLog ?? ''), LOG_LIMIT),
    };
    // The document itself only when the user ticked the box for this report.
    if (req.includeSource && readSource) {
      try {
        report.source = { file: last.mainFile, text: tail(readSource(last.projectDir, last.mainFile), SOURCE_LIMIT) };
      } catch {
        // Unreadable: send without it.
      }
    }
  }
  return report;
}

const REPORT_JSON_START = '----- BEGIN OBERLEAF REPORT JSON -----';
const REPORT_JSON_END = '----- END OBERLEAF REPORT JSON -----';

/** The report as the user sees it and as a saved file: readable text, then the same data as JSON. */
export function renderReport(r: ProblemReport): string {
  const lines: string[] = [];
  lines.push(`Oberleaf problem report ${r.id}`, `Created: ${r.createdAt}`, '');
  lines.push('What happened', r.note.trim() || '(no description)', '');
  if (r.contact) lines.push(`Contact: ${r.contact}`, '');
  lines.push(
    'System',
    `  Oberleaf ${r.system.appVersion} (${r.system.commit})${r.system.installed ? ', installed' : ', development copy'}`,
    `  ${r.system.os}, Node ${r.system.node}`,
    `  ${r.system.tex.pdflatex}`,
    `  ${r.system.tex.latexmk}`,
    ''
  );
  if (r.compile) {
    const c = r.compile;
    lines.push(`Last compile (${c.at}, ${c.engine ?? 'pdflatex'}): ${c.success ? 'PDF written' : 'no PDF'}, ${(c.durationMs / 1000).toFixed(1)} s`);
    for (const e of c.errors) lines.push(`  ${e.severity === 'warning' ? 'W' : 'E'} ${e.file}:${e.line}  ${e.message}`);
    if (c.warnings.length) lines.push(`  ${c.warnings.length} warning(s)`);
    lines.push('');
  } else {
    lines.push('No compile in this session.', '');
  }
  if (r.clientErrors.length) {
    lines.push('App errors in this session');
    for (const e of r.clientErrors) lines.push(`  ${e.at}  ${e.message}`);
    lines.push('');
  }
  if (r.source) lines.push(`Document source included: ${r.source.file} (${r.source.text.length} characters)`, '');
  lines.push(REPORT_JSON_START, JSON.stringify(r, null, 2), REPORT_JSON_END, '');
  return lines.join('\n');
}

/** Reads the JSON back out of a saved report (scripts/import-report.ts). */
export function parseReportText(text: string): ProblemReport {
  const start = text.indexOf(REPORT_JSON_START);
  const end = text.indexOf(REPORT_JSON_END);
  const json = start >= 0 && end > start ? text.slice(start + REPORT_JSON_START.length, end) : text;
  return JSON.parse(json) as ProblemReport;
}

// GitHub rejects issue URLs much longer than 8 KB; keep well under.
const GITHUB_BODY_LIMIT = 5500;

export function githubIssueUrl(r: ProblemReport, repo: string): string {
  const firstError = r.compile?.errors.find((e) => e.severity !== 'warning');
  const title = `Problem report ${r.id}: ${firstError ? errorSignature(firstError.message) : r.note.split('\n')[0].slice(0, 80) || 'no description'}`;
  const summary = renderReport({ ...r, compile: r.compile ? { ...r.compile, log: '' } : undefined, source: undefined }).split(REPORT_JSON_START)[0];
  const logTail = r.compile?.log ? r.compile.log.slice(-2500) : '';
  let body =
    `${summary.trim()}\n\n` +
    (logTail ? `Last part of the log:\n\n\`\`\`\n${logTail}\n\`\`\`\n\n` : '') +
    'The full report, with the whole log, is in the file Oberleaf saved. Please attach it to this issue.';
  if (body.length > GITHUB_BODY_LIMIT) body = body.slice(0, GITHUB_BODY_LIMIT) + '\n\n[cut to fit a link; attach the saved file]';
  return `https://github.com/${repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}&labels=problem-report`;
}

// ─── Signals ────────────────────────────────────────────────────────────────

export type SignalKind = 'compile-no-reason' | 'unexplained-error' | 'parser-missed' | 'compile-crash' | 'package-install-failed' | 'client-crash';

export interface Signal {
  kind: SignalKind;
  signature: string;
  engine?: string;
}

/**
 * The compile outcomes that point at Oberleaf rather than the document. An
 * ordinary LaTeX mistake that Oberleaf explains is not a signal.
 */
export function signalsFromCompile(result: CompileResult): Signal[] {
  const out: Signal[] = [];
  const hard = result.errors.filter((e) => e.severity !== 'warning');
  if (!result.success && hard.some((e) => e.message === 'No PDF was produced.')) {
    out.push({ kind: 'compile-no-reason', signature: 'no PDF and no error in the log', engine: result.engine });
  }
  for (const e of hard) {
    if (e.friendlyExplanation === GENERIC_EXPLANATION) {
      out.push({ kind: 'unexplained-error', signature: errorSignature(e.message), engine: result.engine });
    }
  }
  const realErrors = hard.filter((e) => e.message !== 'No PDF was produced.' && e.message !== 'No pages of output.');
  if (realErrors.length === 0 && /^! /m.test(result.rawLog ?? '')) {
    const bang = (result.rawLog.match(/^! (.*)$/m)?.[1] ?? '').trim();
    out.push({ kind: 'parser-missed', signature: errorSignature(bang), engine: result.engine });
  }
  // One of each signature per compile.
  return out.filter((s, i) => out.findIndex((x) => x.kind === s.kind && x.signature === s.signature) === i);
}

const sentThisRun = new Set<string>();
let sentToday = { day: '', count: 0 };
const DAILY_LIMIT = 50;

export interface SendOutcome {
  sent: boolean;
  reason?: 'not-configured' | 'opted-out' | 'duplicate' | 'rate-limited' | 'network';
}

/** Posts one event to PostHog. No person profile, no cookies. */
export async function postEvent(
  event: string,
  properties: Record<string, unknown>,
  config: ReportingConfig,
  distinctId: string,
  fetchImpl: typeof fetch = fetch
): Promise<boolean> {
  if (!config.posthogKey) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetchImpl(`${config.posthogHost}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: config.posthogKey,
        event,
        distinct_id: distinctId,
        timestamp: new Date().toISOString(),
        // No person profile, and no GeoIP lookup: "discard client IP data"
        // drops the IP only after PostHog has derived country and coordinates.
        properties: { ...properties, $process_person_profile: false, $geoip_disable: true, $lib: 'oberleaf-server' },
      }),
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Sends a signal unless the user turned signals off. */
export async function sendSignal(
  signal: Signal,
  deps: { config?: ReportingConfig; settings?: ReportingSettings; fetchImpl?: typeof fetch } = {}
): Promise<SendOutcome> {
  const config = deps.config ?? loadReportingConfig();
  const settings = deps.settings ?? readReportingSettings();
  if (!config.posthogKey) return { sent: false, reason: 'not-configured' };
  if (settings.telemetry === 'off') return { sent: false, reason: 'opted-out' };

  const key = `${signal.kind}|${signal.signature}`;
  if (sentThisRun.has(key)) return { sent: false, reason: 'duplicate' };
  const day = new Date().toISOString().slice(0, 10);
  if (sentToday.day !== day) sentToday = { day, count: 0 };
  if (sentToday.count >= DAILY_LIMIT) return { sent: false, reason: 'rate-limited' };
  sentThisRun.add(key);
  sentToday.count++;

  const system = await collectSystemInfo();
  const ok = await postEvent(
    'oberleaf_error_signal',
    {
      kind: signal.kind,
      signature: signal.signature,
      engine: signal.engine,
      app_version: system.appVersion,
      app_commit: system.commit,
      installed: system.installed,
      os: system.os,
      tex: system.tex.pdflatex,
    },
    config,
    settings.installId,
    deps.fetchImpl
  );
  return ok ? { sent: true } : { sent: false, reason: 'network' };
}

/** For tests: forget what was sent in this process. */
export function resetSignalState(): void {
  sentThisRun.clear();
  sentToday = { day: '', count: 0 };
}

/** Sends a report the user chose to send. */
export async function sendReport(r: ProblemReport, deps: { config?: ReportingConfig; fetchImpl?: typeof fetch } = {}): Promise<SendOutcome> {
  const config = deps.config ?? loadReportingConfig();
  if (!config.posthogKey) return { sent: false, reason: 'not-configured' };
  const settings = readReportingSettings();
  const ok = await postEvent(
    'oberleaf_problem_report',
    {
      report_id: r.id,
      note: r.note,
      contact: r.contact,
      app_version: r.system.appVersion,
      app_commit: r.system.commit,
      os: r.system.os,
      tex: r.system.tex.pdflatex,
      compile_success: r.compile?.success,
      first_error: r.compile?.errors.find((e) => e.severity !== 'warning')?.message,
      has_source: !!r.source,
      report: renderReport(r),
    },
    config,
    settings.installId,
    deps.fetchImpl
  );
  return ok ? { sent: true } : { sent: false, reason: 'network' };
}
