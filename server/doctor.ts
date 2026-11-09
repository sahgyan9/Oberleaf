import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getProjectsRoot } from './projects.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * A repair the server is allowed to run on the user's behalf. Only actions in
 * DOCTOR_ACTIONS below can be executed; the client sends the id, never a
 * command string, so nothing a request carries ever reaches a process.
 */
export interface AutoFixAction {
  actionId: DoctorActionId;
  /** Button label, phrased as the outcome: "Rebuild font maps" */
  label: string;
  /** Shown before the click: what will run and what it will change */
  effect: string;
}

export interface DependencyStatus {
  id: string;
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  required: boolean;
  guidance: string;
  /** Command the user can run themselves (always shown when something is wrong) */
  wingetCommand?: string;
  /** Present when Oberleaf can run the repair itself */
  autoFix?: AutoFixAction;
  /**
   * The check did not run or does not apply here (no MiKTeX, test compile
   * blocked by something else). Shown apart from "Working": a check that
   * never ran is not evidence that anything works.
   */
  skipped?: boolean;
}

export type TexDistribution = 'miktex' | 'texlive' | 'unknown' | 'none';

export interface DoctorReport {
  allHealthy: boolean;
  distribution: TexDistribution;
  dependencies: DependencyStatus[];
  timestamp: string;
}

// ─── Environment probes ─────────────────────────────────────────────────────

// Goes through the shell on purpose: some TeX front-ends are .cmd/.bat shims
// on Windows, which execFile refuses to launch. Every caller passes constants.
async function firstLineOf(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execAsync([command, ...args].join(' '), { timeout: 10_000, windowsHide: true });
    const lines = stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    // latexmk on Windows opens with "Initial Win CP for (console input,
    // console output): ..." when attached to a console, so the first line is
    // not always the version. Prefer a line that carries a version number.
    return lines.find((l) => /\bv?\d+\.\d+/.test(l) && !/^Initial Win CP/i.test(l)) ?? lines[0] ?? '';
  } catch {
    return null;
  }
}

// Locates a program without running it. MiKTeX installs some tools (biber
// among them) the first time they are executed, so probing with --version
// would make opening this dialog download software.
async function locate(command: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(process.platform === 'win32' ? `where ${command}` : `which ${command}`, {
      timeout: 10_000,
      windowsHide: true,
    });
    return stdout.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

function detectDistribution(pdflatexVersionLine: string | null): TexDistribution {
  if (!pdflatexVersionLine) return 'none';
  if (/MiKTeX/i.test(pdflatexVersionLine)) return 'miktex';
  if (/TeX Live/i.test(pdflatexVersionLine)) return 'texlive';
  return 'unknown';
}

// MiKTeX 22+ ships a single `miktex` utility and has deprecated `mpm`
// (MiKTeX discussion #1346). `initexmf` still works on current releases, so it
// stays the fallback for installs that predate the new CLI.
// Only a positive answer is cached, so installing MiKTeX while the server is
// running is picked up by the next scan.
let miktexCliFound = false;
async function hasMiktexCli(): Promise<boolean> {
  if (!miktexCliFound) {
    miktexCliFound = (await firstLineOf('miktex', ['--version'])) !== null;
  }
  return miktexCliFound;
}

// ─── Repair actions ─────────────────────────────────────────────────────────

export type DoctorActionId = 'miktex-enable-autoinstall' | 'miktex-rebuild-fontmaps';

type Step = { command: string; args: string[] };

async function stepsFor(actionId: DoctorActionId): Promise<Step[]> {
  const cli = await hasMiktexCli();
  switch (actionId) {
    case 'miktex-enable-autoinstall':
      return [{ command: 'initexmf', args: ['--set-config-value=[MPM]AutoInstall=1'] }];
    case 'miktex-rebuild-fontmaps':
      // Refresh the file name database first: a map rebuild that cannot see
      // recently installed .map/.pfb files just writes the same stale table.
      return cli
        ? [
            { command: 'miktex', args: ['fndb', 'refresh'] },
            { command: 'miktex', args: ['fontmaps', 'configure', '--force'] },
          ]
        : [
            { command: 'initexmf', args: ['--update-fndb'] },
            { command: 'initexmf', args: ['--mkmaps', '--force'] },
          ];
  }
}

function describeSteps(steps: Step[]): string {
  return steps.map((s) => [s.command, ...s.args].join(' ')).join(' && ');
}

export const DOCTOR_ACTION_IDS: readonly DoctorActionId[] = [
  'miktex-enable-autoinstall',
  'miktex-rebuild-fontmaps',
];

export interface DoctorFixResult {
  ok: boolean;
  actionId: DoctorActionId;
  ranCommand: string;
  /** Tail of the tool's output, for when it fails */
  output: string;
  report: DoctorReport;
}

export async function runDoctorAction(actionId: DoctorActionId): Promise<DoctorFixResult> {
  const steps = await stepsFor(actionId);
  let output = '';
  let ok = true;

  for (const step of steps) {
    try {
      // execFile, not exec: no shell, so the fixed argument lists above are
      // passed verbatim and nothing is re-parsed.
      const { stdout, stderr } = await execFileAsync(step.command, step.args, {
        timeout: 180_000,
        windowsHide: true,
      });
      output += `${stdout}${stderr}`;
    } catch (err: any) {
      ok = false;
      output += `${err?.stdout ?? ''}${err?.stderr ?? ''}${err?.killed ? '\nTimed out after 3 minutes.' : ''}`;
      if (err?.code === 'ENOENT') output += `\n'${step.command}' is not on PATH.`;
      break;
    }
  }

  // Re-run the whole report so the client sees the effect of the repair
  // rather than assuming it worked.
  const report = await runDependencyCheck(true);
  return {
    ok,
    actionId,
    ranCommand: describeSteps(steps),
    output: output.trim().split('\n').slice(-12).join('\n'),
    report,
  };
}

// ─── Checks ─────────────────────────────────────────────────────────────────

// A basic MiKTeX carries very few packages, so a real document asks for
// titlesec, geometry, hyperref and more on its first compile. By default
// MiKTeX answers that by opening a modal "Package Installation" window per
// package. We spawn pdflatex from the server, so that window has no visible
// owner: the compile blocks until it is clicked and otherwise dies at the
// timeout, which looks exactly like a hang. -interaction=nonstopmode is no
// help, because the prompt comes from MiKTeX's package manager and not from
// TeX. install.ps1 sets this at install time; the check is here for anyone
// who installed MiKTeX themselves or before that fix shipped.
async function checkMiktexAutoInstall(distribution: TexDistribution): Promise<DependencyStatus> {
  const id = 'miktex-autoinstall';
  const name = 'MiKTeX Silent Package Install';
  const manual = 'initexmf --set-config-value="[MPM]AutoInstall=1"';

  if (distribution !== 'miktex') {
    return {
      id,
      name,
      command: 'initexmf',
      installed: true,
      version: 'Not applicable',
      skipped: true,
      required: false,
      guidance:
        distribution === 'texlive'
          ? 'TeX Live does not prompt for packages, so this setting does not apply.'
          : 'No MiKTeX installation detected, so its package prompts do not apply.',
    };
  }

  const value = await firstLineOf('initexmf', ['"--show-config-value=[MPM]AutoInstall"']);

  if (value === '1') {
    return {
      id,
      name,
      command: 'initexmf',
      installed: true,
      version: 'Enabled',
      required: false,
      guidance: 'Missing LaTeX packages are downloaded quietly during compilation.',
    };
  }

  return {
    id,
    name,
    command: 'initexmf',
    installed: false,
    required: false,
    guidance:
      'MiKTeX opens a "Package Installation" dialog for every missing package. ' +
      'That window can sit behind Oberleaf, and compilation stalls until it is answered.',
    wingetCommand: manual,
    autoFix: {
      actionId: 'miktex-enable-autoinstall',
      label: 'Turn on silent install',
      effect:
        'Changes one MiKTeX setting for your user account so missing packages download without a dialog. ' +
        'Takes a second. Your documents are not touched.',
    },
  };
}

// Detects the "auto expansion is only possible with scalable fonts" crash
// that microtype triggers when pdfTeX falls back to bitmap PK fonts.
//
// Static file inspection (kpsewhich + reading pdftex.map) is not reliable —
// the map file can look healthy while pdfTeX's internal map table is stale
// because the maps were never regenerated. The only guaranteed detection is a
// live test compile with microtype enabled.
async function checkFontMaps(distribution: TexDistribution): Promise<DependencyStatus> {
  const id = 'font-maps';
  const name = 'microtype Font Expansion (pdfTeX)';
  const base = { id, name, command: 'pdflatex', required: false };

  if (distribution === 'none') {
    return {
      ...base,
      installed: true,
      version: 'Not applicable',
      skipped: true,
      guidance: 'pdflatex is not available, so the font expansion check was skipped.',
    };
  }

  // OT1 Computer Modern only. A T1 variant would also probe cm-super, but on
  // MiKTeX with silent install enabled that can start a large download just
  // because the user opened this dialog. cm-super is diagnosed from the real
  // compile log instead (see compiler.ts).
  const testTex = [
    '\\documentclass{article}',
    '\\usepackage{microtype}',
    '\\begin{document}',
    '\\textbf{Font expansion test.}',
    '\\end{document}',
  ].join('\n');

  // A private directory per run: two tabs opening the dialog at once used to
  // compile over each other's files in the shared temp folder.
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-doctor-'));
  const texFile = path.join(workDir, 'fontcheck.tex');
  fs.writeFileSync(texFile, testTex, 'utf8');

  const args = [
    '-interaction=nonstopmode',
    '-halt-on-error',
    `-output-directory=${workDir}`,
    // A health check must never open MiKTeX's package dialog. The flag is a
    // MiKTeX extension that TeX Live's pdflatex rejects, hence the guard.
    ...(distribution === 'miktex' ? ['-disable-installer'] : []),
    texFile,
  ];

  let failure: any = null;
  try {
    await execFileAsync('pdflatex', args, { cwd: workDir, timeout: 30_000, windowsHide: true });
  } catch (err) {
    failure = err;
  }

  let log = '';
  try {
    log = fs.readFileSync(path.join(workDir, 'fontcheck.log'), 'utf8');
  } catch {
    /* no log: pdflatex never started */
  }
  try {
    fs.rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* a locked file in a temp dir is harmless */
  }

  if (!failure) {
    return {
      ...base,
      installed: true,
      version: 'Working',
      guidance: 'microtype font expansion compiled. Bold and serif fonts map to scalable Type 1 files.',
    };
  }

  const expansionError = log.match(/\(file ([^)]+)\): auto expansion is only possible with scalable fonts/);
  if (expansionError || /auto expansion is only possible/.test(log)) {
    const isMiktex = distribution === 'miktex';
    const cli = isMiktex && (await hasMiktexCli());
    const steps = isMiktex ? await stepsFor('miktex-rebuild-fontmaps') : [];
    return {
      ...base,
      installed: false,
      guidance:
        `pdfTeX could not find a scalable version of ${expansionError ? `the font "${expansionError[1]}"` : 'a font'} ` +
        'and fell back to a bitmap, which makes microtype stop with "auto expansion is only possible with scalable fonts". ' +
        'The font map table is stale, usually because packages were installed without the maps being regenerated.',
      wingetCommand: isMiktex ? describeSteps(steps) : 'updmap-sys',
      autoFix: isMiktex
        ? {
            actionId: 'miktex-rebuild-fontmaps',
            label: 'Rebuild font maps',
            effect:
              `Runs ${cli ? '"miktex fndb refresh" and "miktex fontmaps configure --force"' : '"initexmf --update-fndb" and "initexmf --mkmaps --force"'} ` +
              'for your user account. Usually under a minute. Your documents are not touched.',
          }
        : undefined,
    };
  }

  if (failure?.killed) {
    return {
      ...base,
      installed: false,
      version: TIMED_OUT,
      guidance:
        'The test compile did not finish within 30 seconds. A TeX process may be waiting on input, ' +
        'or antivirus is scanning the TeX binaries on first use. Re-scan to try again.',
    };
  }

  const missingFile = log.match(/File `([^']+)' not found/);
  if (missingFile) {
    return {
      ...base,
      installed: true,
      version: 'Skipped',
      skipped: true,
      guidance: `The test needs ${missingFile[1]}, which is not installed yet, so font expansion could not be checked. It will be installed the first time a document uses it.`,
    };
  }

  const firstError = log.split('\n').find((l) => l.startsWith('!'));
  return {
    ...base,
    installed: true,
    version: 'Skipped',
    skipped: true,
    guidance: `The test compile stopped for an unrelated reason${firstError ? `: ${firstError.slice(1).trim()}` : ''}. Font expansion could not be checked.`,
  };
}

// Having MiKTeX and TeX Live both on PATH is a quiet source of "package not
// found" reports: the user installs a package with one distribution's manager
// while Oberleaf compiles with the other, which is whichever comes first.
async function checkSingleDistribution(distribution: TexDistribution): Promise<DependencyStatus> {
  const base = {
    id: 'path-conflict',
    name: 'Single TeX Distribution on PATH',
    command: process.platform === 'win32' ? 'where' : 'which',
    required: false,
  };

  let hits: string[] = [];
  try {
    const { stdout } =
      process.platform === 'win32'
        ? await execAsync('where pdflatex', { windowsHide: true })
        : await execAsync('which -a pdflatex');
    hits = [...new Set(stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean))];
  } catch {
    /* none found: reported by the pdflatex check */
  }

  const roots = new Set(
    hits.map((h) => (/miktex/i.test(h) ? 'MiKTeX' : /texlive/i.test(h) ? 'TeX Live' : path.dirname(h)))
  );

  if (roots.size <= 1) {
    return {
      ...base,
      installed: true,
      version: hits.length ? (distribution === 'miktex' ? 'MiKTeX' : distribution === 'texlive' ? 'TeX Live' : 'One found') : 'Not applicable',
      skipped: hits.length === 0,
      guidance: hits.length
        ? `Compiling with ${hits[0]}.`
        : 'No pdflatex on PATH yet.',
    };
  }

  return {
    ...base,
    installed: false,
    guidance:
      `pdflatex exists in more than one place (${[...roots].join(', ')}). Oberleaf uses the first one, ${hits[0]}. ` +
      'Packages installed with the other distribution\'s manager will not be found. ' +
      'Uninstall the distribution you do not use, or move the one you want to the top of PATH.',
  };
}

// latexmk failing to run has two causes with different fixes: the package is
// not installed, or it is installed but cannot start because it is a Perl
// script and MiKTeX does not ship Perl. Telling them apart is the difference
// between installing the right thing and installing Perl for nothing.
async function checkLatexmk(distribution: TexDistribution): Promise<DependencyStatus> {
  const base = { id: 'latexmk', name: 'Build Automator (latexmk)', command: 'latexmk', required: false };
  const fallback = 'Without it, Oberleaf runs the pdflatex and BibTeX passes itself, so compiles still work.';

  const version = await firstLineOf('latexmk', ['-v']);
  if (version !== null) return { ...base, installed: true, version, guidance: 'Installed and runs.' };

  const [found, perl] = await Promise.all([locate('latexmk'), locate('perl')]);
  if (found && !perl) {
    return {
      ...base,
      installed: false,
      guidance: `latexmk is installed (${found}) but cannot start: it is a Perl script and no Perl is on PATH. MiKTeX does not include Perl. ${fallback}`,
      wingetCommand: 'winget install StrawberryPerl.StrawberryPerl',
    };
  }
  if (found) {
    return {
      ...base,
      installed: false,
      guidance: `latexmk is at ${found} and Perl is at ${perl}, but "latexmk -v" failed. Run it in a terminal to see the error. ${fallback}`,
      wingetCommand: 'latexmk -v',
    };
  }
  const install =
    distribution === 'miktex'
      ? (await hasMiktexCli()) ? 'miktex packages install latexmk' : 'mpm --install=latexmk'
      : distribution === 'texlive'
      ? 'tlmgr install latexmk'
      : undefined;
  return {
    ...base,
    installed: false,
    guidance: `latexmk is not installed.${perl ? '' : ' It also needs Perl, which is not on PATH either.'} ${fallback}`,
    wingetCommand: install,
  };
}

// OneDrive locks a file while it uploads it, and with Files On-Demand a
// figure can be an online-only placeholder TeX cannot read. Both surface as
// compile failures ("I can't write on file", missing images) that look like
// document problems.
function checkProjectsFolder(): DependencyStatus {
  const base = { id: 'projects-folder', name: 'Projects Folder', command: 'OBERLEAF_PROJECTS_DIR', required: false };
  let root: string;
  try {
    root = getProjectsRoot();
  } catch {
    return { ...base, installed: true, version: 'Unknown', skipped: true, guidance: 'The projects folder could not be resolved.' };
  }

  if (/[\\/]OneDrive([ -][^\\/]*)?[\\/]/i.test(root + path.sep)) {
    return {
      ...base,
      installed: false,
      guidance:
        `Projects are stored in OneDrive (${root}). OneDrive locks files while it syncs them, which makes a compile fail with ` +
        '"I can\'t write on file", and online-only files cannot be read by TeX. Right-click the folder and choose "Always keep on this device", ' +
        'or point OBERLEAF_PROJECTS_DIR at a folder outside OneDrive.',
    };
  }

  // Build folders grow with every project; under ~500 MB TeX starts failing
  // with "I can't write on file" for reasons unrelated to locking.
  try {
    const stats = fs.statfsSync(root);
    const freeMb = Math.floor((Number(stats.bavail) * Number(stats.bsize)) / 1024 ** 2);
    if (freeMb < 500) {
      return {
        ...base,
        installed: false,
        version: `${freeMb} MB free`,
        guidance: `Only ${freeMb} MB is free on the drive that holds ${root}. Compiles write PDFs and build files there and fail when it fills up.`,
      };
    }
    return {
      ...base,
      installed: true,
      version: freeMb > 10240 ? `${(freeMb / 1024).toFixed(0)} GB free` : `${freeMb} MB free`,
      guidance: `Projects are stored in ${root}, outside OneDrive.`,
    };
  } catch {
    return { ...base, installed: true, version: 'Local folder', guidance: `Projects are stored in ${root}, outside OneDrive.` };
  }
}

// pdfLaTeX turns .eps figures into PDF through epstopdf, which calls
// Ghostscript. MiKTeX ships it as mgs and TeX Live as rungs, so this only
// fails on a stripped-down install. Located, never run.
async function checkGhostscript(distribution: TexDistribution): Promise<DependencyStatus> {
  const base = { id: 'ghostscript', name: 'EPS Figure Support (Ghostscript)', command: 'gs', required: false };
  if (distribution === 'none') {
    return { ...base, installed: true, version: 'Not applicable', skipped: true, guidance: 'No TeX distribution found yet.' };
  }
  const candidates = ['mgs', 'rungs', 'gswin64c', 'gswin32c', 'gs'];
  const found = (await Promise.all(candidates.map(locate))).find((p) => p !== null);
  if (found) return { ...base, installed: true, version: path.basename(found), guidance: `.eps figures are converted with ${found}.` };
  return {
    ...base,
    installed: false,
    guidance: 'No Ghostscript found, so .eps figures cannot be converted and will fail to load. PNG, JPEG and PDF figures are unaffected.',
    wingetCommand: 'winget install ArtifexSoftware.GhostScript',
  };
}

async function checkBinary(
  id: string,
  name: string,
  command: string,
  versionArgs: string[],
  required: boolean,
  guidance: string,
  wingetCommand?: string
): Promise<DependencyStatus> {
  const version = await firstLineOf(command, versionArgs);
  if (version !== null) {
    return { id, name, command, installed: true, version, required, guidance: 'Installed and detected on PATH.' };
  }
  return { id, name, command, installed: false, required, guidance, wingetCommand };
}

// The font test is a real pdflatex run in a temp folder, and the report is
// fetched every time the app opens. Its answer only changes when the TeX
// installation does, so it is kept per pdflatex build until a Re-scan or a
// repair asks for a fresh one. This is about not running TeX (and whatever
// MiKTeX or antivirus does on a TeX start) on every launch, not speed:
// measured on MiKTeX 26.5 it saves ~0.1 s of a ~2.3 s report, which is
// dominated by starting the other probes. A timeout is never kept: it says
// nothing about the fonts.
const TIMED_OUT = 'Timed out';
let fontCheckCache: { key: string; result: DependencyStatus; at: Date } | null = null;

async function fontMapsCached(distribution: TexDistribution, pdflatexVersion: string, force: boolean): Promise<DependencyStatus> {
  const key = `${distribution}|${pdflatexVersion}`;
  if (!force && fontCheckCache?.key === key) {
    const time = fontCheckCache.at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return { ...fontCheckCache.result, guidance: `${fontCheckCache.result.guidance} (Test compile from ${time}; Re-scan repeats it.)` };
  }
  const result = await checkFontMaps(distribution);
  fontCheckCache = result.version === TIMED_OUT ? null : { key, result, at: new Date() };
  return result;
}

/** `force` repeats checks that are otherwise cached, such as the font test compile. */
// The page asks for the report on every load, and a full scan spawns a dozen
// TeX processes (1.3-2.9 s measured). The server starts a scan at boot, and a
// report younger than this is reused, so the first page load gets it for free
// and React StrictMode's double mount in development shares one scan. Anything
// older is rescanned, so a reload after installing TeX still sees the change.
const REPORT_REUSE_MS = 60_000;
let lastReport: { at: number; report: Promise<DoctorReport> } | null = null;

/**
 * The Doctor report. `force` (the Re-scan button, repairs) always rescans and
 * also repeats checks that are cached for longer, such as the font test compile.
 */
export function runDependencyCheck(force = false): Promise<DoctorReport> {
  if (!force && lastReport && Date.now() - lastReport.at < REPORT_REUSE_MS) {
    return lastReport.report;
  }
  const entry = { at: Date.now(), report: scanDependencies(force) };
  lastReport = entry;
  entry.report.catch(() => {
    if (lastReport === entry) lastReport = null;
  });
  return entry.report;
}

async function scanDependencies(force: boolean): Promise<DoctorReport> {
  // Binaries first: the distribution they reveal decides which configuration
  // checks apply and which commands the repairs use.
  const [node, pdflatex, xelatex, biber] = await Promise.all([
    checkBinary('node', 'Node.js Runtime', 'node', ['--version'], true,
      'Node.js is needed to run the local server.', 'winget install OpenJS.NodeJS.LTS'),
    checkBinary('pdflatex', 'LaTeX Engine (pdflatex)', 'pdflatex', ['--version'], true,
      'Required to compile LaTeX documents into PDF.', 'winget install MiKTeX.MiKTeX'),
    checkBinary('xelatex', 'Modern TeX Engine (xelatex)', 'xelatex', ['--version'], false,
      'Needed for documents that use fontspec or system fonts. Ships with MiKTeX and TeX Live.'),
    locate('biber').then((found): DependencyStatus => ({
      id: 'biber',
      name: 'Bibliography Backend (biber)',
      command: 'biber',
      installed: found !== null,
      version: found !== null ? 'On PATH' : undefined,
      required: false,
      guidance: found !== null
        ? `Found at ${found}.`
        : 'Needed for documents that use biblatex, which defaults to biber. Documents using \\bibliographystyle and bibtex do not need it.',
    })),
  ]);

  const distribution = detectDistribution(pdflatex.installed ? pdflatex.version ?? null : null);

  const [latexmk, autoInstall, fontMaps, pathConflict, ghostscript] = await Promise.all([
    checkLatexmk(distribution),
    checkMiktexAutoInstall(distribution),
    fontMapsCached(distribution, pdflatex.version ?? '', force),
    checkSingleDistribution(distribution),
    checkGhostscript(distribution),
  ]);
  const projectsFolder = checkProjectsFolder();

  const dependencies = [
    node, pdflatex, latexmk, xelatex, biber, autoInstall, fontMaps, pathConflict, ghostscript, projectsFolder,
  ];
  const allHealthy = dependencies.filter((d) => d.required).every((d) => d.installed);

  return {
    allHealthy,
    distribution,
    dependencies,
    timestamp: new Date().toISOString(),
  };
}
