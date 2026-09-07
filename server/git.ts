import { simpleGit, SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';
import {
  saveGitToken,
  getGitToken,
  extractCredentials,
  buildAuthConfig,
} from './credentials.js';

export interface CommitItem {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author_name: string;
  isMilestone: boolean;
}

export interface DiffResult {
  filePath: string;
  oldContent: string;
  newContent: string;
  diff: string;
}

export interface GitSyncStatus {
  currentBranch: string;
  remoteUrl: string | null;
  ahead: number;
  behind: number;
  isClean: boolean;
  tracking: string | null;
}

export interface GitSettings {
  autoCommitOnCompile: boolean;
}

const GITIGNORE_CONTENT = `.build/
*.pdf
*.aux
*.log
*.out
*.synctex.gz
*.toc
*.fls
*.fdb_latexmk
`;

export function getProjectGit(projectDir: string): SimpleGit {
  return simpleGit({ baseDir: projectDir });
}

export async function ensureProjectGit(projectDir: string): Promise<SimpleGit> {
  const gitDir = path.join(projectDir, '.git');
  const git = simpleGit({ baseDir: projectDir });

  if (!fs.existsSync(gitDir)) {
    await git.init();
    await git.addConfig('user.name', 'Oberleaf Author', false, 'local');
    await git.addConfig('user.email', 'author@oberleaf.local', false, 'local');

    // Write .gitignore
    const gitignorePath = path.join(projectDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, GITIGNORE_CONTENT, 'utf-8');
    }

    // Initial commit
    try {
      await git.add('.');
      await git.commit('Initial project snapshot');
    } catch {
      // Ignore if clean
    }
  } else {
    // Ensure .gitignore exists
    const gitignorePath = path.join(projectDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, GITIGNORE_CONTENT, 'utf-8');
    }
  }

  return git;
}

// Git Settings storage in .gitsettings.json
export function getGitSettings(projectDir: string): GitSettings {
  const settingsPath = path.join(projectDir, '.gitsettings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      // fallback
    }
  }
  return { autoCommitOnCompile: false };
}

export function saveGitSettings(projectDir: string, settings: GitSettings): void {
  const settingsPath = path.join(projectDir, '.gitsettings.json');
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export async function createProjectCommit(
  projectDir: string,
  message: string = 'Autosave snapshot'
): Promise<{ committed: boolean; hash?: string; message: string }> {
  // Check if auto-commit on compile is disabled
  const settings = getGitSettings(projectDir);
  if (!settings.autoCommitOnCompile) {
    return {
      committed: false,
      message: 'Auto-commit disabled by project settings',
    };
  }

  const git = await ensureProjectGit(projectDir);
  const status = await git.status();

  if (status.isClean()) {
    const log = await git.log({ maxCount: 1 }).catch(() => null);
    return {
      committed: false,
      hash: log?.latest?.hash,
      message: 'No changes to commit',
    };
  }

  await git.add('.');
  const commitResult = await git.commit(message);
  return {
    committed: true,
    hash: commitResult.commit,
    message,
  };
}

export async function createExplicitCommit(
  projectDir: string,
  message: string,
  description?: string
): Promise<{ committed: boolean; hash?: string; message: string }> {
  const git = await ensureProjectGit(projectDir);
  const status = await git.status();

  if (status.isClean()) {
    return {
      committed: false,
      message: 'Working tree clean. Nothing to commit.',
    };
  }

  await git.add('.');
  const fullMessage = description && description.trim()
    ? `${message.trim()}\n\n${description.trim()}`
    : message.trim();

  const commitResult = await git.commit(fullMessage);
  return {
    committed: true,
    hash: commitResult.commit,
    message: fullMessage,
  };
}

export async function getProjectHistory(projectDir: string, maxCount: number = 100): Promise<CommitItem[]> {
  const git = await ensureProjectGit(projectDir);
  try {
    const log = await git.log({ maxCount });
    return log.all.map((c) => {
      const isAutosave =
        c.message.startsWith('Autosave') ||
        c.message.startsWith('Auto-checkpoint');
      return {
        hash: c.hash,
        shortHash: c.hash.slice(0, 7),
        message: c.message,
        date: c.date,
        author_name: c.author_name,
        isMilestone: !isAutosave,
      };
    });
  } catch {
    return [];
  }
}

export async function getFileAtCommit(
  projectDir: string,
  commitHash: string,
  relativePath: string
): Promise<string> {
  const git = await ensureProjectGit(projectDir);
  const normalizedPath = relativePath.replace(/\\/g, '/');
  try {
    return await git.show([`${commitHash}:${normalizedPath}`]);
  } catch {
    return '';
  }
}

export async function getCommitDiff(
  projectDir: string,
  commitHash: string,
  relativePath: string = 'main.tex'
): Promise<DiffResult> {
  const git = await ensureProjectGit(projectDir);
  const normalizedPath = relativePath.replace(/\\/g, '/');

  let oldContent = '';
  try {
    oldContent = await git.show([`${commitHash}:${normalizedPath}`]);
  } catch {
    oldContent = '';
  }

  const fullPath = path.join(projectDir, normalizedPath);
  const currentContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';

  let diff = '';
  try {
    diff = await git.diff([`${commitHash}`, '--', normalizedPath]);
  } catch {
    diff = '';
  }

  return {
    filePath: normalizedPath,
    oldContent,
    newContent: currentContent,
    diff,
  };
}

export async function revertToCommit(
  projectDir: string,
  commitHash: string
): Promise<{ success: boolean; message: string }> {
  const git = await ensureProjectGit(projectDir);

  try {
    await git.checkout([commitHash, '--', '.']);
    await git.add('.');
    const commitResult = await git.commit(`Restored version from ${commitHash.slice(0, 7)}`);
    return {
      success: true,
      message: `Restored to commit ${commitResult.commit.slice(0, 7)}`,
    };
  } catch (err: any) {
    throw new Error(`Failed to restore version: ${err.message}`);
  }
}

// ----------------------------------------------------
// Remote GitHub / GitLab Sync Utilities
// ----------------------------------------------------

export async function getRemoteUrl(projectDir: string): Promise<string | null> {
  const git = await ensureProjectGit(projectDir);
  try {
    const remotes = await git.getRemotes(true);
    const origin = remotes.find((r) => r.name === 'origin');
    const stored = origin?.refs?.fetch || origin?.refs?.push || null;
    if (!stored) return null;

    // Migration: repositories configured by earlier versions have the token
    // baked into the URL. Move it into the credential store and rewrite the
    // remote so the secret leaves .git/config for good.
    const { url, token } = extractCredentials(stored);
    if (token) {
      saveGitToken(projectDir, token);
      try {
        await git.remote(['set-url', 'origin', url]);
      } catch {
        // Reporting the clean URL still beats handing the token back.
      }
    }
    return url;
  } catch {
    return null;
  }
}

export async function setRemoteUrl(
  projectDir: string,
  remoteUrl: string,
  token?: string
): Promise<string> {
  const git = await ensureProjectGit(projectDir);

  // The URL written to .git/config never carries credentials. If the caller
  // pasted a URL that already embeds one, it is peeled off here and stored
  // alongside any explicitly supplied token.
  const { url: cleanUrl, token: embeddedToken } = extractCredentials(remoteUrl);
  const effectiveToken = (token && token.trim()) || embeddedToken || '';
  if (effectiveToken) {
    saveGitToken(projectDir, effectiveToken);
  }

  try {
    const remotes = await git.getRemotes(true);
    const hasOrigin = remotes.some((r) => r.name === 'origin');
    if (hasOrigin) {
      await git.remote(['set-url', 'origin', cleanUrl]);
    } else {
      await git.addRemote('origin', cleanUrl);
    }
    return cleanUrl;
  } catch (err: any) {
    throw new Error(`Failed to set remote URL: ${err.message}`);
  }
}

/**
 * An authenticated git handle for one command. The token travels as an
 * `http.extraHeader` config override rather than being written anywhere on
 * disk.
 */
function authenticatedGit(projectDir: string, token?: string): SimpleGit {
  const effectiveToken = (token && token.trim()) || getGitToken(projectDir) || '';
  const config = buildAuthConfig(effectiveToken);
  return simpleGit({ baseDir: projectDir, config });
}

export async function getGitSyncStatus(projectDir: string): Promise<GitSyncStatus> {
  const git = await ensureProjectGit(projectDir);
  try {
    const status = await git.status();
    const remoteUrl = await getRemoteUrl(projectDir);

    return {
      currentBranch: status.current || 'main',
      // getRemoteUrl already strips (and migrates) any embedded credential.
      remoteUrl,
      ahead: status.ahead || 0,
      behind: status.behind || 0,
      isClean: status.isClean(),
      tracking: status.tracking || null,
    };
  } catch (err: any) {
    return {
      currentBranch: 'main',
      remoteUrl: null,
      ahead: 0,
      behind: 0,
      isClean: true,
      tracking: null,
    };
  }
}

export async function pushToRemote(
  projectDir: string,
  branch?: string,
  token?: string
): Promise<{ success: boolean; message: string }> {
  await ensureProjectGit(projectDir);
  const status = await simpleGit({ baseDir: projectDir }).status();
  const currentBranch = branch || status.current || 'main';

  if (token && token.trim()) {
    saveGitToken(projectDir, token);
  }
  const git = authenticatedGit(projectDir, token);

  try {
    await git.push('origin', currentBranch, ['--set-upstream']);
    return {
      success: true,
      message: `Successfully pushed to origin/${currentBranch}`,
    };
  } catch (err: any) {
    try {
      await git.push();
      return {
        success: true,
        message: 'Successfully pushed changes to remote repository.',
      };
    } catch (innerErr: any) {
      throw new Error(`Push failed: ${innerErr.message || err.message}`);
    }
  }
}

export async function pullFromRemote(
  projectDir: string,
  branch?: string,
  token?: string
): Promise<{ success: boolean; message: string; summary?: any }> {
  await ensureProjectGit(projectDir);
  const status = await simpleGit({ baseDir: projectDir }).status();
  const currentBranch = branch || status.current || 'main';

  if (token && token.trim()) {
    saveGitToken(projectDir, token);
  }
  const git = authenticatedGit(projectDir, token);

  try {
    const pullResult = await git.pull('origin', currentBranch);
    return {
      success: true,
      message: 'Successfully pulled latest changes from remote.',
      summary: pullResult.summary,
    };
  } catch (err: any) {
    throw new Error(`Pull failed: ${err.message}`);
  }
}
