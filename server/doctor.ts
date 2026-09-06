import { exec } from 'child_process';
import { promisify } from 'util';

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
  ]);

  const allHealthy = dependencies.filter((d) => d.required).every((d) => d.installed);

  return {
    allHealthy,
    dependencies,
    timestamp: new Date().toISOString(),
  };
}
