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

// Checks that pdfTeX font maps (pdftex.map) have been generated and contain
// scalable Type1 entries for standard Computer Modern fonts.
//
// Without this, pdfTeX silently falls back to bitmap PK fonts. The
// microtype package's "font expansion" feature then crashes with:
//   pdfTeX error (font expansion): auto expansion is only possible with scalable fonts.
// This is the #1 silent failure mode for new MiKTeX installs.
async function checkFontMaps(): Promise<DependencyStatus> {
  const name = 'pdfTeX Font Maps (Type1/Scalable)';
  const fixCommand = 'initexmf --mkmaps --force';

  try {
    // Ask kpsewhich where pdftex.map lives
    const { stdout: mapPath } = await execAsync('kpsewhich pdftex.map');
    const resolvedPath = mapPath.trim();

    if (!resolvedPath) {
      return {
        name,
        command: 'kpsewhich',
        installed: false,
        required: false,
        guidance:
          'pdftex.map was not found by kpsewhich. Font maps have not been generated. ' +
          'This causes a fatal crash when using the microtype package: ' +
          '"auto expansion is only possible with scalable fonts." ' +
          'Run the command below to rebuild font maps.',
        wingetCommand: fixCommand,
      };
    }

    // Verify the map file exists on disk and has meaningful content
    if (!fs.existsSync(resolvedPath)) {
      return {
        name,
        command: 'kpsewhich',
        installed: false,
        required: false,
        guidance:
          `kpsewhich reported "${resolvedPath}" but the file does not exist on disk. ` +
          'Font maps are missing or corrupt. Run the command below to rebuild them.',
        wingetCommand: fixCommand,
      };
    }

    const content = fs.readFileSync(resolvedPath, 'utf8');

    // A healthy map file contains entries for Computer Modern (cmr, cmbx, cmti …)
    // mapped to scalable .pfb Type1 files. An empty or near-empty file means
    // font maps were never fully built.
    const hasCMEntries = /\bcm[a-z]+\d+\s+/.test(content);

    if (!hasCMEntries || content.trim().length < 500) {
      return {
        name,
        command: 'kpsewhich',
        installed: false,
        required: false,
        guidance:
          'pdftex.map exists but appears incomplete — it is missing Computer Modern ' +
          'Type1 font entries. pdfTeX will fall back to bitmap PK fonts, causing ' +
          'microtype to crash with: ' +
          '"auto expansion is only possible with scalable fonts." ' +
          'Run the command below to regenerate font maps.',
        wingetCommand: fixCommand,
      };
    }

    return {
      name,
      command: 'kpsewhich',
      installed: true,
      version: `OK — ${resolvedPath.split(/[\\/]/).pop()}`,
      required: false,
      guidance:
        'Font maps are present and contain scalable Type1 entries. ' +
        'microtype font expansion will work correctly.',
    };
  } catch {
    // kpsewhich not on PATH — almost certainly TeX Live / MiKTeX is absent,
    // which the pdflatex check already covers.
    return {
      name,
      command: 'kpsewhich',
      installed: true,
      version: 'Not applicable',
      required: false,
      guidance: 'kpsewhich is not available; font map check skipped (no TeX installation detected).',
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
