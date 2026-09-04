import { simpleGit, SimpleGit } from 'simple-git';
import path from 'path';
import fs from 'fs';

export interface CommitItem {
  hash: string;
  shortHash: string;
  message: string;
  date: string;
  author_name: string;
}

export interface DiffResult {
  filePath: string;
  oldContent: string;
  newContent: string;
  diff: string;
}

const GITIGNORE_CONTENT = `.build/
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
    await git.addConfig('user.name', 'Overleaf Copy', false, 'local');
    await git.addConfig('user.email', 'local@overleaf-copy.dev', false, 'local');

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

export async function createProjectCommit(
  projectDir: string,
  message: string = 'Autosave snapshot'
): Promise<{ committed: boolean; hash?: string; message: string }> {
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

export async function getProjectHistory(projectDir: string, maxCount: number = 50): Promise<CommitItem[]> {
  const git = await ensureProjectGit(projectDir);
  try {
    const log = await git.log({ maxCount });
    return log.all.map((c) => ({
      hash: c.hash,
      shortHash: c.hash.slice(0, 7),
      message: c.message,
      date: c.date,
      author_name: c.author_name,
    }));
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

  // Fetch file content at the specified commit
  let oldContent = '';
  try {
    oldContent = await git.show([`${commitHash}:${normalizedPath}`]);
  } catch {
    oldContent = '';
  }

  // Current file content on disk
  const fullPath = path.join(projectDir, normalizedPath);
  const currentContent = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, 'utf-8') : '';

  // Get git patch diff
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
    // Checkout all tracked files at that commit
    await git.checkout([commitHash, '--', '.']);
    // Commit the revert so history is linear and preserves the revert action
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
