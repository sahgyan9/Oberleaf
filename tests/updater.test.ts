import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { applySoftwareUpdate, checkSoftwareUpdate, classifyUpdate } from '../server/updater.js';

describe('classifyUpdate', () => {
  it.each([
    [0, 0, 'up-to-date'],
    [0, 3, 'behind'],
    [2, 0, 'ahead'],
    [2, 3, 'diverged'],
  ] as const)('ahead %i, behind %i is %s', (ahead, behind, state) => {
    expect(classifyUpdate(ahead, behind)).toBe(state);
  });
});

// Real repositories: an "origin" bare repo, a "publisher" clone that pushes
// new commits to it, and the "local" clone the updater runs in. No network.
const roots: string[] = [];

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd,
    encoding: 'utf8',
  }).trim();
}

function commit(cwd: string, file: string, text: string): string {
  fs.writeFileSync(path.join(cwd, file), text);
  git(cwd, 'add', file);
  git(cwd, 'commit', '-q', '-m', `edit ${file}`);
  return git(cwd, 'rev-parse', 'HEAD');
}

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oberleaf-updater-'));
  roots.push(root);
  const origin = path.join(root, 'origin.git');
  const publisher = path.join(root, 'publisher');
  const local = path.join(root, 'local');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(root, 'clone', '-q', origin, publisher);
  git(publisher, 'checkout', '-q', '-b', 'main');
  commit(publisher, 'app.txt', 'v1\n');
  git(publisher, 'push', '-q', 'origin', 'main');
  // A global core.autocrlf=true (the Git for Windows default) would check out
  // "v2\n" as "v2\r\n"; the tests compare exact contents. Set at clone time so
  // the first checkout already uses it.
  git(root, 'clone', '-q', '-c', 'core.autocrlf=false', '-b', 'main', origin, local);
  const publish = (text: string) => {
    commit(publisher, 'app.txt', text);
    git(publisher, 'push', '-q', 'origin', 'main');
  };
  return { local, publisher, publish };
}

afterEach(() => {
  for (const r of roots.splice(0)) fs.rmSync(r, { recursive: true, force: true });
});

describe('checkSoftwareUpdate / applySoftwareUpdate', { timeout: 30_000 }, () => {
  it('reports up to date when nothing changed', async () => {
    const { local } = setup();
    const status = await checkSoftwareUpdate(true, local);
    expect(status.state).toBe('up-to-date');
    expect(status.hasUpdate).toBe(false);
  });

  it('offers and applies a fast-forward when only GitHub moved', async () => {
    const { local, publish } = setup();
    publish('v2\n');
    const status = await checkSoftwareUpdate(true, local);
    expect(status).toMatchObject({ state: 'behind', hasUpdate: true, behindBy: 1, aheadBy: 0, commitMessage: 'edit app.txt' });

    const result = await applySoftwareUpdate(local);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(local, 'app.txt'), 'utf8')).toBe('v2\n');
  });

  it('never offers or applies an update over unpushed local commits', async () => {
    const { local } = setup();
    const mine = commit(local, 'notes.txt', 'unpushed work\n');
    const status = await checkSoftwareUpdate(true, local);
    expect(status).toMatchObject({ state: 'ahead', hasUpdate: false, aheadBy: 1 });

    const result = await applySoftwareUpdate(local);
    expect(result.success).toBe(false);
    expect(git(local, 'rev-parse', 'HEAD')).toBe(mine);
  });

  it('refuses a diverged copy and keeps the local commit', async () => {
    const { local, publish } = setup();
    const mine = commit(local, 'notes.txt', 'unpushed work\n');
    publish('v2\n');
    const status = await checkSoftwareUpdate(true, local);
    expect(status).toMatchObject({ state: 'diverged', hasUpdate: false, aheadBy: 1, behindBy: 1 });

    const result = await applySoftwareUpdate(local);
    expect(result.success).toBe(false);
    expect(git(local, 'rev-parse', 'HEAD')).toBe(mine);
    expect(fs.readFileSync(path.join(local, 'notes.txt'), 'utf8')).toBe('unpushed work\n');
  });

  it('stops instead of overwriting an uncommitted edit to an updated file', async () => {
    const { local, publish } = setup();
    publish('v2\n');
    fs.writeFileSync(path.join(local, 'app.txt'), 'my uncommitted edit\n');

    const result = await applySoftwareUpdate(local);
    expect(result.success).toBe(false);
    expect(fs.readFileSync(path.join(local, 'app.txt'), 'utf8')).toBe('my uncommitted edit\n');
  });

  it('keeps an uncommitted edit to a file the update does not touch', async () => {
    const { local, publisher, publish } = setup();
    commit(publisher, 'other.txt', 'base\n');
    git(publisher, 'push', '-q', 'origin', 'main');
    git(local, 'pull', '-q', '--ff-only', 'origin', 'main');
    publish('v2\n');
    fs.writeFileSync(path.join(local, 'other.txt'), 'my uncommitted edit\n');

    const result = await applySoftwareUpdate(local);
    expect(result.success).toBe(true);
    expect(fs.readFileSync(path.join(local, 'app.txt'), 'utf8')).toBe('v2\n');
    expect(fs.readFileSync(path.join(local, 'other.txt'), 'utf8')).toBe('my uncommitted edit\n');
  });

  it('reports offline when the remote cannot be reached', async () => {
    const { local } = setup();
    git(local, 'remote', 'set-url', 'origin', path.join(os.tmpdir(), 'oberleaf-no-such-remote.git'));
    const status = await checkSoftwareUpdate(true, local);
    expect(status).toMatchObject({ hasUpdate: false, isOffline: true });
  });
});
