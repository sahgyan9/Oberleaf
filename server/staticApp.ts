import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * Serves the production build of the client (`vite build` -> dist/) from this
 * server, so a normal launch needs one Node process and no Vite dev server.
 *
 * Enabled with `--serve-build` (the Windows launcher and `npm run app` pass
 * it). `npm start` leaves it off and keeps Vite with hot reload for
 * development.
 *
 * Measured on the author's machine: the dev server takes 4.7-5.8 s to the
 * project list after every restart, and 24.6 s when Vite has to re-bundle its
 * dependencies; the build loads in 0.5 s.
 */

export const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');

// Vite names emitted files `<name>-<8-char hash>.<ext>`; their content never
// changes under that name, so the browser may keep them indefinitely.
const HASHED_ASSET = /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/i;

let servingBuild = false;

/** True once the built client is mounted, i.e. the app is served on the API port. */
export function isServingBuild(): boolean {
  return servingBuild;
}

export function wantsBuiltClient(argv: readonly string[] = process.argv): boolean {
  return argv.includes('--serve-build');
}

/**
 * Mounts dist/ and a fallback that answers page navigations with index.html.
 * Returns false (and mounts nothing) when the flag is absent or no build exists.
 */
export function mountBuiltClient(app: express.Express, argv: readonly string[] = process.argv): boolean {
  if (!wantsBuiltClient(argv)) return false;

  const indexHtml = path.join(DIST_DIR, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.error(`[Oberleaf] --serve-build was given but ${indexHtml} does not exist. Run "npx vite build" first.`);
    return false;
  }

  app.use(
    express.static(DIST_DIR, {
      index: false,
      setHeaders(res, filePath) {
        if (HASHED_ASSET.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    })
  );

  // Client-side routes (the app uses hash routes, but a pasted ?project= link
  // or a refresh must still get the page). API and health paths keep their 404s.
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path === '/health') return next();
    if (!req.accepts('html')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });

  servingBuild = true;
  return true;
}
