import { spawn } from 'child_process';

/**
 * Replaces this server process with a fresh copy of itself (same Node flags,
 * script and arguments). Used after an update when the server runs without
 * `tsx watch`, which used to restart it on file changes.
 *
 * The copy inherits the log output, waits for this process to release the
 * port (see the EADDRINUSE retry in index.ts), and this process exits.
 */
export function relaunchSelf(): never {
  const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'inherit',
    windowsHide: true,
    env: { ...process.env, OBERLEAF_RESTARTING: '1' },
  });
  child.unref();
  console.log(`[Oberleaf] Restarting after update (new process ${child.pid}).`);
  process.exit(0);
}
