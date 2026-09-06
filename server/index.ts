import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { exec, spawn } from 'child_process';
import { promisify } from 'util';
import { runDependencyCheck } from './doctor.js';
import { compileDocument, isLatexmkAvailable, cleanBuildCache } from './compiler.js';
import {
  listProjects,
  createProject,
  deleteProject,
  duplicateProject,
  toggleArchiveProject,
  createProjectZip,
  seedScreenshotProjects,
  listProjectFiles,
  getProjectsRoot,
  getUniqueFilename,
} from './projects.js';
import {
  createProjectCommit,
  createExplicitCommit,
  getProjectHistory,
  getCommitDiff,
  revertToCommit,
  getRemoteUrl,
  setRemoteUrl,
  getGitSyncStatus,
  pushToRemote,
  pullFromRemote,
  getGitSettings,
  saveGitSettings,
} from './git.js';
import {
  loadComments,
  addCommentThread,
  addCommentReply,
  updateCommentStatus,
  deleteCommentThread,
} from './comments.js';
import { getProjectSyncTex } from './synctex.js';
import { getProjectCitations, addProjectCitation } from './bibtex.js';
import { getProjectPdfFilename, sanitizeFilename } from './latexTitle.js';
import { checkSoftwareUpdate, applySoftwareUpdate } from './updater.js';
import {
  getCollabNetworkStatus,
  startCloudflareTunnel,
  stopCloudflareTunnel,
} from './tunnel.js';

const app = express();
const PORT = 3001;

// Allowed origins for local dev, LAN sharing, and secure Cloudflare tunnels
const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

function isAllowedOrigin(origin?: string): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow local LAN IPs (RFC 1918)
  if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:(5173|3001))?$/.test(origin)) {
    return true;
  }
  // Allow Cloudflare quick tunnels
  if (/^https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com$/.test(origin)) {
    return true;
  }
  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Cross-origin requests are not permitted'));
      }
    },
    credentials: true,
  })
);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
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

// Helper: Safely resolve a path inside a project to prevent directory traversal.
// Deliberately does not create the project directory: a plain read for a
// project that no longer exists used to recreate it, so deleted projects came
// back as empty phantoms in the switcher. Write paths mkdir their own parents.
function resolveProjectPath(projectId: string, targetPath: string = ''): string {
  const projectDir = getProjectDir(projectId, false);
  const cleanTarget = targetPath.trim();
  const resolved = path.resolve(projectDir, cleanTarget);

  if (!isInside(projectDir, resolved)) {
    throw new Error('Access outside project boundary is forbidden');
  }
  return resolved;
}

// 0. Health-check endpoint (used by launch.ps1 to confirm the daemon is ready)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

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

app.delete('/api/projects/:id', (req, res) => {
  try {
    deleteProject(req.params.id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/clone', (req, res) => {
  try {
    const cloned = duplicateProject(req.params.id);
    res.json(cloned);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/projects/:id/archive', (req, res) => {
  try {
    const isArchived = toggleArchiveProject(req.params.id);
    res.json({ success: true, isArchived });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id/zip', (req, res) => {
  try {
    const zipPath = createProjectZip(req.params.id);
    res.download(zipPath, `${req.params.id}.zip`, (err) => {
      if (!err && fs.existsSync(zipPath)) {
        try {
          fs.unlinkSync(zipPath);
        } catch {}
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id/download-pdf', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const pdfCandidates = [
      path.join(projectDir, 'main.pdf'),
      path.join(projectDir, 'output.pdf'),
      path.join(projectDir, '.build', 'output.pdf'),
      path.join(projectDir, `${req.params.id}.pdf`),
    ];
    const foundPdf = pdfCandidates.find((p) => fs.existsSync(p));
    if (!foundPdf) {
      return res.status(404).json({ error: 'PDF has not been compiled yet for this project.' });
    }
    const pdfFilename = getProjectPdfFilename(projectDir, req.params.id);
    res.download(foundPdf, pdfFilename);
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

// 3. Single Asset Upload Endpoint (overwrites existing files by default)
app.post('/api/projects/:id/upload', (req, res) => {
  try {
    const { fileName, base64Data, targetDir, overwrite = true } = req.body;
    if (!fileName || !base64Data) {
      return res.status(400).json({ error: 'fileName and base64Data required' });
    }

    const safeFileName = path.basename(String(fileName)).trim();
    if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
      return res.status(400).json({ error: 'Invalid fileName' });
    }

    const projectDir = getProjectDir(req.params.id);
    const ext = path.extname(safeFileName).toLowerCase();
    const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.eps'].includes(ext);
    const defaultFolder = isImage ? path.join(projectDir, 'figures') : projectDir;
    const targetFolder = targetDir ? resolveProjectPath(req.params.id, targetDir) : defaultFolder;

    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const targetFileName = overwrite
      ? safeFileName
      : getUniqueFilename(targetFolder, safeFileName);
    const filePath = path.join(targetFolder, targetFileName);

    const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    const buffer = Buffer.from(base64Clean, 'base64');
    fs.writeFileSync(filePath, buffer);

    const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/');
    res.json({ success: true, fileName: targetFileName, relativePath: relPath });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Batch Upload Endpoint (overwrites existing files by default)
app.post('/api/projects/:id/upload-batch', (req, res) => {
  try {
    const { files, targetDir, overwrite = true } = req.body;
    if (!Array.isArray(files) || files.length === 0) {
      return res.status(400).json({ error: 'Files array required' });
    }

    const projectDir = getProjectDir(req.params.id);

    const results = files.map((fileObj: { fileName: string; base64Data: string }) => {
      try {
        const { fileName, base64Data } = fileObj;
        const safeFileName = path.basename(String(fileName)).trim();
        if (!safeFileName || safeFileName === '.' || safeFileName === '..') {
          throw new Error('Invalid fileName');
        }

        const ext = path.extname(safeFileName).toLowerCase();
        const isImage = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.eps'].includes(ext);
        const defaultFolder = isImage ? path.join(projectDir, 'figures') : projectDir;
        const targetFolder = targetDir ? resolveProjectPath(req.params.id, targetDir) : defaultFolder;

        if (!fs.existsSync(targetFolder)) {
          fs.mkdirSync(targetFolder, { recursive: true });
        }

        const targetFileName = overwrite
          ? safeFileName
          : getUniqueFilename(targetFolder, safeFileName);
        const filePath = path.join(targetFolder, targetFileName);

        const base64Clean = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
        const buffer = Buffer.from(base64Clean, 'base64');
        fs.writeFileSync(filePath, buffer);

        const relPath = path.relative(projectDir, filePath).replace(/\\/g, '/');
        return {
          fileName: targetFileName,
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
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
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

    // Auto-create snapshot commit only if explicitly enabled in project settings (default: false)
    const gitSettings = getGitSettings(projectDir);
    if (gitSettings.autoCommitOnCompile) {
      createProjectCommit(
        projectDir,
        `Auto-checkpoint before compile (${new Date().toLocaleTimeString()})`
      ).catch(() => {
        // Non-fatal if git commit fails
      });
    }

    const result = await compileDocument(projectDir, mainFile, engine, {
      shellEscape: !!req.body.shellEscape,
    });
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7.1. Clean Build Cache Endpoint
app.post('/api/projects/:id/clean', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const result = cleanBuildCache(projectDir);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const execAsync = promisify(exec);

// 7.5. Package Installer Endpoint (MiKTeX mpm, TeX Live tlmgr, or CTAN mirror fallback)
app.post('/api/projects/:id/packages/install', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { packageName } = req.body;
    if (!packageName || typeof packageName !== 'string') {
      return res.status(400).json({ error: 'Valid packageName is required' });
    }

    const cleanPkg = packageName.trim().replace(/[^a-zA-Z0-9_\-]/g, '');
    if (!cleanPkg) {
      return res.status(400).json({ error: 'Invalid packageName' });
    }

    // Attempt 1: Try MiKTeX Package Manager (mpm)
    try {
      const { stdout } = await execAsync(`mpm --install=${cleanPkg}`);
      return res.json({
        success: true,
        method: 'mpm',
        message: `Successfully installed '${cleanPkg}' via MiKTeX Package Manager.`,
        stdout,
      });
    } catch {
      // mpm failed or not installed, continue
    }

    // Attempt 2: Try TeX Live Package Manager (tlmgr)
    try {
      const { stdout } = await execAsync(`tlmgr install ${cleanPkg}`);
      return res.json({
        success: true,
        method: 'tlmgr',
        message: `Successfully installed '${cleanPkg}' via TeX Live (tlmgr).`,
        stdout,
      });
    } catch {
      // tlmgr failed, continue
    }

    // Attempt 3: Direct download from CTAN mirror into project root
    try {
      const targetStyPath = path.join(projectDir, `${cleanPkg}.sty`);
      const ctanUrl = `https://mirrors.ctan.org/macros/latex/contrib/${cleanPkg}/${cleanPkg}.sty`;
      const ctanRes = await fetch(ctanUrl);
      if (ctanRes.ok) {
        const styText = await ctanRes.text();
        fs.writeFileSync(targetStyPath, styText, 'utf-8');
        return res.json({
          success: true,
          method: 'ctan',
          message: `Downloaded '${cleanPkg}.sty' from CTAN directly into project directory.`,
          file: `${cleanPkg}.sty`,
        });
      }
    } catch {
      // ignore
    }

    return res.status(500).json({
      error: `Could not install package '${cleanPkg}'. Please verify your TeX package manager or install it manually.`,
    });
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

// 8.1. Explicit GitHub-Style Version Commit
app.post('/api/projects/:id/git/commit', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { message, description } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Commit message / comment is required' });
    }
    const result = await createExplicitCommit(projectDir, message, description);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8.2. Git Settings (Auto-commit on compile toggle)
app.get('/api/projects/:id/git/settings', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const settings = getGitSettings(projectDir);
    res.json(settings);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/git/settings', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { autoCommitOnCompile } = req.body;
    saveGitSettings(projectDir, { autoCommitOnCompile: !!autoCommitOnCompile });
    res.json({ success: true, settings: getGitSettings(projectDir) });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8.3. Git Remote & Sync Endpoints
app.get('/api/projects/:id/git/status', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const status = await getGitSyncStatus(projectDir);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/projects/:id/git/remote', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const remoteUrl = await getRemoteUrl(projectDir);
    res.json({ remoteUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/git/remote', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { remoteUrl, token } = req.body;
    if (!remoteUrl || !remoteUrl.trim()) {
      return res.status(400).json({ error: 'Remote URL is required' });
    }
    const cleanUrl = await setRemoteUrl(projectDir, remoteUrl, token);
    res.json({ success: true, remoteUrl: cleanUrl });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/git/push', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { branch, token } = req.body;
    const result = await pushToRemote(projectDir, branch, token);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/git/pull', async (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { branch, token } = req.body;
    const result = await pullFromRemote(projectDir, branch, token);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 8.4. Portable Review Comments Endpoints
app.get('/api/projects/:id/comments', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const comments = loadComments(projectDir);
    res.json(comments);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/comments', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { file, line, selectedText, author, text } = req.body;
    if (!file || line === undefined || !text) {
      return res.status(400).json({ error: 'file, line, and text are required' });
    }
    const thread = addCommentThread(projectDir, { file, line, selectedText, author, text });
    res.json(thread);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/projects/:id/comments/:commentId/replies', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { author, text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Reply text is required' });
    }
    const updated = addCommentReply(projectDir, req.params.commentId, { author, text });
    if (!updated) {
      return res.status(404).json({ error: 'Comment thread not found' });
    }
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/projects/:id/comments/:commentId/status', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const { status } = req.body;
    if (status !== 'open' && status !== 'resolved') {
      return res.status(400).json({ error: 'Status must be "open" or "resolved"' });
    }
    const updated = updateCommentStatus(projectDir, req.params.commentId, status);
    if (!updated) {
      return res.status(404).json({ error: 'Comment thread not found' });
    }
    res.json(updated);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/projects/:id/comments/:commentId', (req, res) => {
  try {
    const projectDir = getProjectDir(req.params.id);
    const deleted = deleteCommentThread(projectDir, req.params.commentId);
    if (!deleted) {
      return res.status(404).json({ error: 'Comment thread not found' });
    }
    res.json({ success: true });
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

    const parser = getProjectSyncTex(projectDir);

    // If user provided selected text, search source files for a high-confidence match
    if (text && text.length > 2) {
      const cleanSnippet = text.replace(/[\r\n]+/g, ' ').trim();
      const mainPath = path.join(projectDir, 'main.tex');
      if (fs.existsSync(mainPath)) {
        const fileContent = fs.readFileSync(mainPath, 'utf-8');
        const lines = fileContent.split('\n');

        // The searched word/phrase can appear more than once in the source
        // (e.g. a term used in the intro AND as a later section heading).
        // Picking the first occurrence in the file would ignore where the
        // user actually double-clicked, so when there are multiple
        // candidates we disambiguate using the SyncTeX-mapped page/position
        // of each candidate line, preferring the one closest to the click.
        const pickBest = (candidateLines: number[]): number => {
          if (candidateLines.length <= 1 || !parser) return candidateLines[0];
          let best = candidateLines[0];
          let bestScore = Infinity;
          for (const lineIdx of candidateLines) {
            const fwd = parser.forward('main.tex', lineIdx + 1);
            if (!fwd) continue;
            const score =
              fwd.page === page
                ? (fwd.x - x) ** 2 + (fwd.y - y) ** 2
                : 1e8 + Math.abs(fwd.page - page) * 1e6;
            if (score < bestScore) {
              bestScore = score;
              best = lineIdx;
            }
          }
          return best;
        };

        // 1. Direct line substring match
        const directMatches: number[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(cleanSnippet.toLowerCase())) {
            directMatches.push(i);
          }
        }
        if (directMatches.length > 0) {
          const bestLine = pickBest(directMatches);
          return res.json({ file: 'main.tex', line: bestLine + 1, page, matchedText: cleanSnippet });
        }

        // 2. Multi-word match
        const words = cleanSnippet.split(/\s+/).filter((w: string) => w.length > 3);
        if (words.length >= 2) {
          const multiMatches: number[] = [];
          for (let i = 0; i < lines.length; i++) {
            const lineText = lines[i].toLowerCase();
            const allWordsPresent = words.slice(0, 3).every((w: string) => lineText.includes(w.toLowerCase()));
            if (allWordsPresent) {
              multiMatches.push(i);
            }
          }
          if (multiMatches.length > 0) {
            const bestLine = pickBest(multiMatches);
            return res.json({ file: 'main.tex', line: bestLine + 1, page, matchedText: cleanSnippet });
          }
        }
      }
    }

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

// 11. PDF Serving
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

  const downloadRequested = req.query.download === '1' || req.query.download === 'true';
  const customFilename = req.query.filename as string;
  if (downloadRequested || customFilename) {
    const baseFallback = path.basename(filePath);
    const resolvedName = customFilename
      ? sanitizeFilename(customFilename.replace(/\.pdf$/i, '')) + '.pdf'
      : baseFallback;
    const asciiName = resolvedName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '\\"');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(resolvedName)}`
    );
  }

  res.setHeader('Content-Type', 'application/pdf');
  fs.createReadStream(filePath).pipe(res);
});

// 12. System Shortcut Registration Endpoint
app.post('/api/system/create-shortcut', async (_req, res) => {
  try {
    const projectRoot = process.cwd();
    const scriptPath = path.join(projectRoot, 'scripts', 'setup-windows.ps1');

    if (!fs.existsSync(scriptPath)) {
      return res.status(404).json({ success: false, error: 'Setup script not found at ' + scriptPath });
    }

    const child = spawn('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      scriptPath
    ], {
      cwd: projectRoot,
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        return res.json({
          success: true,
          message: 'Oberleaf shortcut successfully created on your Desktop and Start Menu!'
        });
      } else {
        return res.status(500).json({
          success: false,
          error: stderr || stdout || `Process exited with code ${code}`
        });
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 13. In-App Software Update Endpoints (Approach 1 + 3)
app.get('/api/system/check-update', async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.query.force === '1';
    const status = await checkSoftwareUpdate(force);
    return res.json(status);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/system/apply-update', async (_req, res) => {
  try {
    const result = await applySoftwareUpdate();
    if (result.success) {
      return res.json(result);
    } else {
      return res.status(500).json(result);
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// 14. Real-Time Collaboration & Tunnel Endpoints
app.get('/api/collab/network', (_req, res) => {
  try {
    const status = getCollabNetworkStatus(5173);
    res.json(status);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/collab/tunnel/start', async (_req, res) => {
  try {
    const url = await startCloudflareTunnel('http://127.0.0.1:5173');
    res.json({ success: true, url });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/collab/tunnel/stop', (_req, res) => {
  try {
    stopCloudflareTunnel();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Seed initial projects matching Overleaf landing screenshot
seedScreenshotProjects();

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Oberleaf] Server daemon running at http://127.0.0.1:${PORT}`);
  // Pre-warm the latexmk/perl availability check in background so first compile is instant
  isLatexmkAvailable().catch(() => {});
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[Oberleaf] Port ${PORT} is already in use.\n` +
      `  → Run: npx kill-port ${PORT}   (or restart your terminal)\n` +
      `  → Then run: npm start`
    );
    process.exit(1);
  } else {
    console.error('[Oberleaf] Server error:', err);
    process.exit(1);
  }
});
