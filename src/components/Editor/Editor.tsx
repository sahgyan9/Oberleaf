import React, { useRef, useEffect, useState } from 'react';
import MonacoEditor, { OnMount, OnChange, BeforeMount } from '@monaco-editor/react';
import '../../utils/monacoSetup';
import { bootStep } from '../../boot';
import { useTheme } from '../../context/ThemeContext';
import { extractMathAtPosition } from '../../utils/mathDetector';
import {
  extractImageAtPosition,
  findProjectImages,
  ImageAtCursor,
  isImageFile,
  PROJECT_IMAGE_DRAG_TYPE,
  resolveProjectImage,
} from '../../utils/imageHelper';
import { figureTarget } from '../../utils/figureInsertion';
import type { ImagePickerKey } from '../Modals/ImageQuickPicker';
import { registerLatexCompletions, ProjectContext } from '../../utils/latexCompletions';
import { registerLatexLanguage } from '../../utils/latexLanguage';
import { setupMonacoCollab, CollabSessionConfig } from '../../utils/yjsCollab';
import { wrapOrToggleFormatting, BOLD_FORMAT, ITALIC_FORMAT } from '../../utils/editorFormatting';
import { useEditorMode } from '../../utils/editorMode';
import { VisualModeController } from './visualMode';
import { defineEditorThemes, editorThemeName } from '../../utils/monacoThemes';
import type { EditorDiagnostic } from '../../utils/compileDiagnostics';
import { checkLatexStructure, visibleStructureFindings, type StructureFinding } from '../../utils/latexStructure';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onCompile: () => void;
  onEquationChange: (eq: string | null, pos?: { top: number; left: number }, displayMode?: boolean) => void;
  onImageCursorChange?: (ctx: ImageAtCursor | null) => void;
  /** Keys typed while the image picker is open. Return false to let the editor handle the key. */
  onImagePickerKey?: (key: ImagePickerKey) => boolean;
  /** Filled by the editor so the host can close the picker (e.g. from a mouse click). */
  imagePickerApiRef?: React.MutableRefObject<{ dismiss: () => void } | null>;
  onDropImages?: (drop: ImageDrop) => void;
  editorRefOut?: React.MutableRefObject<any>;
  getProjectContext?: () => ProjectContext;
  onJumpToPdf?: () => void;
  highlightLine?: { line: number; timestamp: number } | null;
  commentLines?: number[];
  onOpenCommentAtCursor?: (line: number, selectedText: string) => void;
  collabSession?: CollabSessionConfig | null;
  onCursorChange?: (pos: { line: number; column: number }) => void;
  /** Errors and warnings from the last compile for this file, shown in the gutter */
  diagnostics?: EditorDiagnostic[];
  /** A gutter mark was clicked */
  onDiagnosticClick?: (line: number) => void;
  /** Check braces, environments and math delimiters while typing (a .tex file is open) */
  structureCheck?: boolean;
}

const SEVERITY_RANK: Record<EditorDiagnostic['severity'], number> = { error: 3, warning: 2, info: 1 };
const SEVERITY_LABEL: Record<EditorDiagnostic['severity'], string> = { error: 'Error', warning: 'Warning', info: 'Layout' };
// Same colours as the crimson / diagnostic tokens in tailwind.config.ts.
const RULER_COLOR: Record<EditorDiagnostic['severity'], string> = { error: '#DC2626', warning: '#D97706', info: '#94A3B8' };

// Monaco renders hovers as Markdown. TeX messages are full of characters that
// mean something there (\, `, _, *, [), so escape all of them.
const escapeMarkdown = (s: string) => s.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&');

function hoverFor(d: EditorDiagnostic): { value: string } {
  const head = `**${SEVERITY_LABEL[d.severity]}${d.secondary ? ' (follows from an earlier error)' : ''}:** ${escapeMarkdown(d.message)}`;
  return { value: d.detail ? `${head}\n\n${escapeMarkdown(d.detail)}` : head };
}

// Time after the last edit before the structure check runs, so it never
// works on the keystroke itself.
const STRUCTURE_CHECK_DELAY_MS = 300;

function structureHoverFor(d: StructureFinding): { value: string } {
  const head = `**Code check${d.severity === 'warning' ? ' (warning)' : ''}:** ${escapeMarkdown(d.message)}`;
  return { value: d.detail ? `${head}\n\n${escapeMarkdown(d.detail)}` : head };
}

/**
 * Gutter mark, scrollbar mark and a wavy underline under the exact character
 * for each structure finding. No error band: these appear while typing, and
 * a red line background there would be too loud.
 */
function structureDecorations(monaco: any, findings: StructureFinding[]): any[] {
  const byLine = new Map<number, StructureFinding[]>();
  for (const f of findings) byLine.set(f.line, [...(byLine.get(f.line) ?? []), f]);
  const stickiness = monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges;
  const out: any[] = [];
  for (const [line, items] of byLine) {
    items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || Number(!!a.secondary) - Number(!!b.secondary));
    const top = items[0];
    const allSecondary = items.every((d) => d.secondary);
    out.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        stickiness,
        // Below a compile mark on the same line: Monaco draws one glyph per
        // line and z-index, so the clickable compile mark wins. The hover
        // still lists both.
        zIndex: -1,
        glyphMarginClassName: `oberleaf-glyph oberleaf-glyph-${top.severity} is-live${allSecondary ? ' is-secondary' : ''}`,
        glyphMarginHoverMessage: items.map(structureHoverFor),
        overviewRuler: { color: RULER_COLOR[top.severity], position: monaco.editor.OverviewRulerLane.Left },
      },
    });
    for (const d of items) {
      out.push({
        range: new monaco.Range(line, d.column, line, d.endColumn),
        options: {
          stickiness,
          inlineClassName: `oberleaf-underline-${d.severity}${d.secondary ? ' is-secondary' : ''}`,
          hoverMessage: structureHoverFor(d),
        },
      });
    }
  }
  return out;
}

export interface ImageDrop {
  /** Files from the OS or clipboard. Not yet filtered to images. */
  files: File[];
  /** An image already in the project, dragged from the file tree. */
  projectPath?: string;
  position: { lineNumber: number; column: number };
}

// Module-level cache to restore cursor & scroll when editor unmounts/remounts across view modes
let lastEditorViewState: any = null;
// Timestamp of the last highlightLine target this editor revealed. App keeps
// the last target in state, so without this a remount (leaving PDF-only view)
// would jump back to an old SyncTeX target instead of restoring the view.
let lastRevealedHighlight = 0;

// Kept as one stable object: @monaco-editor/react re-applies `options` whenever
// its identity changes, which would undo the suggest suppression below on every render.
const EDITOR_OPTIONS = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  lineNumbers: 'on',
  lineNumbersMinChars: 3,
  // Always on, so the text does not shift sideways when a compile adds marks.
  glyphMargin: true,
  folding: true,
  showFoldingControls: 'mouseover',
  lineDecorationsWidth: 4,
  minimap: { enabled: false },
  wordWrap: 'on',
  automaticLayout: true,
  scrollBeyondLastLine: false,
  tabSize: 2,
  padding: { top: 12, bottom: 12 },
  smoothScrolling: true,
  tabCompletion: 'on',
  wordBasedSuggestions: 'currentDocument',
  quickSuggestions: {
    other: 'on',
    comments: 'off',
    strings: 'on',
  },
  suggestOnTriggerCharacters: true,
  suggest: {
    preview: true,
    previewMode: 'subwordSmart',
    showWords: true,
    insertMode: 'replace',
  },
  inlineSuggest: {
    enabled: true,
    mode: 'subwordSmart',
  },
} as const;

// What Visual mode changes, restored when switching back to Code.
const CODE_MODE_OPTIONS = {
  fontFamily: EDITOR_OPTIONS.fontFamily,
  fontSize: EDITOR_OPTIONS.fontSize,
  wrappingStrategy: 'simple',
  disableMonospaceOptimizations: false,
} as const;

// While the picker is open it is the only completion UI for the image path.
// Monaco falls back to word suggestions when a provider returns nothing, so
// the built-in widget has to be switched off rather than just left empty.
const PICKER_SUPPRESSED_OPTIONS = {
  quickSuggestions: false,
  suggestOnTriggerCharacters: false,
  wordBasedSuggestions: 'off',
  inlineSuggest: { enabled: false },
} as const;

const PICKER_RESTORED_OPTIONS = {
  quickSuggestions: EDITOR_OPTIONS.quickSuggestions,
  suggestOnTriggerCharacters: EDITOR_OPTIONS.suggestOnTriggerCharacters,
  wordBasedSuggestions: EDITOR_OPTIONS.wordBasedSuggestions,
  inlineSuggest: EDITOR_OPTIONS.inlineSuggest,
};

const PICKER_HEIGHT_ESTIMATE = 320;
const PICKER_WIDTH = 480;

function isFileDrag(dt: DataTransfer | null): boolean {
  return !!dt && (dt.types.includes('Files') || dt.types.includes(PROJECT_IMAGE_DRAG_TYPE));
}

export const Editor: React.FC<EditorProps> = ({
  content,
  onChange,
  onCompile,
  onEquationChange,
  onImageCursorChange,
  onImagePickerKey,
  imagePickerApiRef,
  onDropImages,
  editorRefOut,
  getProjectContext,
  onJumpToPdf,
  highlightLine,
  commentLines,
  onOpenCommentAtCursor,
  collabSession,
  onCursorChange,
  diagnostics,
  onDiagnosticClick,
  structureCheck = false,
}) => {
  const { theme } = useTheme();
  const editorInstance = useRef<any>(null);
  const monacoInstance = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const commentDecorationsRef = useRef<string[]>([]);
  const diagnosticDecorationsRef = useRef<string[]>([]);
  // The live structure check's own set: a compile replacing its marks never
  // removes these, and the reverse.
  const structureDecorationsRef = useRef<string[]>([]);
  const diagnosticOriginRef = useRef<Map<string, number>>(new Map());
  const onDiagnosticClickRef = useRef(onDiagnosticClick);
  // Bumped once Monaco has mounted, so the diagnostics effect runs again for
  // marks that arrived before the editor did.
  const [editorReady, setEditorReady] = useState(0);

  const onCompileRef = useRef(onCompile);
  const onJumpToPdfRef = useRef(onJumpToPdf);
  const onEquationChangeRef = useRef(onEquationChange);
  const onImageCursorChangeRef = useRef(onImageCursorChange);
  const onImagePickerKeyRef = useRef(onImagePickerKey);
  const onDropImagesRef = useRef(onDropImages);
  const getProjectContextRef = useRef(getProjectContext);
  const onOpenCommentAtCursorRef = useRef(onOpenCommentAtCursor);
  const onCursorChangeRef = useRef(onCursorChange);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropDecorationsRef = useRef<string[]>([]);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const editorMode = useEditorMode();
  const editorModeRef = useRef(editorMode);
  const visualModeRef = useRef<VisualModeController | null>(null);

  // Visual mode only adds view decorations; the model, undo stack and Yjs binding stay as they are.
  const ensureVisualMode = () => {
    if (visualModeRef.current || !editorInstance.current || !monacoInstance.current) return;
    visualModeRef.current = new VisualModeController(
      editorInstance.current,
      monacoInstance.current,
      () => getProjectContextRef.current?.(),
      CODE_MODE_OPTIONS as any
    );
    visualModeRef.current.setEnabled(editorModeRef.current === 'visual');
  };

  useEffect(() => {
    editorModeRef.current = editorMode;
    visualModeRef.current?.setEnabled(editorMode === 'visual');
  }, [editorMode]);

  useEffect(() => {
    // Also runs again after React's development-mode remount check, which keeps the Monaco instance.
    ensureVisualMode();
    return () => {
      visualModeRef.current?.dispose();
      visualModeRef.current = null;
    };
  }, []);

  useEffect(() => {
    onCompileRef.current = onCompile;
    onJumpToPdfRef.current = onJumpToPdf;
    onEquationChangeRef.current = onEquationChange;
    onImageCursorChangeRef.current = onImageCursorChange;
    onImagePickerKeyRef.current = onImagePickerKey;
    onDropImagesRef.current = onDropImages;
    getProjectContextRef.current = getProjectContext;
    onOpenCommentAtCursorRef.current = onOpenCommentAtCursor;
    onCursorChangeRef.current = onCursorChange;
    onDiagnosticClickRef.current = onDiagnosticClick;
  });

  // Compile diagnostics: an icon in the gutter per line (the most severe one
  // wins), the message on hovering it, a mark in the scrollbar, a faint band
  // on error lines and a wavy underline under an undefined command. They are
  // decorations, so they move with the text while the user edits and are
  // replaced by the next compile.
  useEffect(() => {
    const editor = editorInstance.current;
    const monaco = monacoInstance.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    const list = diagnostics ?? [];
    const byLine = new Map<number, EditorDiagnostic[]>();
    const lineCount = model?.getLineCount() ?? 0;
    for (const d of list) {
      if (d.line < 1 || d.line > lineCount) continue;
      byLine.set(d.line, [...(byLine.get(d.line) ?? []), d]);
    }

    const decorations: any[] = [];
    for (const [line, items] of byLine) {
      items.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || Number(!!a.secondary) - Number(!!b.secondary));
      const top = items[0];
      const allSecondary = items.every((d) => d.secondary || d.severity !== 'error') && top.secondary;
      // Not isWholeLine: with word wrap that repeats the icon on every
      // screen row of a long line. An empty range at column 1 marks only
      // the first row; the error band is a separate whole-line decoration.
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          glyphMarginClassName: `oberleaf-glyph oberleaf-glyph-${top.severity}${allSecondary ? ' is-secondary' : ''}`,
          glyphMarginHoverMessage: items.map(hoverFor),
          overviewRuler: { color: RULER_COLOR[top.severity], position: monaco.editor.OverviewRulerLane.Left },
        },
      });
      if (top.severity === 'error' && !allSecondary) {
        decorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'oberleaf-line-error',
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }
      for (const d of items) {
        if (!d.highlight || !model) continue;
        const text: string = model.getLineContent(line);
        // The command itself, not a longer one it prefixes (\foo in \foobar).
        const re = new RegExp(`${d.highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z@])`);
        const m = re.exec(text);
        if (!m) continue;
        decorations.push({
          range: new monaco.Range(line, m.index + 1, line, m.index + 1 + m[0].length),
          options: {
            inlineClassName: `oberleaf-underline-${d.severity}`,
            hoverMessage: hoverFor(d),
            stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
          },
        });
      }
    }
    const ids: string[] = editor.deltaDecorations(diagnosticDecorationsRef.current, decorations);
    diagnosticDecorationsRef.current = ids;
    // The line each gutter mark had at compile time. After edits move it, a
    // click must still open the card the compile reported.
    const origin = new Map<string, number>();
    ids.forEach((id, i) => {
      if (decorations[i].options.glyphMarginClassName) origin.set(id, decorations[i].range.startLineNumber);
    });
    diagnosticOriginRef.current = origin;
  }, [diagnostics, editorReady]);

  // Live structure check: unbalanced braces, \begin/\end, \end{document} and
  // math delimiters, marked before any compile. It runs 300 ms after the last
  // edit, off the typing path. Between runs the marks are decorations and move
  // with the text. A cursor move only re-filters: an opener the cursor is
  // still right after on its line (just typed \textbf{) stays hidden.
  useEffect(() => {
    const editor = editorInstance.current;
    const monaco = monacoInstance.current;
    if (!editor || !monaco) return;
    if (!structureCheck) {
      structureDecorationsRef.current = editor.deltaDecorations(structureDecorationsRef.current, []);
      return;
    }
    let findings: StructureFinding[] = [];
    let checkedVersion = -1;
    let shown: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const render = () => {
      const model = editor.getModel();
      // Findings for older text would land on the wrong columns.
      if (!model || model.getVersionId() !== checkedVersion) return;
      const pos = editor.getPosition();
      const visible = visibleStructureFindings(findings, pos ? { line: pos.lineNumber, column: pos.column } : null);
      const key = visible.map((f) => `${f.line}:${f.column}:${f.message}`).join('\n');
      if (key === shown) return;
      shown = key;
      structureDecorationsRef.current = editor.deltaDecorations(structureDecorationsRef.current, structureDecorations(monaco, visible));
    };
    const run = () => {
      timer = null;
      const model = editor.getModel();
      if (!model) return;
      findings = checkLatexStructure(model.getValue());
      checkedVersion = model.getVersionId();
      shown = null;
      render();
    };
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(run, STRUCTURE_CHECK_DELAY_MS);
    };

    run();
    const subscriptions = [
      editor.onDidChangeModelContent(schedule),
      editor.onDidChangeCursorPosition(render),
      editor.onDidChangeModel(run),
    ];
    return () => {
      if (timer) clearTimeout(timer);
      subscriptions.forEach((s: { dispose: () => void }) => s.dispose());
      structureDecorationsRef.current = editor.deltaDecorations(structureDecorationsRef.current, []);
    };
  }, [structureCheck, editorReady]);

  // Dynamically sync Monaco theme when user toggles light/dark mode
  useEffect(() => {
    if (monacoInstance.current) {
      monacoInstance.current.editor.setTheme(editorThemeName(theme));
    }
  }, [theme]);

  // Comment Lines Highlight
  useEffect(() => {
    if (!editorInstance.current || !monacoInstance.current) return;
    const editor = editorInstance.current;
    const monaco = monacoInstance.current;

    if (!commentLines || commentLines.length === 0) {
      commentDecorationsRef.current = editor.deltaDecorations(commentDecorationsRef.current, []);
      return;
    }

    const newDecs = commentLines.map((line) => ({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: 'comment-highlight-line',
        overviewRuler: {
          color: '#49A4BB',
          position: monaco.editor.OverviewRulerLane.Right,
        },
      },
    }));

    commentDecorationsRef.current = editor.deltaDecorations(commentDecorationsRef.current, newDecs);
  }, [commentLines]);

  // Drag an image (from the OS or the file tree) or paste a screenshot to insert a figure.
  // Capture phase, so Monaco's own drop/paste handling never sees image payloads.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const clearDropIndicator = () => {
      const editor = editorInstance.current;
      if (editor) dropDecorationsRef.current = editor.deltaDecorations(dropDecorationsRef.current, []);
      setDropHint(null);
    };

    const positionAt = (e: DragEvent) => {
      const editor = editorInstance.current;
      const model = editor?.getModel();
      if (!editor || !model) return null;
      const target = editor.getTargetAtClientPoint(e.clientX, e.clientY);
      if (target?.position) return target.position;
      // Below the last line: append at the end of the document.
      const last = model.getLineCount();
      return { lineNumber: last, column: model.getLineMaxColumn(last) };
    };

    const handleDragOver = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';

      const editor = editorInstance.current;
      const model = editor?.getModel();
      const position = positionAt(e);
      if (!editor || !model || !position) return;

      const ctx = extractImageAtPosition(model.getLineContent(position.lineNumber), position.column, position.lineNumber);
      let decoration;
      if (ctx) {
        decoration = { range: ctx.range, options: { inlineClassName: 'figure-drop-swap' } };
        setDropHint('Drop to replace this image');
      } else {
        const target = figureTarget(model, position);
        const line = target.position.lineNumber;
        decoration = {
          range: { startLineNumber: line, startColumn: 1, endLineNumber: line, endColumn: 1 },
          options: { isWholeLine: true, className: `figure-drop-${target.placement}` },
        };
        setDropHint('Drop to insert as a figure');
      }
      dropDecorationsRef.current = editor.deltaDecorations(dropDecorationsRef.current, [decoration]);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (!container.contains(e.relatedTarget as Node | null)) clearDropIndicator();
    };

    const handleDrop = (e: DragEvent) => {
      if (!isFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      const position = positionAt(e);
      clearDropIndicator();
      if (!position || !e.dataTransfer) return;
      const projectPath = e.dataTransfer.getData(PROJECT_IMAGE_DRAG_TYPE) || undefined;
      onDropImagesRef.current?.({ files: Array.from(e.dataTransfer.files), projectPath, position });
      editorInstance.current?.focus();
    };

    const handlePaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData;
      const editor = editorInstance.current;
      // Text wins: copying spreadsheet cells also puts a rendered image on the clipboard.
      if (!dt || !editor || dt.getData('text/plain')) return;
      const images = Array.from(dt.files).filter(isImageFile);
      const position = editor.getPosition();
      if (images.length === 0 || !position) return;
      e.preventDefault();
      e.stopPropagation();
      onDropImagesRef.current?.({ files: images, position });
    };

    container.addEventListener('dragover', handleDragOver, true);
    container.addEventListener('dragleave', handleDragLeave, true);
    container.addEventListener('drop', handleDrop, true);
    container.addEventListener('paste', handlePaste, true);
    return () => {
      container.removeEventListener('dragover', handleDragOver, true);
      container.removeEventListener('dragleave', handleDragLeave, true);
      container.removeEventListener('drop', handleDrop, true);
      container.removeEventListener('paste', handlePaste, true);
    };
  }, []);

  // Yjs Real-Time Collaboration
  useEffect(() => {
    if (!collabSession || !editorInstance.current || !monacoInstance.current) return;
    const cleanup = setupMonacoCollab(editorInstance.current, monacoInstance.current, collabSession);
    return cleanup;
  }, [collabSession, collabSession?.filePath]);

  // SyncTeX Jump Target: Smooth scroll and pulse line highlight
  useEffect(() => {
    if (!highlightLine || !editorInstance.current || !monacoInstance.current) return;
    const editor = editorInstance.current;
    const monaco = monacoInstance.current;
    const line = highlightLine.line;
    lastRevealedHighlight = highlightLine.timestamp;

    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();

    // Apply pulsing highlight decoration
    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      [
        {
          range: new monaco.Range(line, 1, line, 1),
          options: {
            isWholeLine: true,
            className: 'synctex-highlight-line',
          },
        },
      ]
    );

    const timer = setTimeout(() => {
      if (editorInstance.current) {
        decorationsRef.current = editorInstance.current.deltaDecorations(decorationsRef.current, []);
      }
    }, 2500);

    return () => clearTimeout(timer);
  }, [highlightLine]);

  // Save Monaco editor view state before unmount so it can be restored seamlessly
  useEffect(() => {
    return () => {
      if (editorInstance.current) {
        try {
          lastEditorViewState = editorInstance.current.saveViewState();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Pre-define themes before Monaco renders to eliminate white flash
  const handleBeforeMount: BeforeMount = (monaco) => {
    defineEditorThemes(monaco);
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    bootStep('project', 'done');
    editorInstance.current = editor;
    monacoInstance.current = monaco;
    if (editorRefOut) editorRefOut.current = editor;

    registerLatexLanguage(monaco);
    registerLatexCompletions(monaco, () =>
      getProjectContextRef.current?.() ?? { citations: [], files: [] }
    );

    // Track cursor movement for status bar telemetry
    editor.onDidChangeCursorPosition((e: any) => {
      if (e && e.position) {
        onCursorChangeRef.current?.({ line: e.position.lineNumber, column: e.position.column });
      }
    });

    // Add Keybinding: Ctrl+Enter / Cmd+Enter to compile
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onCompileRef.current();
    });

    // Clicking a compile mark in the gutter opens its card in the PDF panel.
    editor.onMouseDown((e: any) => {
      if (e.target?.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const line = e.target.position?.lineNumber;
      if (!line) return;
      const hit = (editor.getModel()?.getLineDecorations(line) ?? []).find((d: any) => diagnosticOriginRef.current.has(d.id));
      if (hit) onDiagnosticClickRef.current?.(diagnosticOriginRef.current.get(hit.id)!);
    });
    setEditorReady((n) => n + 1);

    // Add Keybinding: Ctrl+Alt+J to Jump to PDF location (SyncTeX Forward)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyJ, () => {
      onJumpToPdfRef.current?.();
    });

    // Add Keybinding & Context Menu: Ctrl+B / Cmd+B for Bold (\textbf)
    editor.addAction({
      id: 'latex-bold',
      label: 'Bold (\\textbf)',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.1,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB],
      run: (ed: any) => {
        wrapOrToggleFormatting(ed, BOLD_FORMAT);
      },
    });

    // Add Keybinding & Context Menu: Ctrl+I / Cmd+I for Italic (\textit)
    editor.addAction({
      id: 'latex-italic',
      label: 'Italic (\\textit)',
      contextMenuGroupId: '1_modification',
      contextMenuOrder: 1.2,
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI],
      run: (ed: any) => {
        wrapOrToggleFormatting(ed, ITALIC_FORMAT);
      },
    });

    // Add Keybinding & Context Menu: Alt+M to Add Review Comment
    editor.addAction({
      id: 'add-review-comment',
      label: 'Add Review Comment (Alt+M)',
      contextMenuGroupId: 'navigation',
      contextMenuOrder: 1.5,
      keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.KeyM],
      run: (ed: any) => {
        const selection = ed.getSelection();
        const model = ed.getModel();
        const selectedText = model && selection ? model.getValueInRange(selection) : '';
        const line = selection ? selection.startLineNumber : ed.getPosition()?.lineNumber || 1;
        onOpenCommentAtCursorRef.current?.(line, selectedText);
      },
    });

    // Immediate positioning: if a target line was requested (e.g. view mode switch to split mode)
    // reveal it immediately on mount. Otherwise restore the cached editor view state.
    if (highlightLine?.line && highlightLine.timestamp !== lastRevealedHighlight) {
      const line = highlightLine.line;
      lastRevealedHighlight = highlightLine.timestamp;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      decorationsRef.current = editor.deltaDecorations(
        [],
        [
          {
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: 'synctex-highlight-line',
            },
          },
        ]
      );
      setTimeout(() => {
        if (editorInstance.current) {
          decorationsRef.current = editorInstance.current.deltaDecorations(decorationsRef.current, []);
        }
      }, 2500);
    } else if (lastEditorViewState) {
      try {
        editor.restoreViewState(lastEditorViewState);
      } catch {
        // ignore
      }
    }

    // Detect cursor math context accurately and clamp preview within editor panel
    const updateMathPreview = (pos?: any) => {
      const model = editor.getModel();
      if (!model) return;

      const position = pos || editor.getPosition();
      if (!position) return;

      const text = model.getValue();
      const offset = model.getOffsetAt(position);

      const mathCtx = extractMathAtPosition(text, offset);

      if (mathCtx) {
        const coords = editor.getScrolledVisiblePosition(position);
        const domNode = editor.getDomNode();
        if (coords && domNode) {
          const editorRect = domNode.getBoundingClientRect();
          const cursorScreenX = editorRect.left + coords.left;
          const cursorScreenY = editorRect.top + coords.top;
          const cardWidth = 380;

          // Clamp horizontally inside the editor panel so preview never bleeds into PDF pane
          const minLeft = editorRect.left + 16;
          const maxLeft = Math.max(minLeft, editorRect.right - cardWidth - 16);
          const safeLeft = Math.min(Math.max(cursorScreenX, minLeft), maxLeft);

          // Position below the line by default, or flip above if near bottom of editor
          const lineHeight = coords.height || 22;
          const previewHeightEst = 130;
          let safeTop = cursorScreenY + lineHeight + 8;
          if (safeTop + previewHeightEst > editorRect.bottom - 16) {
            const aboveTop = cursorScreenY - previewHeightEst - 8;
            if (aboveTop >= editorRect.top + 8) {
              safeTop = aboveTop;
            }
          }

          onEquationChangeRef.current(
            mathCtx.math,
            {
              top: safeTop,
              left: safeLeft,
            },
            mathCtx.displayMode
          );
          return;
        }
      }

      onEquationChangeRef.current(null);
    };

    // Image picker for the path inside \includegraphics{...}.
    // It opens when there is a path to choose: typing in the braces, landing in
    // empty braces (the \begin{figure} snippet), or a path that matches no file.
    // Walking the caret through a path that already resolves is just navigation.
    const PICKER_OPEN = 'oberleafImagePickerOpen';
    const IN_IMAGE_PATH = 'oberleafInImagePath';
    const pickerOpenKey = editor.createContextKey<boolean>(PICKER_OPEN, false);
    const inImagePathKey = editor.createContextKey<boolean>(IN_IMAGE_PATH, false);
    let pickerBraceKey: string | null = null; // which \includegraphics{} the open picker belongs to
    let dismissedBraceKey: string | null = null; // Esc'd here: stay closed until the caret leaves

    const closeImagePicker = (dismiss: boolean) => {
      if (pickerBraceKey === null) return;
      if (dismiss) dismissedBraceKey = pickerBraceKey;
      pickerBraceKey = null;
      pickerOpenKey.set(false);
      editor.updateOptions(PICKER_RESTORED_OPTIONS);
      onImageCursorChangeRef.current?.(null);
    };

    const pickerCoordinates = (position: any): { top: number; left: number } | null => {
      const coords = editor.getScrolledVisiblePosition(position);
      const domNode = editor.getDomNode();
      if (!coords || !domNode) return null;
      const rect = domNode.getBoundingClientRect();
      const caretY = rect.top + coords.top;
      if (caretY < rect.top || caretY > rect.bottom) return null; // scrolled out of view

      const minLeft = rect.left + 16;
      const maxLeft = Math.max(minLeft, rect.right - PICKER_WIDTH - 16);
      const left = Math.min(Math.max(rect.left + coords.left, minLeft), maxLeft);

      const lineHeight = coords.height || 22;
      let top = caretY + lineHeight + 6;
      if (top + PICKER_HEIGHT_ESTIMATE > rect.bottom - 8) {
        const above = caretY - PICKER_HEIGHT_ESTIMATE - 6;
        if (above >= rect.top + 4) top = above;
      }
      return { top, left };
    };

    const updateImagePicker = (reason: 'cursor' | 'content' | 'scroll' | 'explicit') => {
      const model = editor.getModel();
      const position = editor.getPosition();
      if (!model || !position || !onImageCursorChangeRef.current) return;
      if (reason === 'scroll' && pickerBraceKey === null) return;

      const ctx = extractImageAtPosition(model.getLineContent(position.lineNumber), position.column, position.lineNumber);
      inImagePathKey.set(!!ctx);
      if (!ctx) {
        dismissedBraceKey = null;
        closeImagePicker(false);
        return;
      }

      const braceKey = `${ctx.range.startLineNumber}:${ctx.range.startColumn}`;
      if (reason === 'explicit') dismissedBraceKey = null;
      if (braceKey === dismissedBraceKey) return;

      const alreadyOpen = pickerBraceKey === braceKey;
      if (!alreadyOpen && reason === 'cursor' && ctx.currentPath.trim()) {
        const images = findProjectImages(getProjectContextRef.current?.().files ?? []);
        if (resolveProjectImage(images, ctx.currentPath)) {
          closeImagePicker(false);
          return;
        }
      }

      const coords = pickerCoordinates(position);
      if (!coords) {
        closeImagePicker(false);
        return;
      }
      if (!alreadyOpen) {
        if (pickerBraceKey !== null) closeImagePicker(false);
        pickerBraceKey = braceKey;
        pickerOpenKey.set(true);
        editor.updateOptions(PICKER_SUPPRESSED_OPTIONS);
        editor.trigger('image-picker', 'hideSuggestWidget', null);
      }
      onImageCursorChangeRef.current({ ...ctx, position: coords });
    };

    if (imagePickerApiRef) {
      imagePickerApiRef.current = { dismiss: () => closeImagePicker(true) };
    }

    // Keys typed while the picker is open go to the picker first. Dynamic
    // keybindings registered here take precedence over snippet/suggest ones.
    const pickerKey = (key: ImagePickerKey, fallback: () => void) => () => {
      if (!onImagePickerKeyRef.current?.(key)) fallback();
    };
    editor.addCommand(monaco.KeyCode.DownArrow, pickerKey('down', () => editor.trigger('keyboard', 'cursorDown', null)), PICKER_OPEN);
    editor.addCommand(monaco.KeyCode.UpArrow, pickerKey('up', () => editor.trigger('keyboard', 'cursorUp', null)), PICKER_OPEN);
    editor.addCommand(monaco.KeyCode.Enter, pickerKey('accept', () => closeImagePicker(true)), PICKER_OPEN);
    editor.addCommand(
      monaco.KeyCode.Tab,
      pickerKey('accept', () => {
        closeImagePicker(true);
        const snippets: any = editor.getContribution('snippetController2');
        if (snippets?.isInSnippet()) snippets.next();
      }),
      PICKER_OPEN
    );
    editor.addCommand(monaco.KeyCode.Escape, () => closeImagePicker(true), PICKER_OPEN);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => updateImagePicker('explicit'), IN_IMAGE_PATH);

    editor.onDidChangeCursorPosition((e) => {
      updateMathPreview(e.position);
      updateImagePicker('cursor');
    });

    editor.onDidChangeModelContent(() => {
      updateMathPreview();
      updateImagePicker('content');
    });

    editor.onDidScrollChange(() => updateImagePicker('scroll'));
    editor.onDidBlurEditorText(() => closeImagePicker(false));

    // Run preview checks once mounted
    updateMathPreview();
    updateImagePicker('cursor');

    visualModeRef.current?.dispose();
    visualModeRef.current = null;
    ensureVisualMode();
  };

  const handleEditorChange: OnChange = (value) => {
    onChange(value || '');
  };

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-surface-lightPanel dark:bg-surface-darkPanel">
      <MonacoEditor
        height="100%"
        defaultLanguage="latex"
        language="latex"
        theme={editorThemeName(theme)}
        beforeMount={handleBeforeMount}
        value={content}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={EDITOR_OPTIONS as any}
      />
      {dropHint && (
        <div className="pointer-events-none absolute top-3 right-4 z-10 px-2.5 py-1 rounded-md border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel text-xs font-medium text-stone-700 dark:text-stone-200 shadow-sm">
          {dropHint}
        </div>
      )}
    </div>
  );
};
