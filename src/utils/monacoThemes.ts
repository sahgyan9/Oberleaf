import type { Monaco } from '@monaco-editor/react';

// Monaco has one theme for the whole page: every editor instance, including
// the History drawer's diff view, shares it, and the last setTheme wins. The
// diff view used to ask for 'brandDark', a theme nothing defined, so Monaco
// fell back to its light 'vs' theme and the main editor turned white in dark
// mode until the next theme toggle. In Visual mode, whose dark styles keep
// rendered math near-white, the math then disappeared. Every editor defines
// and uses these two themes so the page always agrees.

export const EDITOR_THEMES = { dark: 'scholarlyDark', light: 'scholarlyLight' } as const;

export function editorThemeName(theme: 'dark' | 'light' | string): string {
  return theme === 'dark' ? EDITOR_THEMES.dark : EDITOR_THEMES.light;
}

export function defineEditorThemes(monaco: Monaco): void {
  monaco.editor.defineTheme(EDITOR_THEMES.dark, {
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

  monaco.editor.defineTheme(EDITOR_THEMES.light, {
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
}
