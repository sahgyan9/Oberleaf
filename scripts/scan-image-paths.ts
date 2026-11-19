// Runs the editor's missing-image check over every .tex file in a projects
// folder, read only, and prints each mark. A mark on a document that compiles
// is a false positive. Where the project has a build log (.build/<main>.log),
// each mark is checked against it: "in log" means TeX also failed to load it.
//
//   npx tsx scripts/scan-image-paths.ts                    (OneDrive projects folder)
//   npx tsx scripts/scan-image-paths.ts "D:\some\projects"
//
// Spec: docs/designs/missing-image-check.md.

import fs from 'fs';
import os from 'os';
import path from 'path';
import { graphicsPathsIn, imageFileList } from '../server/imagePaths.js';
import { listProjectFilePaths } from '../server/projectFiles.js';
import { checkImagePaths } from '../src/utils/imageCheck';
import { analyze } from '../src/utils/latexLint';

const root = process.argv[2] ?? path.join(os.homedir(), 'OneDrive', 'Documents', 'Oberleaf Projects');
let texFiles = 0;
let marks = 0;

for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
  const projectDir = path.join(root, entry.name);
  const files = listProjectFilePaths(projectDir);
  const list = imageFileList(files);

  let mainFile = 'main.tex';
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(projectDir, '.meta.json'), 'utf8'));
    if (typeof meta.mainFile === 'string' && meta.mainFile) mainFile = meta.mainFile;
  } catch {
    // no metadata: main.tex
  }
  const read = (rel: string) => {
    try {
      return fs.readFileSync(path.join(projectDir, rel), 'utf8');
    } catch {
      return null;
    }
  };
  const mainText = read(mainFile);
  const mainGraphicsPaths = mainText === null ? null : graphicsPathsIn(analyze(mainText).map((l) => l.code)) ?? [];
  const log = read(path.join('.build', mainFile.replace(/\.tex$/i, '.log'))) ?? '';

  for (const rel of files.filter((f) => /\.(tex|ltx)$/i.test(f))) {
    texFiles++;
    const text = read(rel) ?? '';
    const lines = analyze(text);
    for (const f of checkImagePaths(lines, list, rel === mainFile ? [] : mainGraphicsPaths)) {
      marks++;
      const raw = lines[f.line - 1].raw;
      const name = raw.slice(f.column - 1, f.endColumn - 1).trim();
      const inLog = log ? (log.includes(`\`${name}' not found`) ? 'in log' : 'NOT in log') : 'no log';
      console.log(`${entry.name}/${rel}:${f.line}  ${f.message}${f.suggestion ? ` -> ${f.suggestion}` : ''}  [${inLog}]`);
    }
  }
}

console.log(`\n${texFiles} .tex files, ${marks} image marks`);
