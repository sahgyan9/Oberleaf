// Pulls problem reports and error-signal counts from PostHog, for the
// developer. Step 3 of docs/ERROR_REPORTING.md.
//
//   npx tsx scripts/fetch-reports.ts            last 14 days
//   npx tsx scripts/fetch-reports.ts --days 30
//
// Needs, in .env at the repository root (never committed):
//   POSTHOG_PERSONAL_API_KEY=phx_...   a personal API key with "query" read access
//   POSTHOG_PROJECT_ID=12345           the project's numeric ID (Project settings)
//   POSTHOG_API_HOST=https://us.posthog.com   or https://eu.posthog.com
//
// Each report is saved as .tmp/reports/<report_id>.txt, the same format the
// app saves, so scripts/import-report.ts takes it directly. Signals are
// printed as a table: which failure, how often, on how many installations.

import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** KEY=value lines; # comments and surrounding quotes allowed. */
export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

export interface FetchOptions {
  days: number;
  apiHost: string;
  projectId: string;
  apiKey: string;
  outDir: string;
  fetchImpl?: typeof fetch;
}

async function hogql(o: FetchOptions, query: string): Promise<any[][]> {
  const res = await (o.fetchImpl ?? fetch)(`${o.apiHost.replace(/\/+$/, '')}/api/projects/${o.projectId}/query/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${o.apiKey}` },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  if (!res.ok) throw new Error(`PostHog query failed: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).results ?? [];
}

export async function fetchReports(
  o: FetchOptions
): Promise<{ saved: string[]; signals: any[][]; documentErrors: any[][]; feedback: any[][] }> {
  const days = Math.max(1, Math.min(365, Math.floor(o.days)));
  const reports = await hogql(
    o,
    `SELECT properties.report_id, timestamp, properties.report FROM events ` +
      `WHERE event = 'oberleaf_problem_report' AND timestamp > now() - INTERVAL ${days} DAY ORDER BY timestamp DESC LIMIT 500`
  );
  fs.mkdirSync(o.outDir, { recursive: true });
  const saved: string[] = [];
  for (const [id, , text] of reports) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}$/.test(id) || typeof text !== 'string') continue;
    const file = path.join(o.outDir, `${id}.txt`);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, text, 'utf8');
      saved.push(file);
    }
  }
  const signals = await hogql(
    o,
    `SELECT properties.kind, properties.signature, count() AS n, count(DISTINCT distinct_id) AS installs, max(properties.app_commit) ` +
      `FROM events WHERE event = 'oberleaf_error_signal' AND timestamp > now() - INTERVAL ${days} DAY ` +
      `GROUP BY properties.kind, properties.signature ORDER BY n DESC LIMIT 100`
  );
  // The mistakes users make most, and whether a fix was offered for them.
  const documentErrors = await hogql(
    o,
    `SELECT properties.signature, properties.command, properties.fix, count() AS n, count(DISTINCT distinct_id) AS installs ` +
      `FROM events WHERE event = 'oberleaf_document_error' AND timestamp > now() - INTERVAL ${days} DAY ` +
      `GROUP BY properties.signature, properties.command, properties.fix ORDER BY n DESC LIMIT 100`
  );
  // "Diagnosis wrong or unclear?" clicks, each with the note the user added, if any.
  const feedback = await hogql(
    o,
    `SELECT f.properties.feedback_id, f.timestamp, f.properties.first_signature, toString(f.properties.errors), n.note ` +
      `FROM events AS f LEFT JOIN (SELECT properties.feedback_id AS id, properties.note AS note FROM events ` +
      `WHERE event = 'oberleaf_diagnosis_note' AND timestamp > now() - INTERVAL ${days} DAY) AS n ON n.id = f.properties.feedback_id ` +
      `WHERE f.event = 'oberleaf_diagnosis_feedback' AND f.timestamp > now() - INTERVAL ${days} DAY ORDER BY f.timestamp DESC LIMIT 100`
  );
  return { saved, signals, documentErrors, feedback };
}

async function main() {
  const envPath = path.join(ROOT, '.env');
  const env = { ...(fs.existsSync(envPath) ? parseEnv(fs.readFileSync(envPath, 'utf8')) : {}), ...process.env } as Record<string, string>;
  const missing = ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID'].filter((k) => !env[k]);
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(', ')}. See the header of scripts/fetch-reports.ts.`);
    process.exitCode = 1;
    return;
  }
  const daysArg = process.argv.indexOf('--days');
  const { saved, signals, documentErrors, feedback } = await fetchReports({
    days: daysArg > 0 ? Number(process.argv[daysArg + 1]) || 14 : 14,
    apiHost: env.POSTHOG_API_HOST || 'https://us.posthog.com',
    projectId: env.POSTHOG_PROJECT_ID,
    apiKey: env.POSTHOG_PERSONAL_API_KEY,
    outDir: path.join(ROOT, '.tmp', 'reports'),
  });
  console.log(saved.length ? `New reports:\n${saved.map((f) => `  ${path.relative(ROOT, f)}`).join('\n')}` : 'No new reports.');
  console.log('\nError signals (count, installations, kind, signature):');
  if (!signals.length) console.log('  none');
  for (const [kind, signature, n, installs] of signals) console.log(`  ${String(n).padStart(4)} ${String(installs).padStart(4)}  ${kind}  ${signature}`);
  console.log('\nDocument mistakes Oberleaf explained (count, installations, fix offered, command, message):');
  if (!documentErrors.length) console.log('  none');
  for (const [signature, command, fix, n, installs] of documentErrors) {
    console.log(`  ${String(n).padStart(4)} ${String(installs).padStart(4)}  ${String(fix ?? 'none').padEnd(15)} ${command ?? '-'}  ${signature}`);
  }
  console.log('\n"Diagnosis wrong or unclear?" (id, time, first error, note):');
  if (!feedback.length) console.log('  none');
  for (const [id, at, first, , note] of feedback) console.log(`  ${id}  ${String(at).slice(0, 16)}  ${first ?? '-'}${note ? `\n           note: ${note}` : ''}`);
  if (saved.length) console.log('\nNext: npx tsx scripts/import-report.ts <file>');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}
