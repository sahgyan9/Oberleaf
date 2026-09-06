import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

      const effectiveName = meta.name || dir.name;
      const effectiveDate = meta.updatedAt ? new Date(meta.updatedAt) : stat.mtime;
      const relativeTime = meta.relativeTime || formatRelativeTime(effectiveDate);

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
  const root = getProjectsRoot();
  const targetDir = path.resolve(root, projectId);
  if (!targetDir.startsWith(path.resolve(root))) {
    throw new Error('Access outside project boundary is forbidden');
  }
  if (!fs.existsSync(targetDir)) {
    throw new Error('Project not found');
  }
  fs.rmSync(targetDir, { recursive: true, force: true });
  return true;
}

export function duplicateProject(projectId: string): ProjectSummary {
  const root = getProjectsRoot();
  const sourceDir = path.resolve(root, projectId);
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
  meta.name = targetId;
  meta.updatedAt = new Date().toISOString();
  meta.relativeTime = 'Just now by You';
  meta.isArchived = false;
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

  return {
    id: targetId,
    name: targetId,
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
  const root = getProjectsRoot();
  const targetDir = path.resolve(root, projectId);
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

export function createProjectZip(projectId: string): string {
  const root = getProjectsRoot();
  const targetDir = path.resolve(root, projectId);
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

  try {
    // bsdtar creates standard zip archives on Windows 10/11
    execSync(`tar.exe -a -c -f "${zipPath}" -C "${targetDir}" .`);
  } catch (err) {
    // Fallback using powershell Compress-Archive
    execSync(
      `powershell.exe -NoProfile -Command "Compress-Archive -Path '${targetDir}\\*' -DestinationPath '${zipPath}' -Force"`
    );
  }

  return zipPath;
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

export function seedScreenshotProjects(): void {
  const root = getProjectsRoot();

  // Remove the old test placeholders if user wants the clean screenshot replica
  const legacyDirs = ['sample-project', 'demo-paper'];
  for (const legacy of legacyDirs) {
    const legacyPath = path.join(root, legacy);
    if (fs.existsSync(legacyPath)) {
      try {
        fs.rmSync(legacyPath, { recursive: true, force: true });
      } catch {}
    }
  }

  const now = Date.now();
  const ONE_HOUR = 3600 * 1000;
  const ONE_DAY = 24 * ONE_HOUR;

  const defaultProjects = [
    {
      id: 'MoS2_Thin_Film',
      name: 'MoS2_Thin_Film',
      relativeTime: '12 hours ago by You',
      updatedAt: new Date(now - 12 * ONE_HOUR).toISOString(),
      mainTex: `\\documentclass{article}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Atomically Thin $\\text{MoS}_2$: Electronic Properties and Exciton Dynamics}
\\author{You}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Molybdenum disulfide ($\\text{MoS}_2$) transitions from an indirect bandgap semiconductor in bulk form ($E_g \\approx 1.29\\text{ eV}$) to a direct bandgap monolayer ($E_g \\approx 1.80\\text{ eV}$). We present photoluminescence and Raman spectra demonstrating layer-dependent characteristics.
\\end{abstract}

\\section{Introduction}
Two-dimensional transition metal dichalcogenides (TMDs) exhibit strong spin-orbit coupling and broken inversion symmetry in monolayer limits.

\\section{Bandgap and Optical Transitions}
The optical absorbance and direct excitonic transitions are described by:
\\begin{equation}
E_{A} = E_g - E_b = 1.88\\text{ eV}
\\end{equation}
where $E_b \\approx 0.5\\text{ eV}$ represents the tightly bound exciton binding energy due to reduced dielectric screening.

\\section{Raman Phonon Modes}
The characteristic in-plane $E^1_{2g}$ and out-of-plane $A_{1g}$ modes obey:
\\begin{equation}
\\Delta \\omega = \\omega(A_{1g}) - \\omega(E^1_{2g}) \\approx 19.2\\text{ cm}^{-1}
\\end{equation}

\\end{document}
`,
    },
    {
      id: 'CV_Sydney',
      name: 'CV Sydney',
      relativeTime: '24 days ago by You',
      updatedAt: new Date(now - 24 * ONE_DAY).toISOString(),
      mainTex: `\\documentclass[11pt,a4paper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{geometry}
\\geometry{top=2cm, bottom=2cm, left=2cm, right=2cm}
\\usepackage{hyperref}
\\usepackage{titlesec}

\\titleformat{\\section}{\\large\\bfseries}{}{0em}{}[\\titlerule]

\\begin{document}
\\pagestyle{empty}

\\begin{center}
{\\LARGE\\textbf{Sydney Researcher}} \\\\
\\vspace{4pt}
\\small Email: sydney.research@university.edu \\quad | \\quad Web: sydney-research.io \\quad | \\quad GitHub: @sydney-research
\\end{center}

\\vspace{8pt}

\\section{Education}
\\textbf{Ph.D. in Condensed Matter Physics} \\hfill 2022 -- Present \\\\
University of Sydney, Australia \\\\
\\textit{Dissertation: Quantum Dynamics of 2D Materials and Monolayer Heterostructures}

\\vspace{4pt}
\\textbf{B.S. in Physics (First Class Honours)} \\hfill 2018 -- 2022 \\\\
University of Sydney, Australia

\\section{Selected Publications}
\\begin{itemize}
  \\item \\textbf{Sydney R.}, et al. \`\`Excitonic Stark Shift in Atomically Thin $\\text{MoS}_2$ Heterostructures.'' \\textit{Physical Review Letters}, 2024.
  \\item \\textbf{Sydney R.}, et al. \`\`Colloidal Quantum Dots: Photoluminescence Engineering.'' \\textit{Nano Letters}, 2023.
\\end{itemize}

\\section{Technical Skills}
\\textbf{Tools \\& Languages:} LaTeX, Python (NumPy, SciPy, PyTorch), MATLAB, Git, Linux.

\\end{document}
`,
    },
    {
      id: 'Quantum_Computing_For_Everyone',
      name: 'Quantum Computing For Everyone',
      relativeTime: '4 months ago by You',
      updatedAt: new Date(now - 120 * ONE_DAY).toISOString(),
      mainTex: `\\documentclass[12pt]{article}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Quantum Computing For Everyone: Foundational Principles}
\\author{You}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{The Qubit and Superposition}
Unlike classical bits with values $0$ or $1$, a quantum bit exists in an arbitrary superposition:
\\begin{equation}
|\\psi\\rangle = \\alpha |0\\rangle + \\beta |1\\rangle, \\quad \\text{where } |\\alpha|^2 + |\\beta|^2 = 1
\\end{equation}

\\section{Quantum Logic Gates}
The single-qubit Hadamard gate creates an equal superposition from computational basis states:
\\begin{equation}
H = \\frac{1}{\\sqrt{2}}\\begin{pmatrix} 1 & 1 \\\\ 1 & -1 \\end{pmatrix}, \\quad H|0\\rangle = \\frac{|0\\rangle + |1\\rangle}{\\sqrt{2}} = |+\\rangle
\\end{equation}

\\section{Entanglement and Bell States}
Applying a CNOT gate with control qubit in superposition yields maximally entangled Bell pairs:
\\begin{equation}
|\\Phi^+\\rangle = \\frac{|00\\rangle + |11\\rangle}{\\sqrt{2}}
\\end{equation}
Measurement of one qubit instantaneously determines the state of the other across arbitrary distances.

\\end{document}
`,
    },
    {
      id: 'CdSe_GQD',
      name: 'CdSe_GQD',
      relativeTime: '4 months ago by You',
      updatedAt: new Date(now - 122 * ONE_DAY).toISOString(),
      mainTex: `\\documentclass{article}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}

\\title{Colloidal CdSe and Graphene Quantum Dots: Optical Confinement}
\\author{You}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Quantum Confinement in Zero Dimensions}
When the semiconductor nanoparticle radius $r$ becomes comparable to or smaller than the exciton Bohr radius $a_B$, quantum confinement shifts the bandgap:
\\begin{equation}
E_{g,QD} = E_{g,bulk} + \\frac{\\hbar^2 \\pi^2}{2 r^2}\\left(\\frac{1}{m_e^*} + \\frac{1}{m_h^*}\\right) - \\frac{1.8 e^2}{4 \\pi \\varepsilon_0 \\varepsilon_r r}
\\end{equation}

\\section{Photoluminescence Quantum Yield}
The radiative decay rate $k_r$ and non-radiative trap rate $k_{nr}$ determine the overall quantum efficiency:
\\begin{equation}
\\Phi_{PL} = \\frac{k_r}{k_r + k_{nr}}
\\end{equation}
Monodisperse CdSe nanocrystals synthesized via hot-injection exhibit narrow full-width at half-maximum (FWHM $< 25\\text{ nm}$).

\\end{document}
`,
    },
    {
      id: 'CLA2_OE_Data_Analytics',
      name: 'CLA2_OE_Data_Analytics',
      relativeTime: '5 months ago by You',
      updatedAt: new Date(now - 150 * ONE_DAY).toISOString(),
      mainTex: `\\documentclass[11pt]{article}
\\usepackage{amsmath,amssymb}
\\usepackage{booktabs}

\\title{Continuous Learning Assessment 2: Open Economy Macroeconomic Data Analytics}
\\author{You}
\\date{\\today}

\\begin{document}
\\maketitle

\\section{Model Formulation}
We formulate a simultaneous equations model evaluating interest rate parity and trade balances:
\\begin{equation}
Y_t = \\beta_0 + \\beta_1 (r_t - r_t^*) + \\beta_2 \\ln(\\text{REER}_t) + \\epsilon_t
\\end{equation}
where $\\text{REER}_t$ denotes the Real Effective Exchange Rate and $r_t - r_t^*$ is the policy rate differential.

\\section{Empirical Estimates}
\\begin{table}[h]
\\centering
\\caption{OLS and IV Estimations with Robust Standard Errors}
\\begin{tabular}{lccc}
\\toprule
Variable & OLS (1) & IV-2SLS (2) & GMM (3) \\\\
\\midrule
Interest Differential & -0.428*** (0.082) & -0.512*** (0.104) & -0.495*** (0.091) \\\\
Real Exchange Rate & 0.315** (0.110) & 0.284** (0.119) & 0.298** (0.105) \\\\
Constant & 1.042 (0.315) & 1.189 (0.360) & 1.120 (0.320) \\\\
\\bottomrule
\\end{tabular}
\\end{table}

\\end{document}
`,
    },
  ];

  for (const proj of defaultProjects) {
    const projDir = path.join(root, proj.id);
    if (!fs.existsSync(projDir)) {
      fs.mkdirSync(projDir, { recursive: true });
      fs.mkdirSync(path.join(projDir, 'figures'), { recursive: true });
      fs.writeFileSync(path.join(projDir, 'main.tex'), proj.mainTex, 'utf-8');
      fs.writeFileSync(
        path.join(projDir, '.meta.json'),
        JSON.stringify(
          {
            name: proj.name,
            owner: 'You',
            relativeTime: proj.relativeTime,
            updatedAt: proj.updatedAt,
            isArchived: false,
          },
          null,
          2
        ),
        'utf-8'
      );
    }
  }
}

