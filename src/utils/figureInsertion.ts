import type * as Monaco from 'monaco-editor';
import { extractImageAtPosition, figureLabelFromPath, ImageAtCursor } from './imageHelper';

type CodeEditor = Monaco.editor.ICodeEditor;
type Position = { lineNumber: number; column: number };

export interface FigureOptions {
  width?: string;
  placement?: string;
  caption?: string;
  label?: string;
}

/** Where a figure block lands relative to the line under the drop point / caret. */
export type FigurePlacement = 'at' | 'before' | 'after';

// Text the \begin{figure} snippet and older templates leave behind. A caption
// or label still holding one of these has never been written by the user.
const PLACEHOLDER_CAPTIONS = new Set(['', 'caption', 'caption text', 'my figure caption']);
const PLACEHOLDER_LABELS = new Set(['', 'fig:', 'fig:label', 'fig:my_figure']);
const FIGURE_ENVS = 'figure\\*?|wrapfigure|subfigure';

interface SnippetController {
  insert(template: string, opts?: Record<string, unknown>): void;
  isInSnippet(): boolean;
  cancel(resetSelection?: boolean): void;
}

function snippetController(editor: CodeEditor): SnippetController | null {
  return (editor.getContribution('snippetController2') as unknown as SnippetController) ?? null;
}

function escapeSnippet(text: string): string {
  return text.replace(/[\\$}]/g, '\\$&');
}

function stripComments(text: string): string {
  return text.replace(/(^|[^\\])%.*$/gm, '$1');
}

const DOCUMENTCLASS_RE = /\\documentclass\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/;

/**
 * True when this buffer is a root document that would fail on \includegraphics
 * because graphicx is never loaded. Chapter files without \documentclass are
 * left alone: their preamble lives in another file.
 */
export function needsGraphicx(text: string): boolean {
  const code = stripComments(text);
  const dc = DOCUMENTCLASS_RE.exec(code);
  if (!dc || /beamer/.test(dc[1])) return false;
  return !/\\(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\bgraphicx\b[^}]*\}/.test(code);
}

/** Inserts \usepackage{graphicx} after \documentclass. Returns the new line number, or null. */
function ensureGraphicx(editor: CodeEditor): number | null {
  const model = editor.getModel();
  if (!model || !needsGraphicx(model.getValue())) return null;

  // Locate \documentclass in the raw text (offsets must match the model).
  const dc = DOCUMENTCLASS_RE.exec(model.getValue());
  if (!dc) return null;
  const end = model.getPositionAt(dc.index + dc[0].length);
  const eol = model.getLineMaxColumn(end.lineNumber);

  editor.executeEdits('insert-figure', [
    {
      range: { startLineNumber: end.lineNumber, startColumn: eol, endLineNumber: end.lineNumber, endColumn: eol },
      text: `${model.getEOL()}\\usepackage{graphicx}`,
    },
  ]);
  return end.lineNumber + 1;
}

/**
 * A figure is a block, so it never splits a line of prose: an empty line takes
 * it in place, a caret at the start of text puts it above, anywhere else below.
 */
export function figureTarget(
  model: Monaco.editor.ITextModel,
  position: Position
): { position: Position; placement: FigurePlacement } {
  // Floats cannot nest: a caret inside a figure means "after this figure".
  const surrounding = enclosingFigure(model, position.lineNumber);
  if (surrounding) {
    return {
      position: { lineNumber: surrounding.end, column: model.getLineMaxColumn(surrounding.end) },
      placement: 'after',
    };
  }
  const line = model.getLineContent(position.lineNumber);
  if (!line.trim()) return { position, placement: 'at' };
  const firstNonWs = line.search(/\S/) + 1;
  return { position, placement: position.column <= firstNonWs ? 'before' : 'after' };
}

function uniqueLabel(text: string, wanted: string, taken: Set<string>): string {
  let label = wanted;
  for (let n = 2; taken.has(label) || text.includes(`\\label{${label}}`); n++) {
    label = `${wanted}-${n}`;
  }
  taken.add(label);
  return label;
}

function figureBlock(path: string, label: string, captionStop: number, opts: FigureOptions, eol: string): string {
  const caption = opts.caption ? `\${${captionStop}:${escapeSnippet(opts.caption)}}` : `\${${captionStop}}`;
  return [
    `\\begin{figure}[${escapeSnippet(opts.placement || 'htbp')}]`,
    '\t\\centering',
    `\t\\includegraphics[width=${escapeSnippet(opts.width || '0.8\\linewidth')}]{${escapeSnippet(path)}}`,
    `\t\\caption{${caption}}`,
    `\t\\label{${escapeSnippet(label)}}`,
    '\\end{figure}',
  ].join(eol);
}

/**
 * Insert one complete figure environment per image at `position`, with the
 * caret waiting in the first caption. Tab walks through the remaining captions.
 */
export function insertFigures(
  editor: CodeEditor,
  paths: string[],
  position: Position,
  opts: FigureOptions = {}
): { addedGraphicx: boolean } {
  const model = editor.getModel();
  if (!model || paths.length === 0) return { addedGraphicx: false };

  editor.pushUndoStop();
  const graphicxLine = ensureGraphicx(editor);
  let at = { ...position };
  if (graphicxLine !== null && at.lineNumber >= graphicxLine) {
    at = { ...at, lineNumber: at.lineNumber + 1 };
  }
  const target = figureTarget(model, at);
  at = target.position;

  const eol = model.getEOL();
  const text = model.getValue();
  const taken = new Set<string>();
  const blocks = paths.map((raw, i) => {
    const path = raw.replace(/\\/g, '/');
    const label = opts.label && paths.length === 1 ? opts.label : uniqueLabel(text, figureLabelFromPath(path), taken);
    return figureBlock(path, label, i + 1, opts, eol);
  });
  const body = blocks.join(eol + eol) + '$0';

  const placement = target.placement;
  let insertAt: Position;
  let template: string;
  if (placement === 'at') {
    insertAt = { lineNumber: at.lineNumber, column: model.getLineMaxColumn(at.lineNumber) };
    template = body;
  } else if (placement === 'before') {
    insertAt = { lineNumber: at.lineNumber, column: 1 };
    template = body + eol;
  } else {
    insertAt = { lineNumber: at.lineNumber, column: model.getLineMaxColumn(at.lineNumber) };
    template = eol + body;
  }

  editor.setSelection({
    startLineNumber: insertAt.lineNumber,
    startColumn: insertAt.column,
    endLineNumber: insertAt.lineNumber,
    endColumn: insertAt.column,
  });

  const snippets = snippetController(editor);
  if (snippets) {
    snippets.insert(template, { undoStopBefore: false, undoStopAfter: true, adjustWhitespace: true });
  } else {
    const plain = template.replace(/\$\{\d+:?([^}]*)\}|\$0/g, '$1').replace(/\\([\\$}])/g, '$1');
    editor.executeEdits('insert-figure', [
      {
        range: { startLineNumber: insertAt.lineNumber, startColumn: insertAt.column, endLineNumber: insertAt.lineNumber, endColumn: insertAt.column },
        text: plain,
        forceMoveMarkers: true,
      },
    ]);
    editor.pushUndoStop();
  }

  const caret = editor.getPosition();
  if (caret) editor.revealPositionInCenterIfOutsideViewport(caret);
  editor.focus();
  return { addedGraphicx: graphicxLine !== null };
}

/** Finds the figure environment enclosing `line`, if any, within a sane window. */
function enclosingFigure(model: Monaco.editor.ITextModel, line: number): { start: number; end: number } | null {
  const begin = new RegExp(`\\\\begin\\{(?:${FIGURE_ENVS})\\}`);
  const finish = new RegExp(`\\\\end\\{(?:${FIGURE_ENVS})\\}`);
  let start = -1;
  for (let l = line; l >= Math.max(1, line - 25); l--) {
    const text = model.getLineContent(l);
    if (l !== line && finish.test(text)) return null;
    if (begin.test(text)) {
      start = l;
      break;
    }
  }
  if (start === -1) return null;
  for (let l = line; l <= Math.min(model.getLineCount(), line + 25); l++) {
    if (finish.test(model.getLineContent(l))) return { start, end: l };
  }
  return null;
}

function findArgument(
  model: Monaco.editor.ITextModel,
  span: { start: number; end: number },
  pattern: RegExp
): { line: number; startColumn: number; endColumn: number; value: string } | null {
  for (let l = span.start; l <= span.end; l++) {
    const text = model.getLineContent(l);
    const m = pattern.exec(text);
    if (m) {
      const startColumn = m.index + m[0].length - m[1].length; // 1-based column of first char inside {}
      return { line: l, startColumn, endColumn: startColumn + m[1].length, value: m[1] };
    }
  }
  return null;
}

/**
 * Fill an \includegraphics path chosen from the picker. Inside a figure whose
 * label and caption are still untouched, the label is derived from the file
 * name and the caret moves to the caption — the next thing the user must write.
 */
export function applyImagePick(
  editor: CodeEditor,
  context: ImageAtCursor,
  relativePath: string
): { applied: boolean; addedGraphicx: boolean } {
  const model = editor.getModel();
  const none = { applied: false, addedGraphicx: false };
  if (!model) return none;

  // The context may be stale (e.g. after an upload round-trip): re-read the line.
  const lineNumber = context.range.startLineNumber;
  if (lineNumber > model.getLineCount()) return none;
  const fresh = extractImageAtPosition(model.getLineContent(lineNumber), context.range.startColumn, lineNumber);
  if (!fresh) return none;

  const path = relativePath.replace(/\\/g, '/');
  const snippets = snippetController(editor);
  if (snippets?.isInSnippet()) snippets.cancel();

  const edits: Monaco.editor.IIdentifiedSingleEditOperation[] = [
    { range: fresh.range, text: fresh.hasClosingBrace ? path : `${path}}`, forceMoveMarkers: true },
  ];

  const figure = enclosingFigure(model, lineNumber);
  if (figure) {
    const label = findArgument(model, figure, /\\label\{([^}]*)\}/);
    if (label && label.line !== lineNumber && PLACEHOLDER_LABELS.has(label.value.trim().toLowerCase())) {
      edits.push({
        range: { startLineNumber: label.line, startColumn: label.startColumn, endLineNumber: label.line, endColumn: label.endColumn },
        text: uniqueLabel(model.getValue(), figureLabelFromPath(path), new Set()),
      });
    }
  }

  editor.pushUndoStop();
  editor.executeEdits('image-picker', edits);

  // Edits above never add or remove lines, so line numbers are still valid.
  const caption = figure ? findArgument(model, figure, /\\caption(?:\[[^\]]*\])?\{([^}]*)\}/) : null;
  if (caption && PLACEHOLDER_CAPTIONS.has(caption.value.trim().toLowerCase())) {
    editor.setSelection({
      startLineNumber: caption.line,
      startColumn: caption.startColumn,
      endLineNumber: caption.line,
      endColumn: caption.endColumn,
    });
  } else {
    const column = fresh.range.startColumn + path.length + 1;
    editor.setPosition({ lineNumber, column });
  }

  // Last, so the line it adds above only shifts the caret Monaco already placed.
  const addedGraphicx = ensureGraphicx(editor) !== null;
  editor.pushUndoStop();

  const caret = editor.getPosition();
  if (caret) editor.revealPositionInCenterIfOutsideViewport(caret);
  editor.focus();
  return { applied: true, addedGraphicx };
}

/** Drop or paste target: swap the path when aimed at \includegraphics{...}, else add figures. */
export function placeImagesAt(editor: CodeEditor, paths: string[], position: Position): { addedGraphicx: boolean } {
  const model = editor.getModel();
  if (!model || paths.length === 0) return { addedGraphicx: false };
  const ctx = extractImageAtPosition(model.getLineContent(position.lineNumber), position.column, position.lineNumber);
  if (ctx && paths.length === 1) {
    return { addedGraphicx: applyImagePick(editor, ctx, paths[0]).addedGraphicx };
  }
  return insertFigures(editor, paths, position);
}
