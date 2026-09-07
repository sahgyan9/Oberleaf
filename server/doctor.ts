import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export interface DependencyStatus {
  name: string;
  command: string;
  installed: boolean;
  version?: string;
  required: boolean;
  guidance: string;
  wingetCommand?: string;
}

export interface DoctorReport {
  allHealthy: boolean;
  dependencies: DependencyStatus[];
  timestamp: string;
}

// A basic MiKTeX carries very few packages, so a real document asks for
// titlesec, geometry, hyperref and more on its first compile. By default
// MiKTeX answers that by opening a modal "Package Installation" window per
// package. We spawn pdflatex from the server, so that window has no visible
// owner: the compile blocks until it is clicked and otherwise dies at the
// timeout, which looks exactly like a hang. -interaction=nonstopmode is no
// help, because the prompt comes from MiKTeX's package manager and not from
// TeX. install.ps1 sets this at install time; the check is here for anyone
// who installed MiKTeX themselves or before that fix shipped.
async function checkMiktexAutoInstall(): Promise<DependencyStatus> {
  const name = 'MiKTeX Silent Package Install';
  const fix = 'initexmf --set-config-value="[MPM]AutoInstall=1"';

  try {
    const { stdout } = await execAsync('initexmf --show-config-value="[MPM]AutoInstall"');
    const value = stdout.trim();

    if (value === '1') {
      return {
        name,
        command: 'initexmf',
        installed: true,
        version: 'Enabled',
        required: false,
        guidance: 'Missing LaTeX packages are downloaded quietly during compilation.',
      };
    }

    return {
      name,
      command: 'initexmf',
      installed: false,
      required: false,
      guidance:
        'MiKTeX will open a "Package Installation" dialog for every missing package. ' +
        'That window can sit behind Oberleaf, and compilation stalls until it is answered. ' +
        'Run the command below once to install packages silently instead.',
      wingetCommand: fix,
    };
  } catch {
    // No initexmf means no MiKTeX - either TeX Live, which has no such prompt,
    // or no LaTeX at all, which the pdflatex check above already reports.
    return {
      name,
      command: 'initexmf',
      installed: true,
      version: 'Not applicable',
      required: false,
      guidance: 'No MiKTeX installation detected, so its package prompts do not apply.',
    };
  }
}

// Detects the "auto expansion is only possible with scalable fonts" crash
// that microtype triggers when pdfTeX falls back to bitmap PK fonts.
//
// Static file inspection (kpsewhich + reading pdftex.map) is not reliable —
// the map file can look healthy while pdfTeX's internal map table is stale
// because initexmf --mkmaps was never run. The only guaranteed detection is
// a live test compile with microtype enabled.
async function checkFontMaps(): Promise<DependencyStatus> {
  const name = 'microtype Font Expansion (pdfTeX)';
  const fixCommand = 'initexmf --mkmaps --force';

  // Minimal document that exercises microtype font expansion on bold CM text —
  // the exact combination that caused the crash in the quantum-computing project.
  const testTex = [
    '\\documentclass{article}',
    '\\usepackage{microtype}',
    '\\begin{document}',
    '\\textbf{Font expansion test.}',
    '\\end{document}',
  ].join('\n');

  const os = await import('os');
  const path = await import('path');
  const tmpDir = os.tmpdir();
  const texFile = path.join(tmpDir, '_oberleaf_fontcheck.tex');

  try {
    // Write the test document
    fs.writeFileSync(texFile, testTex, 'utf8');

    // Run pdflatex in nonstopmode so it exits even on errors
    await execAsync(
      `pdflatex -interaction=nonstopmode -output-directory="${tmpDir}" "${texFile}"`,
      { timeout: 20_000 }
    );

    // Clean up artefacts
    for (const ext of ['.tex', '.pdf', '.aux', '.log']) {
      const f = path.join(tmpDir, `_oberleaf_fontcheck${ext}`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    // If pdflatex exited with code 0 the document compiled cleanly
    return {
      name,
      command: 'pdflatex',
      installed: true,
      version: 'OK — expansion works',
      required: false,
      guidance:
        'microtype font expansion compiled successfully. ' +
        'Bold and serif fonts are mapped to scalable Type1 files.',
    };
  } catch (err: unknown) {
    // pdflatex exits with code 1 when it hits a fatal error.
    // Inspect the log to distinguish the font-expansion error from anything else.
    const logFile = path.join(tmpDir, '_oberleaf_fontcheck.log');
    let logContent = '';
    try {
      if (fs.existsSync(logFile)) logContent = fs.readFileSync(logFile, 'utf8');
    } catch { /* ignore */ }

    // Clean up artefacts even on failure
    for (const ext of ['.tex', '.pdf', '.aux', '.log']) {
      const f = path.join(tmpDir, `_oberleaf_fontcheck${ext}`);
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
    }

    const isFontExpansionError =
      logContent.includes('auto expansion is only possible with scalable fonts') ||
      (err instanceof Error && err.message.includes('auto expansion'));

    if (isFontExpansionError) {
      return {
        name,
        command: 'pdflatex',
        installed: false,
        required: false,
        guidance:
          'pdfTeX font maps are stale or missing. pdfTeX falls back to bitmap PK fonts, ' +
          'which causes microtype to crash with: ' +
          '"auto expansion is only possible with scalable fonts." ' +
          'Run the command below to rebuild font maps, then restart Oberleaf.',
        wingetCommand: fixCommand,
      };
    }

    // pdflatex not on PATH — already reported by the main pdflatex check
    return {
      name,
      command: 'pdflatex',
      installed: true,
      version: 'Not applicable',
      required: false,
      guidance: 'pdflatex is not available; font expansion check skipped.',
    };
  }
}


export async function runDependencyCheck(): Promise<DoctorReport> {
  const check = async (
    name: string,
    command: string,
    versionFlag: string,
    required: boolean,
    guidance: string,
    wingetCommand?: string
  ): Promise<DependencyStatus> => {
    try {
      const { stdout } = await execAsync(`${command} ${versionFlag}`);
      const firstLine = stdout.split('\n')[0].trim();
      return {
        name,
        command,
        installed: true,
        version: firstLine,
        required,
        guidance: 'Installed and detected on system PATH.',
      };
    } catch {
      return {
        name,
        command,
        installed: false,
        required,
        guidance,
        wingetCommand,
      };
    }
  };

  const dependencies: DependencyStatus[] = await Promise.all([
    check(
      'Node.js Runtime',
      'node',
      '--version',
      true,
      'Node.js is needed to run the local server.',
      'winget install OpenJS.NodeJS.LTS'
    ),
    check(
      'LaTeX Engine (pdflatex)',
      'pdflatex',
      '--version',
      true,
      'Required to compile your LaTeX documents into PDF format.',
      'winget install MiKTeX.MiKTeX'
    ),
    check(
      'Build Automator (latexmk)',
      'latexmk',
      '-v',
      false,
      'Optional multi-pass compiler. If absent or Perl is missing, direct pdflatex compilation is used automatically.',
      'winget install StrawberryPerl.StrawberryPerl'
    ),
    check(
      'Modern TeX Engine (xelatex)',
      'xelatex',
      '--version',
      false,
      'Optional engine for advanced Unicode fonts and modern typographies.'
    ),
    checkMiktexAutoInstall(),
    checkFontMaps(),
  ]);

  const allHealthy = dependencies.filter((d) => d.required).every((d) => d.installed);

  return {
    allHealthy,
    dependencies,
    timestamp: new Date().toISOString(),
  };
}
