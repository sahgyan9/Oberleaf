import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Where this checkout stands relative to origin/main:
 *   up-to-date  same commit
 *   behind      origin has commits this copy lacks, and nothing local is missing there: safe to fast-forward
 *   ahead       this copy has commits origin lacks (unpushed work): nothing to download
 *   diverged    both sides have commits the other lacks: updating would need a merge, which is the user's call
 */
export type UpdateState = 'up-to-date' | 'behind' | 'ahead' | 'diverged';

export interface UpdateStatus {
  hasUpdate: boolean;
  state?: UpdateState;
  /** Commits on this copy that origin/main does not have */
  aheadBy?: number;
  /** Commits on origin/main that this copy does not have */
  behindBy?: number;
  currentCommit: string;
  latestCommit: string;
  commitMessage?: string;
  checkedAt: string;
  error?: string;
  isOffline?: boolean;
}

export function classifyUpdate(aheadBy: number, behindBy: number): UpdateState {
  if (aheadBy === 0 && behindBy === 0) return 'up-to-date';
  if (aheadBy === 0) return 'behind';
  if (behindBy === 0) return 'ahead';
  return 'diverged';
}

let cachedStatus: UpdateStatus | null = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 60 * 1000; // Cache for 60 seconds

// An explicit refspec, so the result lands in origin/main whatever the
// remote's configured fetch refspec is, and concurrent fetches cannot race
// over FETCH_HEAD.
const FETCH_MAIN = 'git fetch --quiet origin +refs/heads/main:refs/remotes/origin/main';
const REMOTE_MAIN = 'refs/remotes/origin/main';

async function aheadBehind(cwd: string): Promise<{ aheadBy: number; behindBy: number }> {
  const { stdout } = await execAsync(`git rev-list --left-right --count HEAD...${REMOTE_MAIN}`, { cwd });
  const [ahead, behind] = stdout.trim().split(/\s+/).map((n) => parseInt(n, 10));
  return { aheadBy: ahead || 0, behindBy: behind || 0 };
}

/**
 * Checks whether origin/main has commits this copy lacks. A copy that is
 * ahead of origin (unpushed commits) or has diverged from it is never offered
 * an update: the only update applySoftwareUpdate performs is a fast-forward.
 */
export async function checkSoftwareUpdate(force = false, cwd = process.cwd()): Promise<UpdateStatus> {
  const now = Date.now();
  if (!force && cachedStatus && now - lastCheckTime < CACHE_TTL_MS) {
    return cachedStatus;
  }

  let currentCommit = 'unknown';
  try {
    const { stdout: localHead } = await execAsync('git rev-parse HEAD', { cwd });
    currentCommit = localHead.trim();
  } catch {
    return {
      hasUpdate: false,
      currentCommit: 'unknown',
      latestCommit: 'unknown',
      checkedAt: new Date().toISOString(),
      error: 'Not a git repository.',
    };
  }

  try {
    await execAsync(FETCH_MAIN, { cwd, timeout: 15000 });
  } catch {
    return {
      hasUpdate: false,
      isOffline: true,
      currentCommit: currentCommit.substring(0, 7),
      latestCommit: currentCommit.substring(0, 7),
      checkedAt: new Date().toISOString(),
      error: 'Offline or cannot reach GitHub.',
    };
  }

  try {
    const { stdout: remoteHead } = await execAsync(`git rev-parse ${REMOTE_MAIN}`, { cwd });
    const { aheadBy, behindBy } = await aheadBehind(cwd);
    const state = classifyUpdate(aheadBy, behindBy);

    let commitMessage = '';
    if (state === 'behind') {
      try {
        const { stdout } = await execAsync(`git log -1 --format=%s ${REMOTE_MAIN}`, { cwd });
        commitMessage = stdout.trim();
      } catch {
        // The message is decoration; the update itself does not need it
      }
    }

    cachedStatus = {
      hasUpdate: state === 'behind',
      state,
      aheadBy,
      behindBy,
      currentCommit: currentCommit.substring(0, 7),
      latestCommit: remoteHead.trim().substring(0, 7),
      commitMessage,
      checkedAt: new Date().toISOString(),
    };
    lastCheckTime = now;
    return cachedStatus;
  } catch (err: any) {
    return {
      hasUpdate: false,
      currentCommit: currentCommit.substring(0, 7),
      latestCommit: 'unknown',
      checkedAt: new Date().toISOString(),
      error: `Could not compare with origin/main: ${err.message}`,
    };
  }
}

/**
 * Fast-forwards this copy to origin/main and installs dependencies if
 * package.json changed. It never discards anything: a copy with unpushed
 * commits is refused, and git itself refuses the fast-forward if it would
 * overwrite uncommitted edits, so those are reported instead of stashed or
 * reset away.
 */
export async function applySoftwareUpdate(
  cwd = process.cwd()
): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    await execAsync(FETCH_MAIN, { cwd, timeout: 30000 });

    // Re-check here rather than trusting the earlier check: commits can have
    // been made in between, and this is the step that changes files.
    const { aheadBy, behindBy } = await aheadBehind(cwd);
    const state = classifyUpdate(aheadBy, behindBy);
    if (state === 'up-to-date') {
      return { success: true, message: 'Already up to date.' };
    }
    if (state !== 'behind') {
      return {
        success: false,
        message:
          state === 'ahead'
            ? `This copy has ${aheadBy} commit${aheadBy === 1 ? '' : 's'} that are not on GitHub, so there is nothing to download.`
            : `This copy and GitHub have both changed (${aheadBy} local, ${behindBy} new on GitHub). ` +
              'Updating would overwrite local commits, so Oberleaf will not do it. Merge with git instead.',
        error: `Not a fast-forward (${state}).`,
      };
    }

    let packageChanged = false;
    try {
      const { stdout: diffOut } = await execAsync(`git diff --name-only HEAD ${REMOTE_MAIN}`, { cwd });
      packageChanged = diffOut.split('\n').some((f) => f.trim() === 'package.json');
    } catch {
      // Non-fatal diff check
    }

    try {
      await execAsync(`git merge --ff-only ${REMOTE_MAIN}`, { cwd, timeout: 15000 });
    } catch (err: any) {
      return {
        success: false,
        message: 'The update would overwrite files you have changed but not committed. Commit or discard those edits, then update again.',
        error: (err?.stderr || err?.message || '').toString().trim(),
      };
    }

    if (packageChanged) {
      try {
        await execAsync('npm install --prefer-offline', { cwd, timeout: 60000 });
      } catch {
        // Non-fatal if offline
      }
    }

    cachedStatus = null;
    lastCheckTime = 0;

    return {
      success: true,
      message: `Updated ${behindBy} commit${behindBy === 1 ? '' : 's'} to ${(await execAsync('git rev-parse --short HEAD', { cwd })).stdout.trim()}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Failed to apply update from GitHub.',
      error: err.message,
    };
  }
}
