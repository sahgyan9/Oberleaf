import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

export interface SyncTexRecord {
  tag: number;
  line: number;
  page: number;
  x: number; // in points
  y: number; // in points
  w?: number;
  h?: number;
}

export interface ForwardSyncResult {
  page: number;
  x: number; // points
  y: number; // points
  line: number;
  file: string;
}

export interface BackwardSyncResult {
  file: string;
  line: number;
  page: number;
}

export class SyncTexParser {
  private synctexFilePath: string;
  private inputs: Map<number, string> = new Map();
  private records: SyncTexRecord[] = [];
  private isParsed: boolean = false;

  constructor(synctexFilePath: string) {
    this.synctexFilePath = synctexFilePath;
  }

  private parse() {
    if (this.isParsed) return;
    if (!fs.existsSync(this.synctexFilePath)) return;

    try {
      const buf = fs.readFileSync(this.synctexFilePath);
      const text = zlib.gunzipSync(buf).toString('utf-8');
      const lines = text.split('\n');

      let inContent = false;
      let currentPage = 1;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        if (!inContent) {
          const inputMatch = line.match(/^Input:(\d+):(.*)$/);
          if (inputMatch) {
            const tag = parseInt(inputMatch[1], 10);
            this.inputs.set(tag, inputMatch[2].trim());
          }
          if (line.startsWith('Content:')) {
            inContent = true;
          }
          continue;
        }

        // Inside content section
        if (line.startsWith('{')) {
          currentPage = parseInt(line.slice(1), 10) || 1;
          continue;
        }

        if (line.startsWith('}')) {
          continue;
        }

        // Record lines: [tag,line:x,y:w,h,d or (tag,line:x,y... or x, k, h, g
        const match = line.match(/^([xkhg\(\[])(\d+),(\d+):([-\d]+),([-\d]+)(?::([-\d]+),([-\d]+))?/);
        if (match) {
          const tag = parseInt(match[2], 10);
          const lineNum = parseInt(match[3], 10);
          const x = parseInt(match[4], 10) / 65536;
          const y = parseInt(match[5], 10) / 65536;
          const w = match[6] ? parseInt(match[6], 10) / 65536 : undefined;
          const h = match[7] ? parseInt(match[7], 10) / 65536 : undefined;

          if (lineNum > 0) {
            this.records.push({
              tag,
              line: lineNum,
              page: currentPage,
              x,
              y,
              w,
              h,
            });
          }
        }
      }

      this.isParsed = true;
    } catch {
      // SyncTeX read or parse error
    }
  }

  public forward(targetFile: string, targetLine: number): ForwardSyncResult | null {
    this.parse();
    if (this.records.length === 0) return null;

    const baseName = path.basename(targetFile).toLowerCase();

    // Find matching tag
    let matchingTag: number | null = null;
    for (const [tag, filePath] of this.inputs.entries()) {
      if (
        filePath.toLowerCase().endsWith(baseName) ||
        path.basename(filePath).toLowerCase() === baseName
      ) {
        matchingTag = tag;
        break;
      }
    }

    if (matchingTag === null) {
      // Default to tag 1 (primary input)
      matchingTag = 1;
    }

    const fileRecords = this.records.filter((r) => r.tag === matchingTag);
    if (fileRecords.length === 0) return null;

    // Find record closest to targetLine
    let closestRecord = fileRecords[0];
    let minDiff = Math.abs(closestRecord.line - targetLine);

    for (const rec of fileRecords) {
      const diff = Math.abs(rec.line - targetLine);
      if (diff < minDiff) {
        minDiff = diff;
        closestRecord = rec;
      }
      if (diff === 0) break;
    }

    return {
      page: closestRecord.page,
      x: Math.round(closestRecord.x),
      y: Math.round(closestRecord.y),
      line: closestRecord.line,
      file: targetFile,
    };
  }

  public backward(page: number, x: number, y: number): BackwardSyncResult | null {
    this.parse();
    if (this.records.length === 0) return null;

    const pageRecords = this.records.filter((r) => r.page === page);
    if (pageRecords.length === 0) {
      // Fallback: look at closest page
      return {
        file: 'main.tex',
        line: 1,
        page,
      };
    }

    let closest = pageRecords[0];
    let minDist = (closest.x - x) ** 2 + (closest.y - y) ** 2;

    for (const rec of pageRecords) {
      const dist = (rec.x - x) ** 2 + (rec.y - y) ** 2;
      if (dist < minDist) {
        minDist = dist;
        closest = rec;
      }
    }

    const matchedInput = this.inputs.get(closest.tag) || 'main.tex';
    return {
      file: path.basename(matchedInput),
      line: closest.line,
      page: closest.page,
    };
  }
}

export function getProjectSyncTex(projectDir: string, mainFile = 'main.tex'): SyncTexParser | null {
  const baseName = path.basename(mainFile, path.extname(mainFile));
  const synctexPath = path.join(projectDir, '.build', `${baseName}.synctex.gz`);

  if (!fs.existsSync(synctexPath)) {
    return null;
  }
  return new SyncTexParser(synctexPath);
}
