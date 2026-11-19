import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isValidProjectId, listProjects, resolveProjectDir, sanitizeProjectId } from '../server/projects';

describe('project ids (folder names)', () => {
  it('accepts slugs and names made by hand in File Explorer', () => {
    for (const id of [
      'my-paper',
      'thesis_v2.1',
      'Broken Paper',
      'Notes (2026)',
      'Résumé',
      'Lab report & data',
      "Gyan's CV",
      'Paper+Supplement',
      '物理',
    ]) {
      expect(isValidProjectId(id), id).toBe(true);
      expect(sanitizeProjectId(id)).toBe(id);
    }
  });

  it('rejects paths, Windows-forbidden characters and URL breakers', () => {
    for (const id of [
      '',
      '.',
      '..',
      '../other',
      '..\\other',
      'a/b',
      'C:evil',
      'what?',
      'star*',
      'pipe|x',
      'quote"x',
      '<tag>',
      'C# notes',
      '100%',
      'tab\there',
      '.git',
      '.build',
      '-rf',
      'ends.',
      'CON',
      'nul.txt',
      'com1',
      'a'.repeat(201),
    ]) {
      expect(isValidProjectId(id), JSON.stringify(id)).toBe(false);
      expect(() => sanitizeProjectId(id), JSON.stringify(id)).toThrow('Invalid project id');
    }
  });

  it('trims surrounding spaces from a route param', () => {
    expect(sanitizeProjectId('  Broken Paper  ')).toBe('Broken Paper');
  });
});

describe('projects folder with hand-made folders', () => {
  let root: string;
  const previous = process.env.OBERLEAF_PROJECTS_DIR;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-ids-'));
    process.env.OBERLEAF_PROJECTS_DIR = root;
    for (const name of ['clean-notes', 'Broken Paper', 'C# notes', '.git']) {
      fs.mkdirSync(path.join(root, name));
      fs.writeFileSync(path.join(root, name, 'main.tex'), '\\documentclass{article}\n\\begin{document}\nx\n\\end{document}\n');
    }
  });

  afterAll(() => {
    if (previous === undefined) delete process.env.OBERLEAF_PROJECTS_DIR;
    else process.env.OBERLEAF_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('lists a folder with a space and skips folders no route could open', () => {
    const ids = listProjects().map((p) => p.id).sort();
    expect(ids).toEqual(['Broken Paper', 'clean-notes']);
  });

  it('resolves a folder with a space inside the projects root', () => {
    expect(resolveProjectDir('Broken Paper')).toBe(path.join(root, 'Broken Paper'));
    expect(() => resolveProjectDir('../Broken Paper')).toThrow('Invalid project id');
  });
});
