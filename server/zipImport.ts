import zlib from 'zlib';

// A minimal reader for the .zip files Overleaf's "Download > Source" produces
// (and most other zip tools): stored or deflated entries, no encryption, no
// zip64. Reading it here instead of shelling out to tar/Expand-Archive keeps
// import identical on Windows and Linux and lets every entry path be checked
// before anything is written.

export interface ZipEntry {
  /** Forward-slash path relative to the archive root, already validated. */
  path: string;
  data: Buffer;
}

const MAX_ENTRIES = 5000;
const MAX_TOTAL_BYTES = 500 * 1024 * 1024;

// Metadata other tools add that never belongs in a LaTeX project.
const IGNORED_SEGMENTS = new Set(['__MACOSX', '.git', '.DS_Store', 'Thumbs.db']);

export class ZipImportError extends Error {
  /** Set when the zip has several documents and the user must pick the one to compile */
  candidates?: string[];
}

function findEndOfCentralDirectory(buf: Buffer): number {
  // The record is 22 bytes plus a comment of at most 65535 bytes.
  const stop = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= stop; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

// Rejects anything that could land outside the project: absolute paths,
// drive letters and ".." segments. Returns undefined for entries to skip.
export function safeEntryPath(rawName: string): string | undefined {
  const name = rawName.replace(/\\/g, '/');
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) {
    throw new ZipImportError(`The zip contains an absolute path (${rawName}).`);
  }
  const segments = name.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.some((s) => s === '..')) {
    throw new ZipImportError(`The zip contains a path that points outside the project (${rawName}).`);
  }
  if (segments.length === 0 || segments.some((s) => IGNORED_SEGMENTS.has(s))) return undefined;
  return segments.join('/');
}

export function readZip(buf: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buf);
  if (eocd < 0) throw new ZipImportError('This file is not a .zip archive.');

  const count = buf.readUInt16LE(eocd + 10);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) {
    throw new ZipImportError('This zip uses the zip64 format, which import does not support. Re-create it with a standard zip tool.');
  }
  if (count > MAX_ENTRIES) throw new ZipImportError(`The zip has ${count} entries; import accepts at most ${MAX_ENTRIES}.`);

  const entries: ZipEntry[] = [];
  let total = 0;
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) {
      throw new ZipImportError('The zip is damaged (bad central directory).');
    }
    const flags = buf.readUInt16LE(p + 8);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const compressedSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const unixMode = buf.readUInt32LE(p + 38) >>> 16;
    const localOffset = buf.readUInt32LE(p + 42);
    const rawName = buf.toString(flags & 0x800 ? 'utf8' : 'latin1', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith('/') || rawName.endsWith('\\')) continue; // directory
    if ((unixMode & 0o170000) === 0o120000) continue; // symlink: never follow
    const entryPath = safeEntryPath(rawName);
    if (!entryPath) continue;

    if (flags & 0x1) throw new ZipImportError(`${rawName} is encrypted. Export the project without a password.`);
    total += size;
    if (total > MAX_TOTAL_BYTES) throw new ZipImportError('The zip unpacks to more than 500 MB, which is too large to import.');

    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) {
      throw new ZipImportError('The zip is damaged (bad local header).');
    }
    const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
    const raw = buf.subarray(dataStart, dataStart + compressedSize);

    let data: Buffer;
    if (method === 0) {
      data = Buffer.from(raw);
    } else if (method === 8) {
      // maxOutputLength guards against an entry that lies about its size.
      data = zlib.inflateRawSync(raw, { maxOutputLength: Math.max(size, 1) });
    } else {
      throw new ZipImportError(`${rawName} uses a compression method import does not support (${method}).`);
    }
    if (data.length !== size || zlib.crc32(data) !== crc) {
      throw new ZipImportError(`${rawName} is damaged inside the zip (checksum mismatch).`);
    }
    entries.push({ path: entryPath, data });
  }
  return entries;
}

// GitHub and Finder zips wrap everything in one folder named after the
// project; Overleaf's do not. Unwrap the single folder so main.tex lands at
// the project root either way.
export function unwrapSingleFolder(entries: ZipEntry[]): ZipEntry[] {
  if (entries.length === 0) return entries;
  const first = entries[0].path.split('/')[0];
  const wrapped = entries.every((e) => e.path.includes('/') && e.path.split('/')[0] === first);
  return wrapped ? entries.map((e) => ({ ...e, path: e.path.slice(first.length + 1) })) : entries;
}

const DOCUMENTCLASS = /\\documentclass\s*(\[[^\]]*\])?\s*\{/;

function declaresDocumentClass(data: Buffer): boolean {
  return data
    .toString('utf8')
    .split(/\r?\n/)
    .some((l) => DOCUMENTCLASS.test(l.replace(/(^|[^\\])%.*$/, '$1')));
}

/**
 * Oberleaf always compiles main.tex. Overleaf projects often call the root
 * document something else (Springer Nature's template uses sn-article.tex),
 * so pick the top-level .tex file that declares \documentclass and, if it is
 * not already main.tex, rename it. Returns the original name when renamed.
 */
export function chooseMainFile(entries: ZipEntry[], preferred?: string): { entries: ZipEntry[]; renamedFrom?: string } {
  const topLevelTex = entries.filter((e) => !e.path.includes('/') && e.path.toLowerCase().endsWith('.tex'));
  const roots = topLevelTex.filter((e) => declaresDocumentClass(e.data));
  const main = topLevelTex.find((e) => e.path === 'main.tex');

  if (roots.length === 0) {
    throw new ZipImportError('The zip has no top-level .tex file with \\documentclass, so there is no document to compile.');
  }
  // Journal and conference kits ship several sample documents (IEEEtran's
  // bare_conf.tex and bare_jrnl.tex, elsarticle's -num and -harv variants),
  // and Overleaf's "main document" setting is not in its zip. Ask.
  const picked = preferred ? roots.find((r) => r.path === preferred) : roots.length === 1 ? roots[0] : main && roots.includes(main) ? main : undefined;
  if (!picked) {
    const err = new ZipImportError(`The zip has several documents (${roots.map((r) => r.path).join(', ')}). Choose the one to compile.`);
    err.candidates = roots.map((r) => r.path).sort();
    throw err;
  }
  if (picked === main) return { entries };
  if (main) {
    throw new ZipImportError(
      `The document is ${picked.path}, but the zip also has a main.tex that is not that document. ` +
        `Rename ${picked.path} to main.tex in the zip and import again.`
    );
  }
  const root = picked;
  return {
    entries: entries.map((e) => (e === root ? { ...e, path: 'main.tex' } : e)),
    renamedFrom: root.path,
  };
}
