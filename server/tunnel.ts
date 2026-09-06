import os from 'os';
import { spawn, execSync, ChildProcess } from 'child_process';

interface TunnelState {
  isActive: boolean;
  url: string | null;
  startedAt: string | null;
  process: ChildProcess | null;
}

const state: TunnelState = {
  isActive: false,
  url: null,
  startedAt: null,
  process: null,
};

/**
 * Returns all non-internal IPv4 addresses for this machine (LAN / Wi-Fi).
 */
export function getLocalIpAddresses(): string[] {
  const interfaces = os.networkInterfaces();
  const addresses: string[] = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

/**
 * Checks if the cloudflared executable is present in PATH.
 */
export function isCloudflaredAvailable(): boolean {
  try {
    const cmd = process.platform === 'win32' ? 'where cloudflared' : 'which cloudflared';
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns current tunnel and network status.
 */
export function getCollabNetworkStatus(port: number = 5173) {
  const ips = getLocalIpAddresses();
  const primaryIp = ips[0] || '127.0.0.1';
  return {
    localIp: primaryIp,
    allIps: ips,
    localUrl: `http://${primaryIp}:${port}`,
    isCloudflaredAvailable: isCloudflaredAvailable(),
    tunnel: {
      isActive: state.isActive,
      url: state.url,
      startedAt: state.startedAt,
    },
  };
}

/**
 * Starts a Cloudflare Quick Tunnel forwarding to the local dev/app server.
 */
export function startCloudflareTunnel(targetUrl: string = 'http://127.0.0.1:5173'): Promise<string> {
  return new Promise((resolve, reject) => {
    if (state.isActive && state.url) {
      return resolve(state.url);
    }

    if (!isCloudflaredAvailable()) {
      return reject(new Error('cloudflared is not installed in system PATH. Install via: winget install Cloudflare.cloudflared'));
    }

    // Stop any existing process if lingering
    stopCloudflareTunnel();

    try {
      const child = spawn('cloudflared', ['tunnel', '--url', targetUrl], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        windowsHide: true,
      });

      state.process = child;
      state.isActive = true;
      state.startedAt = new Date().toISOString();

      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          stopCloudflareTunnel();
          reject(new Error('Cloudflare tunnel startup timed out after 25 seconds.'));
        }
      }, 25000);

      const urlRegex = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/;

      const handleOutput = (data: Buffer) => {
        const text = data.toString();
        const match = text.match(urlRegex);
        if (match && !resolved) {
          resolved = true;
          clearTimeout(timeout);
          state.url = match[0];
          resolve(state.url);
        }
      };

      child.stdout?.on('data', handleOutput);
      child.stderr?.on('data', handleOutput);

      child.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          stopCloudflareTunnel();
          reject(new Error(`Failed to launch cloudflared: ${err.message}`));
        }
      });

      child.on('close', () => {
        state.isActive = false;
        state.url = null;
        state.startedAt = null;
        state.process = null;
      });
    } catch (err: any) {
      stopCloudflareTunnel();
      reject(err);
    }
  });
}

/**
 * Stops any active Cloudflare tunnel.
 */
export function stopCloudflareTunnel(): boolean {
  if (state.process) {
    try {
      if (process.platform === 'win32' && state.process.pid) {
        execSync(`taskkill /pid ${state.process.pid} /T /F`, { stdio: 'ignore' });
      } else {
        state.process.kill('SIGTERM');
      }
    } catch {}
  }
  state.isActive = false;
  state.url = null;
  state.startedAt = null;
  state.process = null;
  return true;
}

// Cleanup on exit
process.on('exit', () => {
  stopCloudflareTunnel();
});
