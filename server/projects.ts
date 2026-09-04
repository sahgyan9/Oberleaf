import fs from 'fs';
import path from 'path';

export interface ProjectSummary {
  id: string;
  name: string;
  template: string;
  updatedAt: string;
  path: string;
}

export interface FileItem {
  name: string;
  path: string;
  relativePath: string;
  type: 'file' | 'directory';
  extension?: string;
  size?: number;
  children?: FileItem[];
}

const TEMPLATES: Record<string, { mainTex: string; files?: Record<string, string> }> = {
  blank: {
    mainTex: `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Untitled Document}
\\author{Author Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\section{Introduction}
Start typing your document here. To test live equations, type $E = mc^2$ or:
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
\\end{equation}

\\end{document}
`,
  },
  ieee: {
    mainTex: `\\documentclass[conference]{IEEEtran}
\\usepackage{amsmath,amssymb,amsfonts}
\\usepackage{graphicx}
\\usepackage{textcomp}
\\usepackage{xcolor}

\\title{Conference Paper Title*\\\\
{\\footnotesize \\textsuperscript{*}Note: Sub-title here}}

\\author{\\IEEEauthorblockN{First Author}
\\IEEEauthorblockA{\\textit{dept. name of organization} \\\\
\\textit{name of organization}\\\\
City, Country \\\\
email@example.com}
}

\\begin{document}

\\maketitle

\\begin{abstract}
This document is a model and template for \\LaTeX\\ conferences.
\\end{abstract}

\\section{Introduction}
This template provides conference layout compliance.

\\section{Methodology}
Equations render immediately in the editor:
\\begin{equation}
\\mathbf{y} = \\mathbf{X}\\boldsymbol{\\beta} + \\boldsymbol{\\varepsilon}
\\end{equation}

\\end{document}
`,
  },
  thesis: {
    mainTex: `\\documentclass[12pt,a4paper]{report}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Master's Thesis Title}
\\author{Candidate Name}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
A concise summary of the research methodology and key contributions.
\\end{abstract}

\\tableofcontents

\\chapter{Introduction}
Background and motivation for the research.

\\chapter{Literature Review}
Prior work in the domain.

\\end{document}
`,
  },
};

export function getProjectsRoot(): string {
  const root = path.join(process.cwd(), 'projects');
  if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }
  return root;
}

export function listProjects(): ProjectSummary[] {
  const root = getProjectsRoot();
  const entries = fs.readdirSync(root, { withFileTypes: true });

  const projects = entries
    .filter((e) => e.isDirectory())
    .map((dir) => {
      const pPath = path.join(root, dir.name);
      const stat = fs.statSync(pPath);
      return {
        id: dir.name,
        name: dir.name.replace(/[-_]/g, ' '),
        template: 'Standard',
        updatedAt: stat.mtime.toISOString(),
        path: pPath,
      };
    });

  // Sort descending by most recently updated
  return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function createProject(name: string, templateKey: string = 'blank'): ProjectSummary {
  const root = getProjectsRoot();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'new-project';
  let finalSlug = slug;
  let counter = 1;

  while (fs.existsSync(path.join(root, finalSlug))) {
    finalSlug = `${slug}-${counter++}`;
  }

  const projectDir = path.join(root, finalSlug);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'figures'), { recursive: true });

  const template = TEMPLATES[templateKey] || TEMPLATES.blank;
  fs.writeFileSync(path.join(projectDir, 'main.tex'), template.mainTex, 'utf-8');

  return {
    id: finalSlug,
    name,
    template: templateKey,
    updatedAt: new Date().toISOString(),
    path: projectDir,
  };
}

export function listProjectFiles(projectDir: string): FileItem[] {
  const readDir = (currentPath: string): FileItem[] => {
    if (!fs.existsSync(currentPath)) return [];
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    const items: FileItem[] = [];

    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const fullPath = path.join(currentPath, entry.name);
      const relPath = path.relative(projectDir, fullPath).replace(/\\/g, '/');

      try {
        const stat = fs.statSync(fullPath);
        if (entry.isDirectory()) {
          items.push({
            name: entry.name,
            path: fullPath,
            relativePath: relPath,
            type: 'directory',
            children: readDir(fullPath),
          });
        } else {
          items.push({
            name: entry.name,
            path: fullPath,
            relativePath: relPath,
            type: 'file',
            extension: path.extname(entry.name).toLowerCase(),
            size: stat.size,
          });
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    return items.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  };

  return readDir(projectDir);
}

export function getUniqueFilename(directory: string, filename: string): string {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let targetName = filename;
  let counter = 1;

  while (fs.existsSync(path.join(directory, targetName))) {
    targetName = `${base}_${counter++}${ext}`;
  }
  return targetName;
}
