import { spawn } from 'child_process';

/**
 * Replaces this server process with a fresh copy of itself (same Node flags,
 * script and arguments). Used after an update when the server runs without
 * `tsx watch`, which used to restart it on file changes.
 *
 * The copy inherits the log output, waits for this process to release the
 * port (see the EADDRINUSE retry in index.ts), and this process exits.
 */
export function relaunchSelf(): void {
  const args = [...process.execArgv, ...process.argv.slice(1)];
  const env = { ...process.env, OBERLEAF_RESTARTING: '1' };

  if (process.platform !== 'win32') {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), detached: true, stdio: 'inherit', env });
    child.unref();
    console.log(`[Oberleaf] Restarting after update (new process ${child.pid}).`);
    process.exit(0);
  }

  // Windows. Node puts every child it spawns without `detached` into a job
  // object that kills it when this process exits, so a plain attached spawn
  // dies before it boots. `detached` escapes the job but leaves the copy
  // without a console, and every git or cmd it later runs then opens a
  // visible console window.
  //
  // `cmd /c start /b` does both: cmd runs in the job, but the job allows its
  // children to break away, so the server cmd starts is outside it and still
  // shares the launcher's hidden console and log file. This process exits
  // only after cmd has started it; if cmd fails, it keeps serving instead of
  // leaving nothing on the port.
  const quote = (s: string) => `"${s}"`;
  const line = ['start', '""', '/b', quote(process.execPath), ...args.map(quote)].join(' ');
  const starter = spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `"${line}"`], {
    cwd: process.cwd(),
    stdio: 'inherit',
    windowsHide: true,
    windowsVerbatimArguments: true,
    env,
  });
  console.log('[Oberleaf] Restarting after update.');
  starter.on('exit', (code) => {
    if (code === 0) process.exit(0);
    console.error(`[Oberleaf] Restart failed (cmd start exited with ${code}); still running the previous version.`);
  });
  starter.on('error', (err) => {
    console.error(`[Oberleaf] Restart failed (${err.message}); still running the previous version.`);
  });
}
