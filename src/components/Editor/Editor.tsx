import React, { useRef, useEffect } from 'react';
import MonacoEditor, { OnMount, OnChange, BeforeMount } from '@monaco-editor/react';
import { useTheme } from '../../context/ThemeContext';
import { extractMathAtPosition } from '../../utils/mathDetector';
import { registerLatexCompletions, ProjectContext } from '../../utils/latexCompletions';
import { registerLatexLanguage } from '../../utils/latexLanguage';

interface EditorProps {
  content: string;
  onChange: (value: string) => void;
  onCompile: () => void;
  onEquationChange: (eq: string | null, pos?: { top: number; left: number }, displayMode?: boolean) => void;
  editorRefOut?: React.MutableRefObject<any>;
  getProjectContext?: () => ProjectContext;
  onJumpToPdf?: () => void;
  highlightLine?: { line: number; timestamp: number } | null;
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
}) => {
  const { theme } = useTheme();
  const editorInstance = useRef<any>(null);
  const monacoInstance = useRef<any>(null);
  const decorationsRef = useRef<string[]>([]);

  const onCompileRef = useRef(onCompile);
  const onJumpToPdfRef = useRef(onJumpToPdf);
  const onEquationChangeRef = useRef(onEquationChange);
  const getProjectContextRef = useRef(getProjectContext);

  useEffect(() => {
    onCompileRef.current = onCompile;
    onJumpToPdfRef.current = onJumpToPdf;
    onEquationChangeRef.current = onEquationChange;
    getProjectContextRef.current = getProjectContext;
  });

  // Dynamically sync Monaco theme when user toggles light/dark mode
  useEffect(() => {
    if (monacoInstance.current) {
      monacoInstance.current.editor.setTheme(theme === 'dark' ? 'scholarlyDark' : 'scholarlyLight');
    }
  }, [theme]);

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

    // Add Keybinding: Ctrl+Enter / Cmd+Enter to compile
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onCompileRef.current();
    });

    // Add Keybinding: Ctrl+Alt+J to Jump to PDF location (SyncTeX Forward)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyJ, () => {
      onJumpToPdfRef.current?.();
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

    // Detect cursor math context accurately
    editor.onDidChangeCursorPosition((e) => {
      const model = editor.getModel();
      if (!model) return;

      const position = e.position;
      const text = model.getValue();
      const offset = model.getOffsetAt(position);

      const mathCtx = extractMathAtPosition(text, offset);

      if (mathCtx) {
        const coords = editor.getScrolledVisiblePosition(position);
        if (coords) {
          onEquationChangeRef.current(
            mathCtx.math,
            {
              top: coords.top + 70,
              left: Math.min(coords.left + 260, window.innerWidth - 320),
            },
            mathCtx.displayMode
          );
          return;
        }
      }

      onEquationChangeRef.current(null);
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
          minimap: { enabled: false },
          wordWrap: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          padding: { top: 12, bottom: 12 },
          smoothScrolling: true,
          wordBasedSuggestions: 'off',
        }}
      />
    </div>
  );
};
