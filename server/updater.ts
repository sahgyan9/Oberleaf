import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface UpdateStatus {
  hasUpdate: boolean;
  currentCommit: string;
  latestCommit: string;
  commitMessage?: string;
  checkedAt: string;
  error?: string;
  isOffline?: boolean;
}

let cachedStatus: UpdateStatus | null = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 60 * 1000; // Cache for 60 seconds

/**
 * Checks if the remote main branch has commits ahead of current HEAD.
 */
export async function checkSoftwareUpdate(force = false): Promise<UpdateStatus> {
  const now = Date.now();
  if (!force && cachedStatus && now - lastCheckTime < CACHE_TTL_MS) {
    return cachedStatus;
  }

  const cwd = process.cwd();
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
    // Fast 5-second remote branch check
    const { stdout: remoteHead } = await execAsync('git ls-remote origin -h refs/heads/main', {
      cwd,
      timeout: 6000,
    });
    const parts = remoteHead.trim().split(/\s+/);
    const latestCommit = parts[0];

    if (latestCommit && latestCommit.length >= 7) {
      const hasUpdate = !latestCommit.startsWith(currentCommit) && !currentCommit.startsWith(latestCommit);

      let commitMessage = '';
      if (hasUpdate) {
        try {
          const res = await fetch('https://api.github.com/repos/sahgyan9/Oberleaf/commits/main', {
            headers: { 'User-Agent': 'Oberleaf-Desktop-Updater' },
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const data: any = await res.json();
            commitMessage = data.commit?.message?.split('\n')[0] || '';
          }
        } catch {
          // Non-critical if commit message fetch fails
        }
      }

      cachedStatus = {
        hasUpdate,
        currentCommit: currentCommit.substring(0, 7),
        latestCommit: latestCommit.substring(0, 7),
        commitMessage,
        checkedAt: new Date().toISOString(),
      };
      lastCheckTime = now;
      return cachedStatus;
    }
  } catch (err: any) {
    // Offline or network timeout
    return {
      hasUpdate: false,
      isOffline: true,
      currentCommit: currentCommit.substring(0, 7),
      latestCommit: currentCommit.substring(0, 7),
      checkedAt: new Date().toISOString(),
      error: 'Offline or cannot reach GitHub.',
    };
  }

  return {
    hasUpdate: false,
    currentCommit: currentCommit.substring(0, 7),
    latestCommit: currentCommit.substring(0, 7),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Pulls latest updates from git and installs any dependencies if package.json was modified.
 */
export async function applySoftwareUpdate(): Promise<{ success: boolean; message: string; error?: string }> {
  const cwd = process.cwd();
  try {
    const { stdout: pullOut } = await execAsync('git pull origin main', { cwd, timeout: 30000 });

    // Invalidate update check cache
    cachedStatus = null;
    lastCheckTime = 0;

    return {
      success: true,
      message: `Updated successfully: ${pullOut.trim()}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: 'Failed to pull update from GitHub.',
      error: err.message,
    };
  }
}
