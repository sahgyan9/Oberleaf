import React, { useRef, useEffect } from 'react';
import MonacoEditor, { OnMount, OnChange, BeforeMount } from '@monaco-editor/react';
import { useTheme } from '../../context/ThemeContext';
import { extractMathAtPosition } from '../../utils/mathDetector';
import { registerLatexCompletions, ProjectContext } from '../../utils/latexCompletions';
import { registerLatexLanguage } from '../../utils/latexLanguage';
import { setupMonacoCollab, CollabSessionConfig } from '../../utils/yjsCollab';
import { wrapOrToggleFormatting, BOLD_FORMAT, ITALIC_FORMAT } from '../../utils/editorFormatting';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onCompile: () => void;
  onEquationChange: (eq: string | null, pos?: { top: number; left: number }, displayMode?: boolean) => void;
  editorRefOut?: React.MutableRefObject<any>;
  getProjectContext?: () => ProjectContext;
  onJumpToPdf?: () => void;
  highlightLine?: { line: number; timestamp: number } | null;
  commentLines?: number[];
  onOpenCommentAtCursor?: (line: number, selectedText: string) => void;
  collabSession?: CollabSessionConfig | null;
  onCursorChange?: (pos: { line: number; column: number }) => void;
}

// Module-level cache to restore cursor & scroll when editor unmounts/remounts across view modes
let lastEditorViewState: any = null;

export const Editor: React.FC<EditorProps> = ({
  content,
  onChange,
  onCompile,
  onEquationChange,
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
  const getProjectContextRef = useRef(getProjectContext);
  const onOpenCommentAtCursorRef = useRef(onOpenCommentAtCursor);
  const onCursorChangeRef = useRef(onCursorChange);

  useEffect(() => {
    onCompileRef.current = onCompile;
    onJumpToPdfRef.current = onJumpToPdf;
    onEquationChangeRef.current = onEquationChange;
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

    editor.onDidChangeCursorPosition((e) => {
      updateMathPreview(e.position);
    });

    editor.onDidChangeModelContent(() => {
      updateMathPreview();
    });
  };

  const handleEditorChange: OnChange = (value) => {
    onChange(value || '');
  };

  return (
    <div className="w-full h-full relative overflow-hidden bg-surface-lightPanel dark:bg-surface-darkPanel">
      <MonacoEditor
        height="100%"
        defaultLanguage="latex"
        language="latex"
        theme={theme === 'dark' ? 'scholarlyDark' : 'scholarlyLight'}
        beforeMount={handleBeforeMount}
        value={content}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
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
        }}
      />
    </div>
  );
};
