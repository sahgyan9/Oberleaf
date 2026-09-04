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
  ]);

  const allHealthy = dependencies.filter((d) => d.required).every((d) => d.installed);

  return {
    allHealthy,
    dependencies,
    timestamp: new Date().toISOString(),
  };
}
