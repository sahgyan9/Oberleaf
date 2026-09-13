import type { SuggestedFix } from '../components/PDFViewer/PDFViewer';

/**
 * The smallest single span that turns `before` into `after`: a shared prefix
 * and suffix are left alone and only the middle is replaced. Applying fixes as
 * this span instead of replacing the whole buffer keeps the editor's own undo
 * stack (Ctrl+Z) working, keeps the cursor and scroll position of untouched
 * text, and sends collaborators a small delta rather than the whole document.
 */
export function minimalReplacement(
  before: string,
  after: string
): { start: number; endBefore: number; text: string } | null {
  if (before === after) return null;

  let start = 0;
  const maxPrefix = Math.min(before.length, after.length);
  while (start < maxPrefix && before.charCodeAt(start) === after.charCodeAt(start)) start++;

  let endBefore = before.length;
  let endAfter = after.length;
  while (
    endBefore > start &&
    endAfter > start &&
    before.charCodeAt(endBefore - 1) === after.charCodeAt(endAfter - 1)
  ) {
    endBefore--;
    endAfter--;
  }

  return { start, endBefore, text: after.slice(start, endAfter) };
}

const MAGIC_ENGINE_LINE = /^\s*%\s*!\s*TEX\s+(?:TS-)?program\s*=.*$/im;

/** Sets the "% !TEX program = <engine>" comment, replacing an existing one. */
export function setMagicEngine(content: string, engine: string): string {
  const line = `% !TEX program = ${engine}`;
  if (MAGIC_ENGINE_LINE.test(content)) return content.replace(MAGIC_ENGINE_LINE, line);
  return `${line}\n${content}`;
}

export interface PreviewLine {
  kind: 'add' | 'remove' | 'note';
  text: string;
}

export interface FixPreview {
  /** Where the change lands, in words: "Line 12", "Preamble" */
  location: string;
  lines: PreviewLine[];
  /** Whether Undo can put the document back exactly */
  undoable: boolean;
  /** Button text: the verb that will happen, not a generic "Apply" */
  actionLabel: string;
}

/**
 * What the user sees before clicking. Norman's gulf of execution is widest for
 * automatic fixes: the button promises a result the user cannot inspect. The
 * preview closes it by showing the exact lines that will change.
 */
export function buildFixPreview(fix: SuggestedFix): FixPreview {
  switch (fix.type) {
    case 'add_preamble':
      return {
        location: fix.packageName === 'hyperref' ? 'Preamble, before \\begin{document}' : 'Preamble',
        lines: [{ kind: 'add', text: fix.codeSnippet }],
        undoable: true,
        actionLabel: 'Add to preamble',
      };

    case 'replace_line': {
      const lines: PreviewLine[] = [];
      if (fix.find !== undefined) lines.push({ kind: 'remove', text: fix.find.trim() || ' ' });
      if (fix.replace) lines.push({ kind: 'add', text: fix.replace.trim() || ' ' });
      return {
        location: fix.line ? `Line ${fix.line}` : 'Source',
        lines,
        undoable: true,
        actionLabel: fix.replace ? 'Replace line' : 'Delete line',
      };
    }

    case 'wrap_math_mode':
      return {
        location: fix.line ? `Around line ${fix.line}` : 'Source',
        lines: [
          { kind: 'add', text: '\\[' },
          { kind: 'note', text: `\\begin{${fix.targetEnvironment}} ... \\end{${fix.targetEnvironment}}` },
          { kind: 'add', text: '\\]' },
        ],
        undoable: true,
        actionLabel: 'Wrap in math mode',
      };

    case 'set_engine':
      return {
        location: 'Line 1',
        lines: [{ kind: 'add', text: fix.codeSnippet }],
        undoable: true,
        actionLabel: `Switch to ${fix.engine === 'lualatex' ? 'LuaLaTeX' : 'XeLaTeX'}`,
      };

    case 'install_package':
      return {
        location: 'TeX distribution',
        lines: [
          { kind: 'note', text: `Installs "${fix.packageName}" with your TeX package manager. The document is not edited.` },
        ],
        undoable: false,
        actionLabel: 'Install package',
      };

    case 'open_doctor':
      return {
        location: 'TeX installation',
        lines: [{ kind: 'note', text: 'The fix is in the TeX installation, not the document.' }],
        undoable: false,
        actionLabel: 'Open TeX Doctor',
      };
  }
}
