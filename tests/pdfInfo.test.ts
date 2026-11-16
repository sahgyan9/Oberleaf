import { describe, expect, it } from 'vitest';
import { parsePageCountFromLog } from '../server/pdfInfo';

describe('parsePageCountFromLog', () => {
  it('reads the count from a pdfTeX log', () => {
    const log = 'stuff\nOutput written on main.pdf (12 pages, 345678 bytes).\nSyncTeX written on main.synctex.gz.';
    expect(parsePageCountFromLog(log)).toBe(12);
  });

  it('reads a single page', () => {
    expect(parsePageCountFromLog('Output written on cv.pdf (1 page, 40213 bytes).')).toBe(1);
  });

  it('joins a line TeX wrapped at 79 characters, even inside the word', () => {
    const log =
      'Output written on C:/Users/someone/Documents/Oberleaf Projects/thesis/.build/ma\n' +
      'in.pdf (104 pag\nes, 2345678 bytes).';
    expect(parsePageCountFromLog(log)).toBe(104);
  });

  it('reads a XeTeX log, which gives no byte count', () => {
    expect(parsePageCountFromLog('Output written on main.pdf (3 pages).')).toBe(3);
  });

  it('uses the last run when latexmk ran the engine several times', () => {
    const log = 'Output written on main.pdf (2 pages, 100 bytes).\n...\nOutput written on main.pdf (3 pages, 120 bytes).';
    expect(parsePageCountFromLog(log)).toBe(3);
  });

  it('returns 0 when nothing was typeset', () => {
    expect(parsePageCountFromLog('! Emergency stop.\nNo pages of output.')).toBe(0);
  });

  it('returns null when the log says neither', () => {
    expect(parsePageCountFromLog('This is pdfTeX, Version 3.141592653')).toBeNull();
  });
});
