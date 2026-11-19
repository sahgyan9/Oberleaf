import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GENERIC_EXPLANATION, type CompileResult } from '../server/compiler.js';
import {
  buildReport,
  errorSignature,
  githubIssueUrl,
  identifyingSegments,
  parseReportText,
  readReportingSettings,
  redact,
  rememberCompile,
  renderReport,
  resetSignalState,
  sendSignal,
  signalsFromCompile,
  writeReportingSettings,
  type ReportingConfig,
} from '../server/reporting.js';

const ctx = {
  username: 'gyan',
  homeDir: 'C:\\Users\\gyan',
  projectDir: 'C:\\Users\\gyan\\OneDrive - SRM University AP\\Documents\\Oberleaf Projects\\thesis-gyan',
};

const result = (over: Partial<CompileResult>): CompileResult => ({
  success: true,
  durationMs: 1200,
  errors: [],
  warnings: [],
  warningItems: [],
  rawLog: '',
  engine: 'pdflatex',
  ...over,
});

describe('redact', () => {
  it('masks the user name and identifying project folders, keeping length and line breaks', () => {
    const line = '(C:/Users/gyan/OneDrive - SRM University AP/Documents/Oberleaf Projects/thesis-gyan/main.tex';
    const out = redact(line, ctx);
    expect(out).not.toMatch(/gyan|SRM/);
    expect(out).toContain('Oberleaf Projects');
    expect(out).toContain('/main.tex');
    expect(out.length).toBe(line.length);
  });

  it('finds a user name that TeX wrapped across two lines', () => {
    const log = 'C:/Users/gy\nan/AppData/Local/Temp/x.tex';
    const out = redact(log, ctx);
    expect(out).not.toContain('gy\nan');
    expect(out.split('\n').map((l) => l.length)).toEqual(log.split('\n').map((l) => l.length));
  });

  it('leaves TeX commands and ordinary words alone', () => {
    expect(redact('! Undefined control sequence.\nl.7 The fit uses \\fitmodel', ctx)).toBe('! Undefined control sequence.\nl.7 The fit uses \\fitmodel');
  });

  it('masks e-mail addresses', () => {
    expect(redact('\\href{mailto:someone@example.org}', ctx)).not.toContain('someone@example.org');
  });

  it('does not treat generic folders as identifying', () => {
    expect(identifyingSegments(ctx)).toEqual(['OneDrive - SRM University AP', 'thesis-gyan', 'gyan']);
  });
});

describe('errorSignature', () => {
  it('removes paths, including ones with spaces', () => {
    expect(errorSignature("C:/Users/x/Oberleaf Projects/p/main.tex:4: LaTeX Error: oops")).toBe('<path>:4: LaTeX Error: oops');
  });
  it('replaces file names the user chose but keeps TeX package names', () => {
    expect(errorSignature("LaTeX Error: File `chapter-gyan.tex' not found.")).toBe("LaTeX Error: File `<file>' not found.");
    expect(errorSignature("LaTeX Error: File `cuted.sty' not found.")).toBe("LaTeX Error: File `cuted.sty' not found.");
  });
  it('keeps TeX commands', () => {
    expect(errorSignature('Missing \\begin{document}.')).toBe('Missing \\begin{document}.');
  });
  it('normalises line numbers so the same bug groups together', () => {
    expect(errorSignature('Overfull \\hbox in paragraph at lines 12--14')).toBe(errorSignature('Overfull \\hbox in paragraph at lines 3--4'));
  });
});

describe('signalsFromCompile', () => {
  it('ignores an ordinary mistake Oberleaf explains', () => {
    const r = result({ errors: [{ file: 'main.tex', line: 3, message: 'Undefined control sequence.', friendlyExplanation: '\\foo is not defined', raw: '' }] });
    expect(signalsFromCompile(r)).toEqual([]);
  });
  it('flags a failure with no reason, an unexplained error and a missed ! line', () => {
    expect(signalsFromCompile(result({ success: false, errors: [{ file: 'main.tex', line: 0, message: 'No PDF was produced.', raw: '' }] }))[0].kind).toBe(
      'compile-no-reason'
    );
    const unexplained = signalsFromCompile(
      result({ errors: [{ file: 'main.tex', line: 3, message: 'Weird new error at line 3', friendlyExplanation: GENERIC_EXPLANATION, raw: '' }] })
    );
    expect(unexplained).toEqual([{ kind: 'unexplained-error', signature: 'Weird new error at line N', engine: 'pdflatex' }]);
    expect(signalsFromCompile(result({ rawLog: 'x\n! Something unknown.\n' }))[0]).toMatchObject({ kind: 'parser-missed', signature: 'Something unknown.' });
  });
});

describe('sendSignal', () => {
  const config: ReportingConfig = { posthogKey: 'phc_test', posthogHost: 'https://posthog.invalid', githubRepo: 'o/r' };
  const signal = { kind: 'client-crash' as const, signature: 'TypeError: x is undefined' };
  beforeEach(() => resetSignalState());

  it('sends nothing once the user turned signals off', async () => {
    const fetchImpl = vi.fn();
    const out = await sendSignal(signal, { config, settings: { telemetry: 'off', installId: 'i' }, fetchImpl });
    expect(out).toEqual({ sent: false, reason: 'opted-out' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('is on by default, before the notice has been answered', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const out = await sendSignal(signal, { config, settings: { telemetry: 'unset', installId: 'i' }, fetchImpl: fetchImpl as any });
    expect(out).toEqual({ sent: true });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('sends nothing when no PostHog key is configured', async () => {
    const fetchImpl = vi.fn();
    const out = await sendSignal(signal, { config: { ...config, posthogKey: '' }, settings: { telemetry: 'on', installId: 'i' }, fetchImpl });
    expect(out.reason).toBe('not-configured');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends one anonymous event when on, and only once per signature', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 200 }));
    const deps = { config, settings: { telemetry: 'on' as const, installId: 'install-1' }, fetchImpl: fetchImpl as any };
    expect(await sendSignal(signal, deps)).toEqual({ sent: true });
    expect(await sendSignal(signal, deps)).toEqual({ sent: false, reason: 'duplicate' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://posthog.invalid/capture/');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ api_key: 'phc_test', event: 'oberleaf_error_signal', distinct_id: 'install-1' });
    expect(body.properties).toMatchObject({ kind: 'client-crash', signature: 'TypeError: x is undefined', $process_person_profile: false, $geoip_disable: true });
    expect(JSON.stringify(body)).not.toMatch(new RegExp(os.userInfo().username, 'i'));
  });
});

describe('reports', () => {
  let projectDir: string;
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-report-'));
    fs.writeFileSync(path.join(projectDir, 'main.tex'), '\\documentclass{article}\nsecret thesis text\n');
  });
  afterEach(() => fs.rmSync(projectDir, { recursive: true, force: true }));

  const remember = () =>
    rememberCompile('p1', projectDir, 'main.tex', result({
      success: false,
      errors: [{ file: path.join(projectDir, 'main.tex'), line: 2, message: 'Undefined control sequence.', raw: '' }],
      rawLog: `(${projectDir.replace(/\\/g, '/')}/main.tex\n! Undefined control sequence.\n`,
    }));
  const read = (dir: string, f: string) => fs.readFileSync(path.join(dir, f), 'utf8');

  it('leaves the document out unless the user asks for it', async () => {
    remember();
    const without = await buildReport({ projectId: 'p1', note: 'broke' }, read);
    expect(without.source).toBeUndefined();
    expect(renderReport(without)).not.toContain('secret thesis text');
    const withSource = await buildReport({ projectId: 'p1', note: 'broke', includeSource: true }, read);
    expect(withSource.source?.text).toContain('secret thesis text');
  });

  it('redacts the project folder and user name in the log and file names', async () => {
    remember();
    const r = await buildReport({ projectId: 'p1' }, read);
    const folder = path.basename(projectDir);
    expect(r.compile!.log).not.toContain(folder);
    expect(r.compile!.errors[0].file).not.toContain(folder);
    expect(r.compile!.log).toContain('! Undefined control sequence.');
  });

  it('round-trips through the saved text', async () => {
    remember();
    const r = await buildReport({ projectId: 'p1', note: 'it broke' }, read);
    expect(parseReportText(renderReport(r))).toEqual(JSON.parse(JSON.stringify(r)));
  });

  it('builds a GitHub link short enough to open', async () => {
    remember();
    const r = await buildReport({ projectId: 'p1', note: 'x'.repeat(20000) }, read);
    const url = githubIssueUrl(r, 'sahgyan9/Oberleaf');
    expect(url.startsWith('https://github.com/sahgyan9/Oberleaf/issues/new?')).toBe(true);
    expect(url.length).toBeLessThan(8000 * 3);
    expect(decodeURIComponent(url.split('body=')[1])).not.toContain('secret thesis text');
  });
});

describe('settings', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-settings-'));
    process.env.OBERLEAF_SETTINGS_DIR = dir;
  });
  afterEach(() => {
    delete process.env.OBERLEAF_SETTINGS_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('starts undecided with a random install id, and remembers the choice', () => {
    const first = readReportingSettings();
    expect(first.telemetry).toBe('unset');
    expect(first.installId).toMatch(/^[0-9a-f-]{36}$/);
    writeReportingSettings({ ...first, telemetry: 'on' });
    expect(readReportingSettings()).toEqual({ ...first, telemetry: 'on' });
  });
});

describe('client and server agree', () => {
  it('on the text of an unexplained error', async () => {
    const { UNEXPLAINED_ERROR_TEXT } = await import('../src/utils/compileDiagnostics');
    expect(UNEXPLAINED_ERROR_TEXT).toBe(GENERIC_EXPLANATION);
  });
});

describe('scripts/fetch-reports.ts', () => {
  it('reads .env lines', async () => {
    const { parseEnv } = await import('../scripts/fetch-reports');
    expect(parseEnv('# c\nPOSTHOG_PROJECT_ID=123\nPOSTHOG_PERSONAL_API_KEY="phx_a"\n')).toEqual({ POSTHOG_PROJECT_ID: '123', POSTHOG_PERSONAL_API_KEY: 'phx_a' });
  });

  it('saves each report once and returns the signal table', async () => {
    const { fetchReports } = await import('../scripts/fetch-reports');
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-fetch-'));
    const calls: any[] = [];
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)), auth: (init.headers as any).Authorization });
      const q = JSON.parse(String(init.body)).query.query as string;
      const results = q.includes('oberleaf_problem_report')
        ? [['0a1b2c3d', '2026-11-19T10:00:00Z', 'Oberleaf problem report 0a1b2c3d'], ['../evil', 't', 'x']]
        : [['client-crash', 'TypeError: x', 3, 2, 'abc1234']];
      return new Response(JSON.stringify({ results }), { status: 200 });
    });
    try {
      const out = await fetchReports({ days: 7, apiHost: 'https://us.posthog.com/', projectId: '42', apiKey: 'phx_k', outDir, fetchImpl: fetchImpl as any });
      expect(out.saved.map((f) => path.basename(f))).toEqual(['0a1b2c3d.txt']);
      expect(out.signals).toEqual([['client-crash', 'TypeError: x', 3, 2, 'abc1234']]);
      expect(calls[0].url).toBe('https://us.posthog.com/api/projects/42/query/');
      expect(calls[0].auth).toBe('Bearer phx_k');
      expect(calls[0].body.query.query).toContain('INTERVAL 7 DAY');
      // A second run does not rewrite what is already there.
      const again = await fetchReports({ days: 7, apiHost: 'https://us.posthog.com', projectId: '42', apiKey: 'phx_k', outDir, fetchImpl: fetchImpl as any });
      expect(again.saved).toEqual([]);
    } finally {
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  });
});
