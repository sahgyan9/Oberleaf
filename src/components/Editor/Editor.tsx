import React, { useRef, useEffect, useState } from 'react';
import MonacoEditor, { OnMount, OnChange, BeforeMount } from '@monaco-editor/react';
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

// Kept as one stable object: @monaco-editor/react re-applies `options` whenever
// its identity changes, which would undo the suggest suppression below on every render.
const EDITOR_OPTIONS = {
  fontSize: 14,
  fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, monospace",
  lineNumbers: 'on',
  lineNumbersMinChars: 3,
  glyphMargin: false,
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
}) => {
  const { theme } = useTheme();
  const editorInstance = useRef<any>(null);
  const monacoInstance = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);
  const commentDecorationsRef = useRef<string[]>([]);

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
  });

  // Dynamically sync Monaco theme when user toggles light/dark mode
  useEffect(() => {
    if (monacoInstance.current) {
      monacoInstance.current.editor.setTheme(theme === 'dark' ? 'scholarlyDark' : 'scholarlyLight');
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
    // Define Scholarly Dark Theme
    monaco.editor.defineTheme('scholarlyDark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '2EA043', fontStyle: 'bold' },
        { token: 'keyword.control', foreground: '38BDF8', fontStyle: 'bold' },
        { token: 'tag', foreground: '2EA043' },
        { token: 'type', foreground: '34C759', fontStyle: 'bold' },
        { token: 'string.escape', foreground: 'F59E0B' },
        { token: 'delimiter', foreground: 'A8A29E' },
        { token: 'operator', foreground: '2EA043' },
        { token: 'number', foreground: '38BDF8' },
        { token: 'comment', foreground: '78716C', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#1C1C1F',
        'editor.foreground': '#F5F5F4',
        'editorCursor.foreground': '#2EA043',
        'editor.lineHighlightBackground': '#26262B80',
        'editorLineNumber.foreground': '#78716C',
        'editorLineNumber.activeForeground': '#F5F5F4',
        'editorGutter.background': '#1C1C1F',
      },
    });

    // Define Scholarly Light Paper Theme
    monaco.editor.defineTheme('scholarlyLight', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '1B5E20', fontStyle: 'bold' },
        { token: 'keyword.control', foreground: '2563EB', fontStyle: 'bold' },
        { token: 'tag', foreground: '1B5E20' },
        { token: 'type', foreground: '164E1B', fontStyle: 'bold' },
        { token: 'string.escape', foreground: 'D97706' },
        { token: 'delimiter', foreground: '57534E' },
        { token: 'operator', foreground: '1B5E20' },
        { token: 'number', foreground: '2563EB' },
        { token: 'comment', foreground: 'A8A29E', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#FBFBFA',
        'editor.foreground': '#1C1917',
        'editorCursor.foreground': '#1B5E20',
        'editor.lineHighlightBackground': '#F4F3EF90',
        'editorLineNumber.foreground': '#A8A29E',
        'editorLineNumber.activeForeground': '#1C1917',
        'editorGutter.background': '#FBFBFA',
      },
    });
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
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
    if (highlightLine?.line) {
      const line = highlightLine.line;
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
        theme={theme === 'dark' ? 'scholarlyDark' : 'scholarlyLight'}
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
