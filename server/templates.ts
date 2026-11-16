// Project templates. Each one is a folder of ordinary LaTeX files under
// templates/, listed in templates/catalog.json. Keeping them as real files
// (rather than strings in a .ts file) means they can be opened, compiled and
// previewed directly: scripts/build-template-previews.ts does exactly that.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const TEMPLATES_ROOT = path.join(here, '..', 'templates');

export interface TemplateCategory {
  id: string;
  title: string;
}

export interface TemplateInfo {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  /** Project-relative paths of the files the template creates */
  files: string[];
  hasPreview: boolean;
}

export interface TemplateCatalog {
  categories: TemplateCategory[];
  templates: TemplateInfo[];
}

/** Files in a template folder that are not part of the project it creates */
const NOT_PROJECT_FILES = new Set(['preview.webp']);

const TEMPLATE_ID = /^[a-z0-9][a-z0-9-]*$/;

function listFiles(dir: string, prefix = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(path.join(dir, entry.name), rel));
    else if (!prefix && NOT_PROJECT_FILES.has(entry.name)) continue;
    else out.push(rel);
  }
  return out.sort((a, b) => (a === 'main.tex' ? -1 : b === 'main.tex' ? 1 : a.localeCompare(b)));
}

let cached: TemplateCatalog | null = null;

export function getTemplateCatalog(): TemplateCatalog {
  if (cached) return cached;
  const raw = JSON.parse(fs.readFileSync(path.join(TEMPLATES_ROOT, 'catalog.json'), 'utf-8'));
  const templates: TemplateInfo[] = [];
  for (const t of raw.templates as TemplateInfo[]) {
    const dir = path.join(TEMPLATES_ROOT, t.id);
    // A catalog entry without a main.tex cannot create a project; leave it out
    // rather than offer a template that fails when picked.
    if (!TEMPLATE_ID.test(t.id) || !fs.existsSync(path.join(dir, 'main.tex'))) continue;
    templates.push({
      id: t.id,
      title: t.title,
      description: t.description,
      category: t.category,
      tags: Array.isArray(t.tags) ? t.tags : [],
      files: listFiles(dir),
      hasPreview: fs.existsSync(path.join(dir, 'preview.webp')),
    });
  }
  cached = { categories: raw.categories as TemplateCategory[], templates };
  return cached;
}

export function getTemplate(id: string): TemplateInfo | undefined {
  return getTemplateCatalog().templates.find((t) => t.id === id);
}

export function getTemplatePreviewPath(id: string): string | null {
  const t = getTemplate(id);
  return t && t.hasPreview ? path.join(TEMPLATES_ROOT, t.id, 'preview.webp') : null;
}

export function readTemplateFile(id: string, relPath: string): string {
  return fs.readFileSync(path.join(TEMPLATES_ROOT, id, relPath), 'utf-8');
}

/** Copies every file of a template into a new project folder. */
export function writeTemplateInto(id: string, projectDir: string): void {
  const t = getTemplate(id);
  if (!t) throw new Error(`Unknown template "${id}"`);
  for (const rel of t.files) {
    const target = path.join(projectDir, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(TEMPLATES_ROOT, id, rel), target);
  }
}
