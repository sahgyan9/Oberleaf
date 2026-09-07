import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Git access tokens used to be spliced into the project's origin URL, which put
 * them in cleartext in <project>/.git/config. That directory defaults to the
 * user's OneDrive Documents folder, so the token synced to the cloud, and the
 * project zip export bundled it.
 *
 * Tokens now live in a single file outside every project directory, and the
 * remote URL stays clean.
 */
interface CredentialStore {
  [projectKey: string]: string;
}

function getStoreDir(): string {
  const base =
    process.env.APPDATA ||
    (process.platform === 'darwin'
      ? path.join(os.homedir(), 'Library', 'Application Support')
      : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'Oberleaf');
}

function getStorePath(): string {
  return path.join(getStoreDir(), 'git-credentials.json');
}

// The absolute project path is the key. Normalised so that a differently-cased
// or trailing-slash path still finds its token on Windows.
function projectKey(projectDir: string): string {
  return path.resolve(projectDir).replace(/[\/]+$/, '').toLowerCase();
}

function readStore(): CredentialStore {
  try {
    const p = getStorePath();
    if (!fs.existsSync(p)) return {};
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as CredentialStore;
  } catch {
    return {};
  }
}

function writeStore(store: CredentialStore): void {
  const dir = getStoreDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  const p = getStorePath();
  fs.writeFileSync(p, JSON.stringify(store, null, 2), { encoding: 'utf-8', mode: 0o600 });
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    // Best effort: chmod is a no-op on some Windows filesystems.
  }
}

export function saveGitToken(projectDir: string, token: string): void {
  const trimmed = (token || '').trim();
  if (!trimmed) return;
  const store = readStore();
  store[projectKey(projectDir)] = trimmed;
  writeStore(store);
}

export function getGitToken(projectDir: string): string | null {
  return readStore()[projectKey(projectDir)] || null;
}

export function clearGitToken(projectDir: string): void {
  const store = readStore();
  delete store[projectKey(projectDir)];
  writeStore(store);
}

/**
 * Splits credentials out of a remote URL, e.g.
 * https://ghp_xxx@github.com/me/repo -> { url, token: 'ghp_xxx' }.
 * Used to migrate repositories that were configured before tokens moved out of
 * .git/config.
 */
export function extractCredentials(remoteUrl: string): { url: string; token: string | null } {
  const match = /^(https?:\/\/)([^@/]+)@(.*)$/.exec(remoteUrl.trim());
  if (!match) return { url: remoteUrl.trim(), token: null };

  const [, scheme, userinfo, rest] = match;
  // Both "token@host" and "user:token@host" appear in the wild.
  const token = userinfo.includes(':') ? userinfo.split(':').slice(1).join(':') : userinfo;
  return { url: `${scheme}${rest}`, token: token || null };
}

/**
 * Builds the `git -c ...` arguments that authenticate a single command.
 * Passing the token as config rather than writing it into the remote URL keeps
 * it out of .git/config entirely; it exists only for the life of the process.
 */
export function buildAuthConfig(token: string | null | undefined): string[] {
  const trimmed = (token || '').trim();
  if (!trimmed) return [];
  const basic = Buffer.from(`x-access-token:${trimmed}`).toString('base64');
  return [`http.extraHeader=Authorization: Basic ${basic}`];
}
