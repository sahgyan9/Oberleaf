import type { FileEntry } from '../components/FileTree/FileTree';

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.svg', '.webp', '.pdf', '.gif', '.eps'];

/** Extensions an <img> tag can actually decode from the preview endpoint. */
const THUMBNAIL_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];

/** dataTransfer type used when an image row is dragged out of the file tree. */
export const PROJECT_IMAGE_DRAG_TYPE = 'application/x-oberleaf-image-path';

export interface ImageAtCursor {
  currentPath: string;
  range: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  };
  hasClosingBrace: boolean;
  position?: { top: number; left: number };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot).toLowerCase();
}

export function isImagePath(name: string): boolean {
  return IMAGE_EXTENSIONS.includes(extensionOf(name));
}

export function hasThumbnail(name: string): boolean {
  return THUMBNAIL_EXTENSIONS.includes(extensionOf(name));
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/') || isImagePath(file.name);
}

export function previewImageUrl(projectId: string, relativePath: string): string {
  return `/api/projects/${projectId}/preview-image?path=${encodeURIComponent(relativePath)}`;
}

/**
 * Recursively find all image files across the project directory tree.
 */
export function findProjectImages(entries: FileEntry[]): FileEntry[] {
  let images: FileEntry[] = [];
  if (!entries || !Array.isArray(entries)) return images;

  for (const entry of entries) {
    if (entry.type === 'file') {
      const ext = (entry.extension || extensionOf(entry.name)).toLowerCase();
      if (IMAGE_EXTENSIONS.includes(ext)) {
        images.push(entry);
      }
    } else if (entry.type === 'directory' && entry.children) {
      images = images.concat(findProjectImages(entry.children));
    }
  }
  return images;
}

/**
 * Resolve what LaTeX would load for an \includegraphics argument. graphicx
 * accepts the path with or without its extension, so both must match.
 */
export function resolveProjectImage(images: FileEntry[], texPath: string): FileEntry | undefined {
  const wanted = texPath.trim().replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase();
  if (!wanted) return undefined;
  return images.find((img) => {
    const rel = img.relativePath.toLowerCase();
    return rel === wanted || rel.replace(/\.[^/.]+$/, '') === wanted;
  });
}

/**
 * Format bytes into human-readable string.
 */
export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "figures/Wind Tunnel_v2.png" -> "fig:wind-tunnel-v2" */
export function figureLabelFromPath(relativePath: string): string {
  const base = relativePath.split('/').pop() || relativePath;
  const slug = base
    .replace(/\.[^/.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `fig:${slug || 'figure'}`;
}

/**
 * Clipboard screenshots all arrive named "image.png". Give each a timestamped
 * name so a second paste never lands on top of the first.
 */
export function pastedImageName(file: File): string {
  const ext = extensionOf(file.name) || `.${(file.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `pasted-${stamp}${ext}`;
}

/**
 * Upload one image into the project's figures/ folder and return the path to
 * reference from LaTeX. Never overwrites: dropping a second "plot.png" must
 * not silently replace a figure already used elsewhere in the document.
 */
export async function uploadProjectImage(projectId: string, file: File, fileName = file.name): Promise<string> {
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${fileName}`));
    reader.readAsDataURL(file);
  });

  const res = await fetch(`/api/projects/${projectId}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, base64Data, overwrite: false }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.relativePath) {
    throw new Error(data.error || `Upload of ${fileName} failed`);
  }
  return data.relativePath as string;
}

/**
 * Detects if a cursor at (lineNumber, column) is inside the path argument of \includegraphics{...}.
 * column is 1-based (Monaco standard). A cursor sitting just after the closing
 * brace is outside: that is where the caret lands after a path is chosen.
 */
export function extractImageAtPosition(
  lineContent: string,
  column: number,
  lineNumber: number
): ImageAtCursor | null {
  if (!lineContent) return null;

  // Ignore LaTeX line comments if cursor is after %
  const commentIndex = lineContent.search(/(^|[^\\])%/);
  if (commentIndex !== -1 && column > commentIndex + 1) {
    return null;
  }

  // Regex to match \includegraphics with optional [options] and the opening {
  const regex = /\\includegraphics\*?(?:\s*\[[^\]]*\])?\s*\{/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(lineContent)) !== null) {
    const openBraceIndex = match.index + match[0].length - 1; // 0-based index of '{'
    const pathStartCol = openBraceIndex + 2; // 1-based column of first path char

    if (column < pathStartCol) {
      continue;
    }

    const closeBraceIndex = lineContent.indexOf('}', openBraceIndex + 1);

    if (closeBraceIndex !== -1) {
      const closeBraceCol = closeBraceIndex + 1; // 1-based column of '}'
      if (column <= closeBraceCol) {
        return {
          currentPath: lineContent.substring(openBraceIndex + 1, closeBraceIndex),
          range: {
            startLineNumber: lineNumber,
            startColumn: pathStartCol,
            endLineNumber: lineNumber,
            endColumn: closeBraceCol,
          },
          hasClosingBrace: true,
        };
      }
    } else {
      // In-progress typing: no closing brace yet on this line
      const commentIdx = lineContent.indexOf('%', openBraceIndex + 1);
      const endIdx = commentIdx !== -1 ? commentIdx : lineContent.length;
      const currentPath = lineContent.substring(openBraceIndex + 1, endIdx).trimEnd();
      const endCol = pathStartCol + currentPath.length;

      if (column <= endCol) {
        return {
          currentPath,
          range: {
            startLineNumber: lineNumber,
            startColumn: pathStartCol,
            endLineNumber: lineNumber,
            endColumn: endCol,
          },
          hasClosingBrace: false,
        };
      }
    }
  }

  return null;
}
