import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { runDependencyCheck } from './doctor.js';
import { compileDocument } from './compiler.js';
import {
  listProjects,
  createProject,
  listProjectFiles,
  getProjectsRoot,
  getUniqueFilename,
} from './projects.js';
import {
  createProjectCommit,
  getProjectHistory,
  getCommitDiff,
  revertToCommit,
} from './git.js';
import { getProjectSyncTex } from './synctex.js';
import { getProjectCitations, addProjectCitation } from './bibtex.js';

const app = express();
const PORT = 3001;

// Only the local dev server may talk to this daemon. Browsers always attach an
// Origin header on cross-site requests, so rejecting unknown origins stops a
// random web page from driving the filesystem API while the app is running.
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

app.use(cors({ origin: ALLOWED_ORIGINS }));

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'Cross-origin requests are not permitted' });
  }
  next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Helper: Contain a resolved path inside a root directory.
// `startsWith(root)` alone is not enough: "<root>/proj" also prefixes
// "<root>/proj-evil", so the separator has to be part of the comparison.
function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalized = path.resolve(candidate);
  return normalized === normalizedRoot || normalized.startsWith(normalizedRoot + path.sep);
}

// Helper: A project id is a single directory name, never a path.
// Express decodes route params, so "..%2F..%2Ffoo" arrives here as "../../foo".
function sanitizeProjectId(rawId: string): string {
  const id = (rawId || '').trim();
  if (!id || id === '.' || id === '..') {
    throw new Error('Invalid project id');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) {
    throw new Error('Invalid project id');
  }
  return id;
}

// Helper: Resolve a project directory from an untrusted id.
function getProjectDir(rawId: string, createIfMissing: boolean = false): string {
  const projectId = sanitizeProjectId(rawId);
  const projectDir = path.resolve(getProjectsRoot(), projectId);
  if (!isInside(getProjectsRoot(), projectDir)) {
    throw new Error('Access outside project boundary is forbidden');
  }
  if (createIfMissing && !fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }
  return projectDir;
}

// Helper: Safely resolve a path inside a project to prevent directory traversal
function resolveProjectPath(projectId: string, targetPath: string = ''): string {
  const projectDir = getProjectDir(projectId, true);
  const cleanTarget = targetPath.trim();
  const resolved = path.resolve(projectDir, cleanTarget);

  if (!isInside(projectDir, resolved)) {
    throw new Error('Access outside project boundary is forbidden');
  }
  return resolved;
}

// 1. Dependency Doctor Endpoint
app.get('/api/doctor', async (_req, res) => {
  try {
    const report = await runDependencyCheck();
    res.json(report);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Project Endpoints
app.get('/api/projects', (_req, res) => {
  try {
    const projects = listProjects();
    res.json(projects);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects', (req, res) => {
  try {
    const { name, template } = req.body;
    if (!name) return res.status(400).json({ error: 'Project name is required' });
    const project = createProject(name, template || 'blank');
    res.json(project);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id/files', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    if (!fs.existsSync(projectDir)) {
      return res.status(404).json({ error: 'Project not found' });
    }
    const files = listProjectFiles(projectDir);
    res.json(files);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Read file content (Text files only)
app.get('/api/projects/:id/file', (req, res) => {
  try {
    const reqPath = (req.query.path as string) || 'main.tex';
    const filePath = resolveProjectPath(req.params.id, reqPath);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: ${reqPath}` });
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      return res.status(400).json({ error: 'Cannot read directory as text file' });
    }

    // Binary file guard
    const ext = path.extname(filePath).toLowerCase();
    const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.zip', '.ico', '.exe'];
    if (binaryExts.includes(ext)) {
      return res.status(400).json({ error: 'Binary file cannot be opened as text in editor' });
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    res.send(content);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Write file content (Text files only, guarded against overwriting images)
app.post('/api/projects/:id/file', (req, res) => {
  try {
    const reqPath = (req.query.path as string) || 'main.tex';
    const filePath = resolveProjectPath(req.params.id, reqPath);
    const { content } = req.body;

    if (content === undefined || content === null) {
      return res.status(400).json({ error: 'Content required' });
    }

    // Protect against accidentally overwriting binary files (e.g. images) with LaTeX text!
    const ext = path.extname(filePath).toLowerCase();
    const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.zip', '.ico', '.exe'];
    if (binaryExts.includes(ext)) {
      return res.status(400).json({ error: 'Cannot write text into a binary file' });
    }

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Single Asset Upload Endpoint (with auto-deduplication)
app.post('/api/projects/:id/upload', (req, res) => {
  try {
    const { fileName, base64Data, targetDir } = req.body;
    if (!fileName || !base64Data) {
      return res.status(400).json({ error: 'fileName and base64Data required' });
    }

    const projectDir = getProjectDir(req.params.id);
    const ext = path.extname(fileName).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.eps'].includes(ext);
    const defaultFolder = isImage ? path.join(projectDir, 'figures') : projectDir;
    const targetFolder = targetDir ? resolveProjectPath(req.params.id, targetDir) : defaultFolder;

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    // Auto-rename if duplicate exists (e.g. image.png -> image_1.png)
    const uniqueFileName = getUniqueFilename(targetFolder, path.basename(String(fileName)));
    const filePath = path.join(targetFolder, uniqueFileName);

    const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Clean, 'base64');
    fs.writeFileSync(filePath, buffer);

    const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/');
    res.json({ success: true, fileName: uniqueFileName, relativePath: relPath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Batch Upload Endpoint
app.post('/api/projects/:id/upload-batch', (req, res) => {
  try {
    const { files, targetDir } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Files array required' });
    }

    const projectDir = getProjectDir(req.params.id);

    const results = files.map((fileObj: { fileName: string; base64Data: string }) => {
      try {
        const { fileName, base64Data } = fileObj;
        const ext = path.extname(fileName).toLowerCase();
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.eps'].includes(ext);
        const defaultFolder = isImage ? path.join(projectDir, 'figures') : projectDir;
        const targetFolder = targetDir ? resolveProjectPath(req.params.id, targetDir) : defaultFolder;

        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }

        const uniqueFileName = getUniqueFilename(targetFolder, path.basename(String(fileName)));
        const filePath = path.join(targetFolder, uniqueFileName);

        const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const buffer = Buffer.from(base64Clean, 'base64');
        fs.writeFileSync(filePath, buffer);

        const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/');
        return {
          fileName: uniqueFileName,
          originalName: fileName,
          relativePath: relPath,
          success: true,
        };
      } catch (err: any) {
        return {
          fileName: fileObj.fileName,
          originalName: fileObj.fileName,
          relativePath: '',
          success: false,
          error: err.message,
        };
      }
    });

    res.json({ results });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Image Preview Endpoint (Serves project images for thumbnail previews)
app.get('/api/projects/:id/preview-image', (req, res) => {
  try {
    const reqPath = req.query.path as string;
    if (!reqPath) return res.status(400).send('Path required');

    const filePath = resolveProjectPath(req.params.id, reqPath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Image not found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.gif': 'image/gif',
    };

    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  } catch (error: any) {
    res.status(500).send(error.message);
  }
});

// 6. Project File Operations: Rename, Delete, Duplicate, Create
app.post('/api/projects/:id/rename', (req, res) => {
  try {
    const { oldPath, newName } = req.body;
    if (!oldPath || !newName) return res.status(400).json({ error: 'oldPath and newName required' });

    // newName is a bare filename, never a path: "../../evil.tex" must not escape
    const safeName = path.basename(String(newName).trim());
    if (!safeName || safeName === '.' || safeName === '..') {
      return res.status(400).json({ error: 'Invalid name' });
    }

    const sourcePath = resolveProjectPath(req.params.id, oldPath);
    const parentDir = path.dirname(sourcePath);
    const destPath = path.join(parentDir, safeName);

    // Prevent renaming project root or main.tex to a non-tex name
    if (path.basename(sourcePath) === 'main.tex' && !safeName.endsWith('.tex')) {
      return res.status(400).json({ error: 'main.tex must remain a .tex file' });
    }

    if (fs.existsSync(destPath)) {
      return res.status(400).json({ error: `An item named "${safeName}" already exists` });
    }

    fs.renameSync(sourcePath, destPath);
    const projectDir = getProjectDir(req.params.id);
    res.json({
      success: true,
      newRelativePath: path.relative(projectDir, destPath).replace(/\\/g, '/'),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id/file', (req, res) => {
  try {
    const reqPath = req.query.path as string;
    if (!reqPath) return res.status(400).json({ error: 'Path required' });

    const targetPath = resolveProjectPath(req.params.id, reqPath);
    if (!fs.existsSync(targetPath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Safety guard: Protect main.tex
    if (path.basename(targetPath) === 'main.tex') {
      return res.status(400).json({ error: 'Cannot delete the primary document (main.tex)' });
    }

    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(targetPath);
    }

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/duplicate', (req, res) => {
  try {
    const { filePath } = req.body;
    if (!filePath) return res.status(400).json({ error: 'filePath required' });

    const sourcePath = resolveProjectPath(req.params.id, filePath);
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    const dir = path.dirname(sourcePath);
    const ext = path.extname(sourcePath);
    const base = path.basename(sourcePath, ext);
    const targetName = getUniqueFilename(dir, `${base}_copy${ext}`);
    const destPath = path.join(dir, targetName);

    fs.copyFileSync(sourcePath, destPath);
    const projectDir = getProjectDir(req.params.id);
    res.json({
      success: true,
      newRelativePath: path.relative(projectDir, destPath).replace(/\\/g, '/'),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/create-file', (req, res) => {
  try {
    const { targetPath, type } = req.body;
    if (!targetPath) return res.status(400).json({ error: 'targetPath required' });

    const resolved = resolveProjectPath(req.params.id, targetPath);
    if (fs.existsSync(resolved)) {
      return res.status(400).json({ error: 'An item with this name already exists' });
    }

    if (type === 'directory') {
      fs.mkdirSync(resolved, { recursive: true });
    } else {
      fs.mkdirSync(path.dirname(resolved), { recursive: true });
      fs.writeFileSync(resolved, '', 'utf-8');
    }

    const projectDir = getProjectDir(req.params.id);
    res.json({
      success: true,
      relativePath: path.relative(projectDir, resolved).replace(/\\/g, '/'),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Compilation Endpoint
app.post('/api/projects/:id/compile', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const mainFile = req.body.mainFile || 'main.tex';
    const engine = req.body.engine || 'pdflatex';

    // Auto-create snapshot commit before compile
    try {
      await createProjectCommit(
        projectDir,
        `Auto-checkpoint before compile (${new Date().toLocaleTimeString()})`
      );
    } catch {
      // Non-fatal if git commit fails
    }

    const result = await compileDocument(projectDir, mainFile, engine);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Version History Endpoints
app.get('/api/projects/:id/history', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const history = await getProjectHistory(projectDir, limit);
    res.json(history);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/history/checkpoint', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const message = req.body.message || `Manual checkpoint (${new Date().toLocaleTimeString()})`;
    const result = await createProjectCommit(projectDir, message);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id/history/:hash/diff', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const filePath = (req.query.file as string) || 'main.tex';
    const diff = await getCommitDiff(projectDir, req.params.hash, filePath);
    res.json(diff);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/history/revert', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { hash } = req.body;
    if (!hash) return res.status(400).json({ error: 'Commit hash required' });
    const result = await revertToCommit(projectDir, hash);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 9. SyncTeX Navigation Endpoints
app.get('/api/projects/:id/synctex/forward', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const file = (req.query.file as string) || 'main.tex';
    const line = parseInt(req.query.line as string, 10) || 1;
    const parser = getProjectSyncTex(projectDir);

    if (!parser) {
      return res.status(404).json({ error: 'SyncTeX data not available. Recompile document first.' });
    }

    const forward = parser.forward(file, line);
    if (!forward) {
      return res.status(404).json({ error: 'No position found for line' });
    }
    res.json(forward);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.all('/api/projects/:id/synctex/backward', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const query = req.method === 'POST' ? req.body : req.query;
    const page = parseInt(query.page as string, 10) || 1;
    const x = parseFloat(query.x as string) || 100;
    const y = parseFloat(query.y as string) || 100;
    const text = typeof query.text === 'string' ? query.text.trim() : '';

    // If user provided selected text, search source files for a high-confidence match
    if (text && text.length > 2) {
      const cleanSnippet = text.replace(/[\r\n]+/g, ' ').trim();
      const mainPath = path.join(projectDir, 'main.tex');
      if (fs.existsSync(mainPath)) {
        const fileContent = fs.readFileSync(mainPath, 'utf-8');
        const lines = fileContent.split('\n');

        // 1. Direct line substring match
        for (let i = 0; i < lines.length; i++) {
          const lineText = lines[i];
          if (lineText.toLowerCase().includes(cleanSnippet.toLowerCase())) {
            return res.json({ file: 'main.tex', line: i + 1, page, matchedText: cleanSnippet });
          }
        }

        // 2. Multi-word match
        const words = cleanSnippet.split(/\s+/).filter((w: string) => w.length > 3);
        if (words.length >= 2) {
          for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i].toLowerCase();
            const allWordsPresent = words.slice(0, 3).every((w: string) => lineText.includes(w.toLowerCase()));
            if (allWordsPresent) {
              return res.json({ file: 'main.tex', line: i + 1, page, matchedText: cleanSnippet });
            }
          }
        }
      }
    }

    const parser = getProjectSyncTex(projectDir);
    if (!parser) {
      return res.status(404).json({ error: 'SyncTeX data not available. Recompile document first.' });
    }

    const backward = parser.backward(page, x, y);
    if (!backward) {
      return res.status(404).json({ error: 'No source line found for position' });
    }
    res.json(backward);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 10. BibTeX Citation Endpoints
app.get('/api/projects/:id/citations', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const citations = getProjectCitations(projectDir);
    res.json(citations);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/citations', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { rawBibtex, bibFile } = req.body;
    if (!rawBibtex) return res.status(400).json({ error: 'rawBibtex required' });

    // Keep the .bib target inside the project and force a .bib extension
    const requestedBib = String(bibFile || 'references.bib');
    const safeBib = path.basename(requestedBib.trim()) || 'references.bib';
    if (path.extname(safeBib).toLowerCase() !== '.bib') {
      return res.status(400).json({ error: 'Bibliography target must be a .bib file' });
    }

    const result = addProjectCitation(projectDir, rawBibtex, safeBib);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8. PDF Serving
// Only serves .pdf files that live inside the projects root. Without these two
// checks this endpoint hands out any file on disk that the user can read.
app.get('/api/pdf', (req, res) => {
  const requested = req.query.file as string;
  if (!requested) {
    return res.status(400).send('File parameter required');
  }

  const filePath = path.resolve(requested);
  if (!isInside(getProjectsRoot(), filePath)) {
    return res.status(403).send('Access outside project boundary is forbidden');
  }
  if (path.extname(filePath).toLowerCase() !== '.pdf') {
    return res.status(403).send('Only PDF files may be served');
  }
  if (!fs.existsSync(filePath)) {
    return res.status(404).send('PDF not found');
  }

  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(filePath).pipe(res);
});

// Ensure default project exists on startup
function ensureDefaultProjects() {
  const root = getProjectsRoot();
  const sampleDir = path.join(root, 'sample-project');
  if (!fs.existsSync(sampleDir)) {
    createProject('Sample Project', 'blank');
  } else {
    // If sample-project exists but has no main.tex, create main.tex
    const mainTex = path.join(sampleDir, 'main.tex');
    if (!fs.existsSync(mainTex)) {
      fs.writeFileSync(
        mainTex,
        `\\documentclass{article}
\\usepackage{amsmath}
\\usepackage{graphicx}

\\title{Exploring Quantum Limits Without Timeouts}
\\author{Overleaf Copy User}
\\date{\\today}

\\begin{document}

\\maketitle

\\begin{abstract}
This document demonstrates local LaTeX compiling with instant equation preview.
\\end{abstract}

\\section{Instant Equation Preview}
Type any equation to see it render live beneath your cursor:
\\begin{equation}
  \\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
\\end{equation}

And inline mathematics: $E = \\hbar \\omega$ with zero latency.

\\section{Figures and Images}
Insert scientific figures seamlessly from your figures directory.

\\end{document}
`,
        'utf-8'
      );
    }
  }
}

ensureDefaultProjects();

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[Overleaf Copy] Server daemon running at http://127.0.0.1:${PORT}`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[Overleaf Copy] Port ${PORT} busy, retrying in 1.5s...`);
    setTimeout(() => {
      try {
        if (server.listening) {
          server.close();
        }
      } catch {}
      server.listen(PORT, '127.0.0.1');
    }, 1500);
  } else {
    console.error('[Overleaf Copy] Server error:', err);
  }
});
