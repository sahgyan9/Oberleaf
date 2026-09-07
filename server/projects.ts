import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

// ----------------------------------------------------
// Path containment helpers (canonical definitions)
// ----------------------------------------------------

// Contain a resolved path inside a root directory.
// `startsWith(root)` alone is not enough: "<root>/proj" also prefixes
// "<root>/proj-evil", so the separator has to be part of the comparison.
export function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalized = path.resolve(candidate);
  return normalized === normalizedRoot || normalized.startsWith(normalizedRoot + path.sep);
}

// A project id is a single directory name, never a path.
// Express decodes route params, so "..%2F..%2Ffoo" arrives here as "../../foo".
export function sanitizeProjectId(rawId: string): string {
  const id = (rawId || '').trim();
  if (!id || id === '.' || id === '..') {
    throw new Error('Invalid project id');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error('Invalid project id');
  }
  return id;
}

// Resolve a project directory from an untrusted id. Every function in this
// module that takes a projectId must go through here -- callers reach these
// straight from route params.
export function resolveProjectDir(rawId: string): string {
  const root = getProjectsRoot();
  const targetDir = path.resolve(root, sanitizeProjectId(rawId));
  if (!isInside(root, targetDir)) {
    throw new Error('Access outside project boundary is forbidden');
  }
  return targetDir;
}

export interface ProjectSummary {
  id: string;
  name: string;
  template: string;
  updatedAt: string;
  lastModifiedRelative?: string;
  owner?: string;
  isArchived?: boolean;
  hasPdf?: boolean;
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
  cv: {
    mainTex: `\\documentclass[a4paper, 10pt]{article}

\\usepackage[
  top=1.5cm, bottom=1.5cm,
  left=1.5cm, right=1.5cm
]{geometry}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\usepackage{microtype}
\\usepackage{xcolor}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage{hyperref}
\\usepackage{parskip}

% Color Palette
\\definecolor{primary}{HTML}{1E293B}   % Deep slate
\\definecolor{accent}{HTML}{2563EB}    % Scholarly blue
\\definecolor{muted}{HTML}{64748B}     % Slate muted

\\hypersetup{
  colorlinks=true,
  urlcolor=accent,
  linkcolor=accent
}

\\titleformat{\\section}
  {\\large\\bfseries\\color{primary}}
  {}
  {0em}
  {}
  [\\vspace{1pt}\\color{accent}\\hrule\\vspace{4pt}]
\\titlespacing{\\section}{0pt}{10pt}{4pt}

\\setlist[itemize]{
  leftmargin=1.2em,
  itemsep=1.5pt,
  topsep=1.5pt,
  parsep=0pt
}
\\pagestyle{empty}

\\begin{document}

\\begin{center}
  {\\Huge \\textbf{Your Name}} \\\\ \\vspace{4pt}
  \\small \\color{muted}
  Email: \\href{mailto:you@example.com}{you@example.com} \\quad | \\quad
  Phone: +1 (555) 019-2834 \\quad | \\quad
  LinkedIn: \\href{https://linkedin.com}{linkedin.com/in/yourprofile} \\quad | \\quad
  GitHub: \\href{https://github.com}{github.com/yourhandle}
\\end{center}

\\vspace{6pt}

\\section{Education}
\\textbf{Master of Science in Computer Science} \\hfill 2022 -- 2024 \\\\
\\textit{University Name} \\hfill City, State \\\\
Relevant Coursework: Distributed Systems, Machine Learning, Advanced Algorithms.

\\vspace{3pt}
\\textbf{Bachelor of Science in Physics} \\hfill 2018 -- 2022 \\\\
\\textit{University Name} \\hfill City, State

\\section{Experience}
\\textbf{Software Engineer} \\hfill Jan 2024 -- Present \\\\
\\textit{Company Name} \\hfill City, State
\\begin{itemize}
  \\item Designed and deployed scalable REST and WebSocket APIs serving 50k+ daily active users.
  \\item Optimized core compilation pipeline latency by 35\\% using caching and connection pooling.
  \\item Collaborated with cross-functional engineering teams in an agile, CI/CD-driven workflow.
\\end{itemize}

\\vspace{3pt}
\\textbf{Research Fellow} \\hfill Jun 2022 -- Dec 2023 \\\\
\\textit{Laboratory / Institute Name} \\hfill City, State
\\begin{itemize}
  \\item Developed automated computational scripts for numerical data analysis and visualization.
  \\item Co-authored research findings published in peer-reviewed scientific proceedings.
\\end{itemize}

\\section{Technical Projects}
\\textbf{Oberleaf --- Local TeX Studio} \\hfill \\href{https://github.com}{github.com/project}
\\begin{itemize}
  \\item Built a responsive offline LaTeX desktop editor with instant live PDF preview and SyncTeX.
  \\item Engineered cross-platform background processes, local project discovery, and zero-loss uninstaller.
\\end{itemize}

\\section{Technical Skills}
\\textbf{Languages:} Python, TypeScript, C++, LaTeX, SQL, Bash. \\\\
\\textbf{Frameworks \\& Tools:} React, Node.js, Express, Git, Docker, Linux, Vite.

\\end{document}
`,
  },
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
  // 1. Explicit override via environment variable
  if (process.env.OBERLEAF_PROJECTS_DIR && process.env.OBERLEAF_PROJECTS_DIR.trim()) {
    const custom = path.resolve(process.env.OBERLEAF_PROJECTS_DIR.trim());
    if (!fs.existsSync(custom)) {
      fs.mkdirSync(custom, { recursive: true });
    }
    return custom;
  }

  // 2. Default to user's active Windows Documents folder
  // (Prefers OneDrive Documents if active on Windows 10/11, which matches File Explorer's default library and provides automatic cloud backup)
  const userHome = process.env.USERPROFILE || process.env.HOME || process.cwd();

  let documentsDir: string;
  const oneDriveDocs = process.env.OneDrive
    ? path.join(process.env.OneDrive, 'Documents')
    : path.join(userHome, 'OneDrive', 'Documents');

  if (fs.existsSync(oneDriveDocs)) {
    documentsDir = oneDriveDocs;
  } else {
    documentsDir = path.join(userHome, 'Documents');
  }

  const docsProjects = path.join(documentsDir, 'Oberleaf Projects');
  try {
    if (!fs.existsSync(docsProjects)) {
      fs.mkdirSync(docsProjects, { recursive: true });
    }

    // Seamless migration: If user previously had projects in local un-synced userHome\Documents\Oberleaf Projects,
    // copy them to the primary OneDrive\Documents\Oberleaf Projects folder
    const legacyDocsProjects = path.join(userHome, 'Documents', 'Oberleaf Projects');
    if (legacyDocsProjects !== docsProjects && fs.existsSync(legacyDocsProjects)) {
      try {
        const legacyEntries = fs.readdirSync(legacyDocsProjects);
        for (const entry of legacyEntries) {
          const srcPath = path.join(legacyDocsProjects, entry);
          const destPath = path.join(docsProjects, entry);
          if (!fs.existsSync(destPath)) {
            fs.cpSync(srcPath, destPath, { recursive: true });
          }
        }
      } catch {}
    }

    return docsProjects;
  } catch {
    // Fallback to local directory if Documents is inaccessible
    const localProjects = path.join(process.cwd(), 'projects');
    if (!fs.existsSync(localProjects)) {
      fs.mkdirSync(localProjects, { recursive: true });
    }
    return localProjects;
  }
}


function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = Math.max(0, now.getTime() - date.getTime());
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffMin < 1) return 'Just now by You';
  if (diffMin < 60) return `${diffMin} ${diffMin === 1 ? 'minute' : 'minutes'} ago by You`;
  if (diffHours < 24) return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago by You`;
  if (diffDays < 30) return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago by You`;
  if (diffMonths < 12) return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago by You`;
  return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago by You`;
}

export function touchProject(projectId: string): void {
  let targetDir: string;
  try {
    targetDir = resolveProjectDir(projectId);
  } catch {
    return;
  }
  if (!fs.existsSync(targetDir)) return;
  const metaPath = path.join(targetDir, '.meta.json');
  let meta: any = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {}
  }
  const now = new Date();
  meta.updatedAt = now.toISOString();
  meta.lastOpenedAt = now.toISOString();
  meta.relativeTime = 'Just now by You';
  try {
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  } catch {}
}

export function listProjects(): ProjectSummary[] {
  const root = getProjectsRoot();
  const entries = fs.readdirSync(root, { withFileTypes: true });

  const projects = entries
    .filter((e) => e.isDirectory())
    .map((dir) => {
      const pPath = path.join(root, dir.name);
      const stat = fs.statSync(pPath);
      const metaPath = path.join(pPath, '.meta.json');
      let meta: any = {};
      if (fs.existsSync(metaPath)) {
        try {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch {}
      }

      // Check for compiled PDF
      const hasPdf =
        fs.existsSync(path.join(pPath, 'main.pdf')) ||
        fs.existsSync(path.join(pPath, 'output.pdf')) ||
        fs.existsSync(path.join(pPath, '.build', 'output.pdf')) ||
        fs.existsSync(path.join(pPath, `${dir.name}.pdf`));

      // Scan files in project to find true latest modification time on disk
      let latestMtime = stat.mtime;
      try {
        const subFiles = fs.readdirSync(pPath);
        for (const f of subFiles) {
          if (f.startsWith('.git')) continue;
          try {
            const subStat = fs.statSync(path.join(pPath, f));
            if (subStat.mtime.getTime() > latestMtime.getTime()) {
              latestMtime = subStat.mtime;
            }
          } catch {}
        }
      } catch {}

      // Consider explicit updatedAt or lastOpenedAt from .meta.json if newer
      let effectiveDate = latestMtime;
      if (meta.updatedAt) {
        const metaDate = new Date(meta.updatedAt);
        if (!isNaN(metaDate.getTime()) && metaDate.getTime() > effectiveDate.getTime()) {
          effectiveDate = metaDate;
        }
      }
      if (meta.lastOpenedAt) {
        const openedDate = new Date(meta.lastOpenedAt);
        if (!isNaN(openedDate.getTime()) && openedDate.getTime() > effectiveDate.getTime()) {
          effectiveDate = openedDate;
        }
      }

      const effectiveName = meta.name || dir.name;
      const relativeTime = formatRelativeTime(effectiveDate);

      return {
        id: dir.name,
        name: effectiveName,
        template: meta.template || 'Standard',
        updatedAt: effectiveDate.toISOString(),
        lastModifiedRelative: relativeTime,
        owner: meta.owner || 'You',
        isArchived: Boolean(meta.isArchived),
        hasPdf,
        path: pPath,
      };
    });

  // Sort descending by most recently updated
  return projects.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function deleteProject(projectId: string): boolean {
  const targetDir = resolveProjectDir(projectId);
  if (!fs.existsSync(targetDir)) {
    throw new Error('Project not found');
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  return true;
}

export function duplicateProject(rawProjectId: string): ProjectSummary {
  const root = getProjectsRoot();
  const projectId = sanitizeProjectId(rawProjectId);
  const sourceDir = resolveProjectDir(projectId);
  if (!fs.existsSync(sourceDir)) {
    throw new Error('Source project not found');
  }

  const baseName = projectId.replace(/[-_]copy(-\d+)?$/i, '');
  let targetId = `${projectId}_copy`;
  let counter = 1;
  while (fs.existsSync(path.join(root, targetId))) {
    targetId = `${baseName}_copy_${counter++}`;
  }

  const targetDir = path.join(root, targetId);
  fs.cpSync(sourceDir, targetDir, { recursive: true });

  const metaPath = path.join(targetDir, '.meta.json');
  let meta: any = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {}
  }
  meta.name = meta.name ? `${meta.name} (Copy)` : targetId;
  meta.updatedAt = new Date().toISOString();
  meta.relativeTime = 'Just now by You';
  meta.isArchived = false;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  return {
    id: targetId,
    name: meta.name,
    template: meta.template || 'Standard',
    updatedAt: meta.updatedAt,
    lastModifiedRelative: meta.relativeTime,
    owner: 'You',
    isArchived: false,
    hasPdf: fs.existsSync(path.join(targetDir, 'main.pdf')),
    path: targetDir,
  };
}

export function toggleArchiveProject(projectId: string): boolean {
  const targetDir = resolveProjectDir(projectId);
  if (!fs.existsSync(targetDir)) {
    throw new Error('Project not found');
  }
  const metaPath = path.join(targetDir, '.meta.json');
  let meta: any = {};
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    } catch {}
  }
  meta.isArchived = !meta.isArchived;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
  return meta.isArchived;
}

// Never bundled into an export. .build is regenerable compiler scratch, and
// .git is repository internals -- repositories configured by older versions
// still carry an access token in .git/config until git.ts migrates them out,
// and an export should not be the thing that leaks it.
const ZIP_EXCLUDED_ENTRIES = ['.git', '.build'];

export function createProjectZip(rawProjectId: string): string {
  const projectId = sanitizeProjectId(rawProjectId);
  const targetDir = resolveProjectDir(projectId);
  if (!fs.existsSync(targetDir)) {
    throw new Error('Project not found');
  }

  const tmpDir = path.join(process.cwd(), '.tmp');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const zipFilename = `${projectId}.zip`;
  const zipPath = path.join(tmpDir, zipFilename);
  if (fs.existsSync(zipPath)) {
    fs.unlinkSync(zipPath);
  }

  // Both branches pass paths as argv entries or environment variables rather
  // than interpolating them into a shell string: a directory name may legally
  // contain quotes, apostrophes or '&' on Windows.
  try {
    // bsdtar creates standard zip archives on Windows 10/11
    execFileSync('tar.exe', [
      '-a',
      '-c',
      '-f',
      zipPath,
      '-C',
      targetDir,
      ...ZIP_EXCLUDED_ENTRIES.map((e) => `--exclude=./${e}`),
      '.',
    ]);
  } catch (err) {
    // Fallback using powershell Compress-Archive
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        "$excluded = $env:OBERLEAF_ZIP_EXCLUDE -split ';'; " +
          '$items = Get-ChildItem -LiteralPath $env:OBERLEAF_ZIP_SRC -Force | ' +
          'Where-Object { $excluded -notcontains $_.Name }; ' +
          'if ($items) { Compress-Archive -LiteralPath $items.FullName ' +
          '-DestinationPath $env:OBERLEAF_ZIP_DEST -Force }',
      ],
      {
        env: {
          ...process.env,
          OBERLEAF_ZIP_SRC: targetDir,
          OBERLEAF_ZIP_DEST: zipPath,
          OBERLEAF_ZIP_EXCLUDE: ZIP_EXCLUDED_ENTRIES.join(';'),
        },
      }
    );
  }

  return zipPath;
}

export function createProject(name: string, templateKey: string = 'cv'): ProjectSummary {
  const root = getProjectsRoot();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'my-cv';
  let finalSlug = slug;
  let counter = 1;

  while (fs.existsSync(path.join(root, finalSlug))) {
    finalSlug = `${slug}-${counter++}`;
  }

  const projectDir = path.join(root, finalSlug);
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(path.join(projectDir, 'figures'), { recursive: true });

  const template = TEMPLATES[templateKey] || TEMPLATES.cv || TEMPLATES.blank;
  fs.writeFileSync(path.join(projectDir, 'main.tex'), template.mainTex, 'utf-8');

  const nowIso = new Date().toISOString();
  const meta = {
    name,
    owner: 'You',
    relativeTime: 'Just now by You',
    updatedAt: nowIso,
    template: templateKey,
    isArchived: false,
  };
  fs.writeFileSync(path.join(projectDir, '.meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  return {
    id: finalSlug,
    name,
    template: templateKey,
    updatedAt: nowIso,
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

export function ensureStarterCVProject(): void {
  const root = getProjectsRoot();

  // Remove legacy dummy demo placeholders
  const legacyDirs = [
    'sample-project',
    'demo-paper',
    'MoS2_Thin_Film',
    'CV_Sydney',
    'Quantum_Computing_For_Everyone',
    'CdSe_GQD',
    'CLA2_OE_Data_Analytics',
  ];
  for (const legacy of legacyDirs) {
    const legacyPath = path.join(root, legacy);
    if (fs.existsSync(legacyPath)) {
      try {
        fs.rmSync(legacyPath, { recursive: true, force: true });
      } catch {}
    }
  }

  // If user has zero projects, seed a clean starter CV template
  const existing = listProjects();
  if (existing.length === 0) {
    createProject('My_CV', 'cv');
  }
}

