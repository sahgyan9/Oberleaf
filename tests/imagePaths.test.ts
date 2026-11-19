import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  checkImagePath,
  findIncludegraphics,
  graphicsPathsIn,
  imageFileList,
  normalizeImageName,
} from '../server/imagePaths.js';

const files = imageFileList([
  'main.tex',
  'chapters/intro.tex',
  'figures/plot.png',
  'figures/Wind Tunnel.JPG',
  'logo.pdf',
  'results.2024.png',
  'img/sub/deep.eps',
  'dist/only-in-dist.png',
  '.build/main.pdf',
]);

const check = (name: string, gp: string[] = [], list = files) => checkImagePath(name, list, gp);

describe('checkImagePath: found', () => {
  it.each([
    ['figures/plot.png', 'figures/plot.png'],
    ['figures/plot', 'figures/plot.png'],
    ['plot.png', 'figures/plot.png'], // every subfolder is on TEXINPUTS
    ['plot', 'figures/plot.png'],
    ['./figures/plot', 'figures/plot.png'],
    ['FIGURES/PLOT.PNG', 'figures/plot.png'], // Windows ignores case
    ['  logo ', 'logo.pdf'],
    ['wind tunnel', 'figures/Wind Tunnel.JPG'],
    ['results.2024', 'results.2024.png'], // .2024 is not an extension
    ['deep', 'img/sub/deep.eps'], // nested folders searched recursively
    ['sub/deep.eps', 'img/sub/deep.eps'],
    ['dist/only-in-dist.png', 'dist/only-in-dist.png'], // explicit path from the root
  ])('%s', (name, expected) => {
    expect(check(name)).toEqual({ status: 'found', path: expected });
  });

  it('uses \\graphicspath prefixes, which reach folders TEXINPUTS leaves out', () => {
    expect(check('only-in-dist').status).toBe('missing');
    expect(check('only-in-dist', ['dist/'])).toEqual({ status: 'found', path: 'dist/only-in-dist.png' });
    expect(check('only-in-dist', ['./dist/'])).toEqual({ status: 'found', path: 'dist/only-in-dist.png' });
  });
});

describe('checkImagePath: skip', () => {
  it.each(['\\figdir/plot', '#1', '{plot.v2}.png', '"my plot".png', '../shared/plot', '/abs/plot.png', 'C:/x/plot.png', '', '   '])(
    '%j',
    (name) => {
      expect(check(name)).toEqual({ status: 'skip' });
    }
  );

  it('skips every name when \\graphicspath points outside the project', () => {
    expect(check('nothing-here', ['../shared/'])).toEqual({ status: 'skip' });
  });
});

describe('checkImagePath: folders the compile does not search', () => {
  it('a bare name only under dist/ or a dot folder is missing', () => {
    expect(check('only-in-dist').status).toBe('missing');
    expect(check('main.pdf').status).not.toBe('found');
  });
});

describe('checkImagePath: unloadable', () => {
  const list = imageFileList(['figures/diagram.svg', 'photo.HEIC', 'chart.svg', 'chart.pdf']);
  it('reports a file pdfLaTeX cannot read', () => {
    expect(check('diagram', [], list)).toEqual({ status: 'unloadable', path: 'figures/diagram.svg' });
    expect(check('diagram.svg', [], list)).toEqual({ status: 'unloadable', path: 'figures/diagram.svg' });
    expect(check('photo.heic', [], list)).toEqual({ status: 'unloadable', path: 'photo.HEIC' });
  });
  it('prefers a loadable twin of the same name', () => {
    expect(check('chart.svg', [], list)).toEqual({ status: 'missing', suggestion: 'chart.pdf' });
  });
  it('does not offer an unrelated near-miss over saying the format is wrong', () => {
    const l = imageFileList(['plot.svg', 'plo1.png']);
    expect(check('plot.svg', [], l)).toEqual({ status: 'unloadable', path: 'plot.svg' });
  });
});

describe('checkImagePath: suggestions', () => {
  it('same file name in another folder', () => {
    expect(check('figs/plot.png')).toEqual({ status: 'missing', suggestion: 'figures/plot.png' });
    expect(check('figs/plot')).toEqual({ status: 'missing', suggestion: 'figures/plot.png' });
  });
  it('same stem, other extension', () => {
    expect(check('plot.jpg')).toEqual({ status: 'missing', suggestion: 'figures/plot.png' });
  });
  it('near-miss stem', () => {
    expect(check('plott.png')).toEqual({ status: 'missing', suggestion: 'figures/plot.png' });
    expect(check('figures/wind tunel.jpg')).toEqual({ status: 'missing', suggestion: 'figures/Wind Tunnel.JPG' });
  });
  it('short stems allow one edit only', () => {
    expect(check('lgo')).toEqual({ status: 'missing', suggestion: 'logo.pdf' });
    expect(check('lg')).toEqual({ status: 'missing' });
  });
  it('no suggestion when two files are equally likely', () => {
    const twoFolders = imageFileList(['a/plot.png', 'b/plot.png']);
    expect(check('c/plot.png', [], twoFolders)).toEqual({ status: 'missing' });
    const twoExts = imageFileList(['plot.png', 'plot.pdf']);
    expect(check('plot.jpg', [], twoExts)).toEqual({ status: 'missing' });
    const twoNear = imageFileList(['plot1.png', 'plot2.png']);
    expect(check('plot3.png', [], twoNear)).toEqual({ status: 'missing' });
  });
  it('never suggests a format pdfLaTeX cannot read', () => {
    const l = imageFileList(['plot.svg', 'plot.gif']);
    expect(check('plot.jpg', [], l).status).not.toBe('found');
    expect(check('plot.jpg', [], l)).not.toHaveProperty('suggestion');
  });
  it('nothing close', () => {
    expect(check('completely-different.png')).toEqual({ status: 'missing' });
  });
});

describe('normalizeImageName', () => {
  it('strips ./ and spaces', () => {
    expect(normalizeImageName(' ././fig/a.png ')).toBe('fig/a.png');
  });
});

describe('findIncludegraphics', () => {
  it('finds the path argument with options, star and nested braces', () => {
    const line = String.raw`A \includegraphics*[trim={0 0 1cm 0},clip,width=0.5\linewidth]{figs/a.png} and \includegraphics{b}`;
    const calls = findIncludegraphics(line);
    expect(calls.map((c) => c.name)).toEqual(['figs/a.png', 'b']);
    expect(line[calls[0].argOpen]).toBe('{');
    expect(line[calls[0].argClose]).toBe('}');
  });
  it('reads brace groups inside the argument whole', () => {
    expect(findIncludegraphics(String.raw`\includegraphics{{plot.v2}.png}`)[0].name).toBe('{plot.v2}.png');
  });
  it('ignores an argument that does not close on the line and lookalike commands', () => {
    expect(findIncludegraphics(String.raw`\includegraphics[width=3cm]{plot`)).toEqual([]);
    expect(findIncludegraphics(String.raw`\includegraphicsx{a} \includegraphics`)).toEqual([]);
  });
  it('reads names from the raw line when the mask blanks part of it', () => {
    const raw = String.raw`\includegraphics{a b}`;
    expect(findIncludegraphics(raw, raw)[0].name).toBe('a b');
  });
});

describe('graphicsPathsIn', () => {
  it('returns null without a declaration', () => {
    expect(graphicsPathsIn(['\\documentclass{article}'])).toBeNull();
  });
  it('parses groups with spaces and a declaration split over lines', () => {
    expect(graphicsPathsIn(['\\graphicspath{ {figures/} {./img/}', '  {other/}}'])).toEqual(['figures/', './img/', 'other/']);
  });
  it('keeps only the last declaration', () => {
    expect(graphicsPathsIn(['\\graphicspath{{a/}}', '\\graphicspath{{b/}}'])).toEqual(['b/']);
  });
});

describe('imagePaths.ts stays importable by the client', () => {
  it('has no Node imports', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'imagePaths.ts'), 'utf8');
    const imports = [...src.matchAll(/^import .* from ['"]([^'"]+)['"]/gm)].map((m) => m[1]);
    expect(imports).toEqual(['./texKnowledge.js']);
  });
});
