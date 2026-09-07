/**
 * Session token handling for shared workspaces.
 *
 * The API authenticates anything arriving from off this machine (see
 * server/auth.ts). An invite link carries the token as `?ot=...`; this module
 * moves it into a cookie on first load and strips it from the address bar.
 *
 * A cookie rather than an Authorization header, deliberately: <img> tags and
 * pdf.js document loads cannot attach a custom header, and those requests have
 * to authenticate too.
 */
const TOKEN_PARAM = 'ot';
const COOKIE_NAME = 'oberleaf_session';

export function adoptSessionTokenFromUrl(): void {
  try {
    const params = new URLSearchParams(window.location.search);
    const token = params.get(TOKEN_PARAM);
    if (!token) return;

    document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; SameSite=Lax`;

    // Keep the token out of the visible URL so it is not copied onward or left
    // in a screenshot.
    params.delete(TOKEN_PARAM);
    const query = params.toString();
    window.history.replaceState(
      {},
      '',
      window.location.pathname + (query ? `?${query}` : '') + window.location.hash
    );
  } catch {
    // A blocked cookie store must not stop the app from booting.
  }
}

/** Append the session token to an invite URL handed to a collaborator. */
export function withSessionToken(url: string, token?: string | null): string {
  if (!token) return url;
  return `${url}${url.includes('?') ? '&' : '?'}${TOKEN_PARAM}=${encodeURIComponent(token)}`;
}
