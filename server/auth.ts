import crypto from 'crypto';
import type { Request } from 'express';

/**
 * Oberleaf binds the API to 0.0.0.0 and ships a one-click Cloudflare tunnel, so
 * "local-first" does not mean "only reachable locally". Every route used to be
 * unauthenticated: anyone on the same Wi-Fi, or holding a share link, could read,
 * overwrite and delete every project.
 *
 * The model here:
 *   - Requests that genuinely originate on this machine need nothing.
 *   - Everything else must present the per-boot session token.
 *   - A handful of routes (software update, shell-outs, tunnel control) are
 *     never available off-machine, token or not.
 *
 * The token lives only in memory, so it is regenerated on every restart and an
 * old invite link stops working -- which is the behaviour you want for a share
 * link that was pasted into a chat months ago.
 */
const SESSION_TOKEN = crypto.randomBytes(24).toString('hex');

export const SESSION_COOKIE_NAME = 'oberleaf_session';
export const SESSION_HEADER_NAME = 'x-oberleaf-token';
export const SESSION_QUERY_PARAM = 'ot';

export function getSessionToken(): string {
  return SESSION_TOKEN;
}

function isLoopbackAddress(addr?: string | null): boolean {
  if (!addr) return false;
  const a = addr.replace(/^::ffff:/, '');
  return a === '::1' || a === '127.0.0.1' || a.startsWith('127.');
}

/**
 * True when the request really came from this machine.
 *
 * The Vite dev server proxies /api from :5173 to 127.0.0.1:3001, so a LAN
 * visitor's request also arrives with a loopback remote address. Vite is
 * configured with `xfwd: true`, which stamps the original client onto
 * X-Forwarded-For, and that header is only consulted when the socket itself is
 * loopback -- a remote client cannot forge a loopback socket without already
 * being on this machine.
 */
export function isLocalRequest(req: Request): boolean {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;

  const forwarded = req.headers['x-forwarded-for'];
  if (!forwarded) return true;

  const first = String(Array.isArray(forwarded) ? forwarded[0] : forwarded)
    .split(',')[0]
    .trim();
  return isLoopbackAddress(first);
}

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

/**
 * Accepts the token from a cookie, a header, or a query parameter. The cookie
 * is what makes this workable: <img> tags and pdf.js page loads cannot attach a
 * custom header, and they still have to authenticate.
 */
export function hasValidToken(req: Request): boolean {
  const header = req.headers[SESSION_HEADER_NAME];
  const provided =
    (Array.isArray(header) ? header[0] : header) ||
    readCookie(req, SESSION_COOKIE_NAME) ||
    (typeof req.query?.[SESSION_QUERY_PARAM] === 'string'
      ? (req.query[SESSION_QUERY_PARAM] as string)
      : '');

  if (!provided) return false;

  const supplied = Buffer.from(String(provided));
  const expected = Buffer.from(SESSION_TOKEN);
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(supplied, expected);
}
