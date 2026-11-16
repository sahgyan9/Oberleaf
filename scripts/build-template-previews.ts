// Compiles every template under templates/ and saves its first page as
// templates/<id>/preview.webp, the thumbnail the template gallery shows.
//
//   npx tsx scripts/build-template-previews.ts            all templates
//   npx tsx scripts/build-template-previews.ts thesis cv  only these
//
// It doubles as the template test: a template that does not compile cleanly
// fails the run. Needs latexmk and pdftoppm (both ship with MiKTeX and TeX Live).

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import sharp from 'sharp';
import { getTemplateCatalog, TEMPLATES_ROOT } from '../server/templates.js';

const only = process.argv.slice(2);
const PREVIEW_WIDTH = 520;

function run(cmd: string, args: string[], cwd: string): { ok: boolean; output: string } {
  try {
    const output = execFileSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output };
  } catch (err: any) {
    return { ok: false, output: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

let failed = 0;

for (const t of getTemplateCatalog().templates) {
  if (only.length && !only.includes(t.id)) continue;
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `oberleaf-template-${t.id}-`));
  try {
    for (const rel of t.files) {
      fs.mkdirSync(path.dirname(path.join(work, rel)), { recursive: true });
      fs.copyFileSync(path.join(TEMPLATES_ROOT, t.id, rel), path.join(work, rel));
    }

    const t0 = Date.now();
    const build = run('latexmk', ['-pdf', '-interaction=nonstopmode', '-halt-on-error', 'main.tex'], work);
    const log = fs.existsSync(path.join(work, 'main.log')) ? fs.readFileSync(path.join(work, 'main.log'), 'utf8') : '';
    const problems = log
      .split(/\r?\n/)
      .filter((l) => /^! |LaTeX Warning: (Reference|Citation) .* undefined|There were undefined/.test(l));
    if (!build.ok || !fs.existsSync(path.join(work, 'main.pdf')) || problems.length) {
      failed++;
      console.error(`FAILED  ${t.id}`);
      for (const p of problems.slice(0, 8)) console.error(`        ${p}`);
      if (!problems.length) console.error(build.output.split(/\r?\n/).slice(-12).join('\n'));
      continue;
    }

    const png = run('pdftoppm', ['-png', '-r', '110', '-f', '1', '-l', '1', '-singlefile', 'main.pdf', 'page'], work);
    if (!png.ok) {
      failed++;
      console.error(`FAILED  ${t.id}: pdftoppm could not render the first page\n${png.output}`);
      continue;
    }
    await sharp(path.join(work, 'page.png'))
      .resize({ width: PREVIEW_WIDTH })
      .webp({ quality: 82 })
      .toFile(path.join(TEMPLATES_ROOT, t.id, 'preview.webp'));
    console.log(`ok      ${t.id}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

if (failed) {
  console.error(`\n${failed} template(s) failed.`);
  process.exit(1);
}
