import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { isMiktex } from './compiler.js';

// Installs the TeX package that provides a missing .sty file, and only
// reports success once the file can actually be found.
//
// The previous installer ran `miktex packages install <name>`, then
// `mpm --install=<name>`, then `tlmgr install <name>`, with the file name as
// the package name, and trusted the exit code. Both assumptions failed on a
// real Springer Nature template: cuted.sty is in the MiKTeX package
// "sttools", and mpm prints "The requested package is unknown." yet exits 0,
// so the app announced an install that never happened.

export interface InstallOutcome {
  success: boolean;
  message: string;
  method?: 'miktex' | 'tlmgr' | 'ctan';
  /** Set when the .sty was written into the project rather than the TeX installation */
  file?: string;
}

function run(cmd: string, args: string[], opts: { cwd?: string; timeout?: number } = {}): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd: opts.cwd, timeout: opts.timeout ?? 300_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout, stderr) =>
      resolve({ ok: !error, stdout: String(stdout), stderr: String(stderr) })
    );
  });
}

/** True when the TeX installation can find the file. */
export async function texCanFind(file: string): Promise<boolean> {
  const r = await run('kpsewhich', [file], { timeout: 60_000 });
  return r.stdout.trim().length > 0;
}

// MiKTeX maps a file to its package only inside the engine's on-the-fly
// installer; no command-line tool exposes that lookup. So ask the engine for
// the file once, with the installer enabled, and let it fetch the package.
async function installWithMiktex(sty: string): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-install-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'probe.tex'),
      `\\documentclass{article}\n\\usepackage{${sty}}\n\\begin{document}\n\\end{document}\n`
    );
    await run('pdflatex', ['-enable-installer', '-interaction=nonstopmode', '-halt-on-error', 'probe.tex'], { cwd: dir });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// TeX Live: `tlmgr search --global --file` names the package that contains
// the file, which is often not the file's own name (cuted.sty -> sttools).
async function installWithTlmgr(sty: string): Promise<string | undefined> {
  const search = await run('tlmgr', ['search', '--global', '--file', `/${sty}.sty`], { timeout: 120_000 });
  const pkg = search.stdout
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Za-z0-9._-]+):\s*$/)?.[1])
    .find(Boolean);
  if (!pkg) return undefined;
  await run('tlmgr', ['install', pkg]);
  return pkg;
}

export async function installPackageForSty(sty: string, projectDir: string): Promise<InstallOutcome> {
  const file = `${sty}.sty`;

  if (await isMiktex()) {
    // No kpsewhich before the probe: with AutoInstall set to "ask", MiKTeX's
    // kpsewhich would open an install dialog for a missing file. The probe
    // installs without asking, and afterwards the lookup has nothing to install.
    await installWithMiktex(sty);
    if (await texCanFind(file)) return { success: true, method: 'miktex', message: `Installed ${file} with MiKTeX` };
  } else {
    if (await texCanFind(file)) return { success: true, message: `${file} is already installed; recompiling` };
    const pkg = await installWithTlmgr(sty);
    if (pkg && (await texCanFind(file))) return { success: true, method: 'tlmgr', message: `Installed ${file} (TeX Live package ${pkg})` };
  }

  // Last resort for a package whose .sty sits alone in its CTAN folder.
  try {
    const res = await fetch(`https://mirrors.ctan.org/macros/latex/contrib/${sty}/${file}`);
    if (res.ok) {
      const text = await res.text();
      // A mirror can answer 200 with an HTML page; only a TeX package counts.
      if (/\\(ProvidesPackage|NeedsTeXFormat)\b/.test(text)) {
        fs.writeFileSync(path.join(projectDir, file), text, 'utf-8');
        return { success: true, method: 'ctan', file, message: `Downloaded ${file} from CTAN into this project` };
      }
    }
  } catch {
    // Offline or blocked: fall through to the honest failure below.
  }

  return {
    success: false,
    message:
      `${file} is not available from your TeX package manager or CTAN. ` +
      `If it came with a journal or conference template, copy it into this project from the template's files; ` +
      `otherwise check the package name, and that this computer is online`,
  };
}
