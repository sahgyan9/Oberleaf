import type * as Monaco from 'monaco-editor';

/**
 * Monaco ships no LaTeX language. Without registering one, `language="latex"`
 * silently degrades to plaintext: the editor renders unhighlighted, the custom
 * token colours in the brand themes never apply, and -- because Monaco only
 * consults providers for registered languages -- the completion provider in
 * latexCompletions.ts is never invoked at all.
 */
export const LATEX_LANGUAGE_ID = 'latex';

let isRegistered = false;

export function registerLatexLanguage(monaco: typeof Monaco): void {
  if (isRegistered) return;

  const existing = monaco.languages.getLanguages().some((l) => l.id === LATEX_LANGUAGE_ID);
  if (!existing) {
    monaco.languages.register({
      id: LATEX_LANGUAGE_ID,
      extensions: ['.tex', '.sty', '.cls', '.bbl'],
      aliases: ['LaTeX', 'latex', 'TeX'],
    });
  }

  monaco.languages.setLanguageConfiguration(LATEX_LANGUAGE_ID, {
    comments: { lineComment: '%' },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '$', close: '$' },
    ],
    surroundingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '$', close: '$' },
    ],
  });

  monaco.languages.setMonarchTokensProvider(LATEX_LANGUAGE_ID, {
    defaultToken: '',
    tokenPostfix: '.tex',

    tokenizer: {
      root: [
        // Comments run to end of line, but \% is an escaped literal percent
        [/(^|[^\\])(%.*$)/, ['', 'comment']],

        // \begin{env} / \end{env} -- environment name highlighted separately
        [/(\\(?:begin|end))(\s*)(\{)([^}]*)(\})/, ['keyword.control', '', 'delimiter.curly', 'type', 'delimiter.curly']],

        // Sectioning commands stand out from ordinary macros
        [
          /\\(?:part|chapter|section|subsection|subsubsection|paragraph|subparagraph|title|author|date|maketitle|tableofcontents)\b\*?/,
          'keyword.control',
        ],

        // Structural / reference commands
        [
          /\\(?:documentclass|usepackage|input|include|includegraphics|bibliography|bibliographystyle|addbibresource|printbibliography|label|ref|eqref|pageref|autoref|cite[pt]?|nocite|caption|footnote)\b\*?/,
          'keyword',
        ],

        // Escaped specials (\$ \% \& \_ \# \{ \}) before generic macros
        [/\\[$%&_#{}]/, 'string.escape'],

        // Any other control sequence
        [/\\[a-zA-Z@]+\*?/, 'tag'],
        [/\\./, 'string.escape'],

        // Display math $$...$$ and inline math $...$
        [/\$\$/, { token: 'number', next: '@displayMath' }],
        [/\$/, { token: 'number', next: '@inlineMath' }],

        [/[{}]/, 'delimiter.curly'],
        [/[[\]]/, 'delimiter.square'],
        [/&/, 'operator'],
        [/~/, 'operator'],
      ],

      displayMath: [
        [/\$\$/, { token: 'number', next: '@pop' }],
        [/\\[a-zA-Z@]+\*?/, 'tag'],
        [/\\./, 'string.escape'],
        [/[^\\$]+/, 'number'],
        [/\$/, 'number'],
      ],

      inlineMath: [
        [/\$/, { token: 'number', next: '@pop' }],
        [/\\[a-zA-Z@]+\*?/, 'tag'],
        [/\\./, 'string.escape'],
        [/[^\\$]+/, 'number'],
      ],
    },
  } as Monaco.languages.IMonarchLanguage);

  isRegistered = true;
}
