import React, { useRef, useEffect } from 'react';
import MonacoEditor, { OnMount, OnChange } from '@monaco-editor/react';
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

  // @monaco-editor/react captures `onMount` from the FIRST render and never
  // refreshes it, so anything registered inside onMount closes over that
  // render's props forever. Reading the callbacks through refs that are
  // updated every render keeps the editor commands pointed at current state.
  // Without this, Ctrl+Enter saved the editor's mount-time content (an empty
  // string) over the real file before compiling it.
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

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorInstance.current = editor;
    monacoInstance.current = monaco;
    if (editorRefOut) editorRefOut.current = editor;

    // The language must exist before anything else: Monaco only applies
    // tokenizer rules and completion providers to registered languages.
    registerLatexLanguage(monaco);

    // Register once, reading the project context through a ref. Registering
    // with the prop directly captured the context as it stood at mount time,
    // and because Monaco loads from a CDN it mounts several seconds after
    // citations have already arrived -- so \cite{ offered nothing, for good.
    registerLatexCompletions(monaco, () =>
      getProjectContextRef.current?.() ?? { citations: [], files: [] }
    );

    // Define custom LaTeX theme highlighting with our brand colors
    monaco.editor.defineTheme('brandDark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: '49A4BB', fontStyle: 'bold' },
        { token: 'keyword.control', foreground: '2E6FA0', fontStyle: 'bold' },
        { token: 'tag', foreground: '49A4BB' },
        { token: 'type', foreground: '15D8B3', fontStyle: 'bold' },
        { token: 'string.escape', foreground: 'F59E0B' },
        { token: 'delimiter', foreground: '94A3B8' },
        { token: 'operator', foreground: '15D8B3' },
        { token: 'number', foreground: '15D8B3' },
        { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
      ],
      colors: {
        'editor.background': '#111827',
        'editor.foreground': '#F8FAFC',
        'editorCursor.foreground': '#15D8B3',
        'editor.lineHighlightBackground': '#1E293B50',
      },
    });

    // Add Keybinding: Ctrl+Enter / Cmd+Enter to compile
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      onCompileRef.current();
    });

    // Add Keybinding: Ctrl+Alt+J to Jump to PDF location (SyncTeX Forward)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Alt | monaco.KeyCode.KeyJ, () => {
      onJumpToPdfRef.current?.();
    });

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

      // If no math around cursor, dismiss preview
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
        theme={theme === 'dark' ? 'brandDark' : 'vs'}
        value={content}
        onChange={handleEditorChange}
        onMount={handleEditorDidMount}
        options={{
          fontSize: 14,
          fontFamily: "'Fira Code', 'Cascadia Code', Consolas, monospace",
          lineNumbers: 'on',
          minimap: { enabled: false },
          wordWrap: 'on',
          automaticLayout: true,
          scrollBeyondLastLine: false,
          tabSize: 2,
          padding: { top: 12, bottom: 12 },
          smoothScrolling: true,
          // Monaco otherwise offers every word already in the document as a
          // completion. In prose-heavy LaTeX that buries the real \cite and
          // \ref suggestions -- typing "\cite{smith:2020-" would surface
          // "article" (scraped from \documentclass) ahead of the actual key.
          wordBasedSuggestions: 'off',
        }}
      />
    </div>
  );
};
