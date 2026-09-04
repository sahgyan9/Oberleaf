import type * as Monaco from 'monaco-editor';

export interface ProjectContext {
  citations: Array<{
    key: string;
    type?: string;
    title?: string;
    author?: string;
    year?: string;
  }>;
  files: Array<{
    name: string;
    relativePath: string;
    type: string;
  }>;
}

let completionDisposable: Monaco.IDisposable | null = null;

export function registerLatexCompletions(
  monaco: typeof Monaco,
  getContext: () => ProjectContext
): void {
  // Dispose previous provider if registered to avoid duplicates
  if (completionDisposable) {
    completionDisposable.dispose();
  }

  completionDisposable = monaco.languages.registerCompletionItemProvider('latex', {
    triggerCharacters: ['\\', '{', ',', ':', '['],

    provideCompletionItems: (model, position) => {
      const lineUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const wordInfo = model.getWordUntilPosition(position);
      const range: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      // Monaco's word pattern breaks on ':' and '-', which is exactly what
      // BibTeX keys and labels like "fig:setup" are made of. Replacing only the
      // trailing word turns "\ref{fig:" into "\ref{fig:fig:setup}", so brace
      // arguments compute their own range from the raw typed prefix instead.
      const rangeForPrefix = (rawPrefix: string): Monaco.IRange => ({
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - rawPrefix.length,
        endColumn: position.column,
      });

      const context = getContext();

      // 1. Dynamic Citation Completion: \cite{..., \citep{..., \citet{...
      const citeMatch = lineUntilPosition.match(/\\(?:cite[pt]?|nocite)\{([^}]*)$/i);
      if (citeMatch) {
        const rawPrefix = citeMatch[1].split(',').pop() ?? '';
        const citeRange = rangeForPrefix(rawPrefix);
        const queryPrefix = rawPrefix.trim().toLowerCase();
        const citeItems: Monaco.languages.CompletionItem[] = context.citations
          .filter((c) => !queryPrefix || c.key.toLowerCase().includes(queryPrefix))
          .map((c) => ({
            label: c.key,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: c.key,
            detail: `${c.type ? `@${c.type}` : 'BibTeX'} · ${c.year || 'N/A'} · ${c.author ? c.author.split(' and ')[0] + ' et al.' : ''}`,
            documentation: {
              value: `**${c.title || c.key}**\n\n*Author(s):* ${c.author || 'Unknown'}\n\n*Year:* ${c.year || 'N/A'}\n\n*Key:* \`${c.key}\``,
            },
            range: citeRange,
          }));

        return { suggestions: citeItems };
      }

      // 2. Dynamic Label/Ref Completion: \ref{..., \eqref{..., \pageref{...
      const refMatch = lineUntilPosition.match(/\\(?:eq|page|auto|c)?ref\{([^}]*)$/i);
      if (refMatch) {
        const rawPrefix = refMatch[1];
        const refRange = rangeForPrefix(rawPrefix);
        const queryPrefix = rawPrefix.trim().toLowerCase();
        // Scan current document for all \label{...} tags
        const fullDoc = model.getValue();
        const labelRegex = /\\label\{([^}]+)\}/g;
        const labels: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = labelRegex.exec(fullDoc)) !== null) {
          if (!labels.includes(m[1])) {
            labels.push(m[1]);
          }
        }

        const labelItems: Monaco.languages.CompletionItem[] = labels
          .filter((lbl) => !queryPrefix || lbl.toLowerCase().includes(queryPrefix))
          .map((lbl) => ({
            label: lbl,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: lbl,
            detail: 'Document Label',
            documentation: {
              value: `Cross-reference to \`\\label{${lbl}}\``,
            },
            range: refRange,
          }));

        return { suggestions: labelItems };
      }

      // 3. Dynamic Image/Graphic Completion: \includegraphics[...]{... or \includegraphics{...
      const graphicMatch = lineUntilPosition.match(/\\includegraphics(?:\[[^\]]*\])?\{([^}]*)$/i);
      if (graphicMatch) {
        const rawPrefix = graphicMatch[1];
        const graphicRange = rangeForPrefix(rawPrefix);
        const queryPrefix = rawPrefix.trim().toLowerCase();
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.svg', '.webp'];

        // Helper to collect all files recursively
        const collectImages = (items: typeof context.files): string[] => {
          const imgs: string[] = [];
          for (const item of items) {
            const ext = '.' + item.name.split('.').pop()?.toLowerCase();
            if (imageExtensions.includes(ext)) {
              imgs.push(item.relativePath);
            }
          }
          return imgs;
        };

        const imagePaths = collectImages(context.files);
        const imageItems: Monaco.languages.CompletionItem[] = imagePaths
          .filter((p) => !queryPrefix || p.toLowerCase().includes(queryPrefix))
          .map((p) => ({
            label: p,
            kind: monaco.languages.CompletionItemKind.File,
            insertText: p,
            detail: 'Project Graphic',
            documentation: {
              value: `Include graphic file \`${p}\``,
            },
            range: graphicRange,
          }));

        return { suggestions: imageItems };
      }

      // 4. General LaTeX Commands, Math Symbols, and Environment Snippets
      const suggestions: Monaco.languages.CompletionItem[] = [
        // Environments
        {
          label: 'equation',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{equation}', '\t${1:E = mc^2}', '\\end{equation}'].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Numbered Display Equation',
          range,
        },
        {
          label: 'align',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{align}', '\t${1:y} &= ${2:mx + b} \\\\', '\t${3:z} &= ${4:ax + d}', '\\end{align}'].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Aligned Multiline Equation',
          range,
        },
        {
          label: 'figure',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            '\\begin{figure}[htbp]',
            '\t\\centering',
            '\t\\includegraphics[width=${1:0.8}\\linewidth]{${2:figure}}',
            '\t\\caption{${3:Caption text}}',
            '\t\\label{fig:${4:label}}',
            '\\end{figure}',
          ].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Floating Figure Environment',
          range,
        },
        {
          label: 'table',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            '\\begin{table}[htbp]',
            '\t\\centering',
            '\t\\caption{${1:Table caption}}',
            '\t\\label{tab:${2:label}}',
            '\t\\begin{tabular}{${3:llr}}',
            '\t\t\\toprule',
            '\t\t${4:Header 1} & ${5:Header 2} & ${6:Header 3} \\\\',
            '\t\t\\midrule',
            '\t\t${7:Data 1} & ${8:Data 2} & ${9:Data 3} \\\\',
            '\t\t\\bottomrule',
            '\t\\end{tabular}',
            '\\end{table}',
          ].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Floating Table Environment',
          range,
        },
        {
          label: 'itemize',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{itemize}', '\t\\item ${1:first item}', '\t\\item ${2:second item}', '\\end{itemize}'].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Bulleted List',
          range,
        },
        {
          label: 'enumerate',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{enumerate}', '\t\\item ${1:first item}', '\t\\item ${2:second item}', '\\end{enumerate}'].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Numbered List',
          range,
        },
        {
          label: 'abstract',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{abstract}', '\t${1:Abstract summary here...}', '\\end{abstract}'].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Abstract Section',
          range,
        },
        {
          label: 'begin',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{${1:environment}}', '\t${2}', '\\end{${1:environment}}'].join('\n'),
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Generic \\begin{...} \\end{...}',
          range,
        },

        // Document Structure
        {
          label: '\\section',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\section{${1:Title}}\n',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Section heading',
          range,
        },
        {
          label: '\\subsection',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\subsection{${1:Title}}\n',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Subsection heading',
          range,
        },
        {
          label: '\\subsubsection',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\subsubsection{${1:Title}}\n',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Subsubsection heading',
          range,
        },
        {
          label: '\\paragraph',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\paragraph{${1:Paragraph Title}} ',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Paragraph heading',
          range,
        },

        // Text Formatting
        {
          label: '\\textbf',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\textbf{${1:text}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Bold text',
          range,
        },
        {
          label: '\\textit',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\textit{${1:text}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Italic text',
          range,
        },
        {
          label: '\\emph',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\emph{${1:text}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Emphasized text',
          range,
        },
        {
          label: '\\underline',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\underline{${1:text}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Underlined text',
          range,
        },
        {
          label: '\\texttt',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\texttt{${1:code}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Monospace/teletype text',
          range,
        },

        // References & Citations
        {
          label: '\\cite',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\cite{${1:key}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Citation',
          range,
        },
        {
          label: '\\citep',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\citep{${1:key}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Parenthetical Citation (Natbib)',
          range,
        },
        {
          label: '\\citet',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\citet{${1:key}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Textual Citation (Natbib)',
          range,
        },
        {
          label: '\\ref',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\ref{${1:key}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Cross-reference',
          range,
        },
        {
          label: '\\eqref',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\eqref{${1:eq:key}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Equation reference with parentheses',
          range,
        },
        {
          label: '\\label',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\label{${1:key}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Anchor label',
          range,
        },
        {
          label: '\\footnote',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\footnote{${1:text}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Footnote',
          range,
        },

        // Math Commands & Symbols
        {
          label: '\\frac',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\frac{${1:numerator}}{${2:denominator}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Fraction',
          range,
        },
        {
          label: '\\sqrt',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\sqrt{${1:x}}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Square root',
          range,
        },
        {
          label: '\\sum',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\sum_{${1:i=1}}^{${2:n}} ',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Summation symbol',
          range,
        },
        {
          label: '\\int',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\int_{${1:a}}^{${2:b}} ${3:f(x)} \\, d${4:x}',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Definite integral',
          range,
        },
        {
          label: '\\lim',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\lim_{${1:x} \\to ${2:\\infty}} ',
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: 'Limit expression',
          range,
        },
        {
          label: '\\partial',
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: '\\partial ',
          detail: 'Partial derivative symbol (∂)',
          range,
        },
        {
          label: '\\infty',
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: '\\infty ',
          detail: 'Infinity symbol (∞)',
          range,
        },

        // Greek Letters
        ...[
          'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
          'theta', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
          'tau', 'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta',
          'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
        ].map((greek) => ({
          label: `\\${greek}`,
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: `\\${greek} `,
          detail: `Greek letter ${greek}`,
          range,
        })),
      ];

      return { suggestions };
    },
  });
}
