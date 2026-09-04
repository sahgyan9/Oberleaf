import fs from 'fs';
import path from 'path';

export interface BibItem {
  key: string;
  type: string;
  title: string;
  author: string;
  year?: string;
  journal?: string;
  booktitle?: string;
  publisher?: string;
  volume?: string;
  pages?: string;
  doi?: string;
  url?: string;
  raw: string;
  bibFile: string;
}

export function parseBibtexContent(content: string, bibFileName: string = 'references.bib'): BibItem[] {
  const items: BibItem[] = [];
  // Match @type{key, ... }
  const entryRegex = /@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,([^@]*)/g;
  let match: RegExpExecArray | null;

  while ((match = entryRegex.exec(content)) !== null) {
    const entryType = match[1].toLowerCase();
    const key = match[2].trim();
    const body = match[3];

    // Extract fields: field = {value} or field = "value" or field = value
    const fieldRegex = /([a-zA-Z_]+)\s*=\s*(?:\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}|"([^"]*)"|([0-9a-zA-Z_-]+))/g;
    let fieldMatch: RegExpExecArray | null;
    const fields: Record<string, string> = {};

    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const fieldName = fieldMatch[1].toLowerCase();
      const val = (fieldMatch[2] ?? fieldMatch[3] ?? fieldMatch[4] ?? '').trim();
      fields[fieldName] = val;
    }

    items.push({
      key,
      type: entryType,
      title: fields.title || key,
      author: fields.author || 'Unknown',
      year: fields.year,
      journal: fields.journal,
      booktitle: fields.booktitle,
      publisher: fields.publisher,
      volume: fields.volume,
      pages: fields.pages,
      doi: fields.doi,
      url: fields.url,
      raw: `@${entryType}{${key},\n` + Object.entries(fields).map(([k, v]) => `  ${k} = {${v}}`).join(',\n') + '\n}',
      bibFile: bibFileName,
    });
  }

  return items;
}

export function getProjectCitations(projectDir: string): BibItem[] {
  const citations: BibItem[] = [];

  // Find all .bib files
  const findBibFiles = (dir: string): string[] => {
    if (!fs.existsSync(dir)) return [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let bibs: string[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        bibs = bibs.concat(findBibFiles(full));
      } else if (entry.name.toLowerCase().endsWith('.bib')) {
        bibs.push(full);
      }
    }
    return bibs;
  };

  const bibFiles = findBibFiles(projectDir);

  for (const file of bibFiles) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const relPath = path.relative(projectDir, file).replace(/\\/g, '/');
      citations.push(...parseBibtexContent(content, relPath));
    } catch {
      // Ignore unreadable files
    }
  }

  return citations;
}

export function addProjectCitation(
  projectDir: string,
  rawBibtex: string,
  targetBibFile: string = 'references.bib'
): { success: boolean; key: string; item: BibItem } {
  const parsed = parseBibtexContent(rawBibtex, targetBibFile);
  if (parsed.length === 0) {
    throw new Error('Invalid BibTeX entry. Must follow @type{key, ...}');
  }

  const targetPath = path.join(projectDir, targetBibFile);
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const cleanEntry = '\n\n' + rawBibtex.trim() + '\n';
  fs.appendFileSync(targetPath, cleanEntry, 'utf-8');

  return {
    success: true,
    key: parsed[0].key,
    item: parsed[0],
  };
}
