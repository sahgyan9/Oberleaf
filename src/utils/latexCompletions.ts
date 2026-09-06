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
let inlineCompletionDisposable: Monaco.IDisposable | null = null;

// Cache document words by model URI and version to make word-completions instant & multi-tab safe
let cachedDocKey = '';
let cachedWords: string[] = [];

function getCachedDocumentWords(model: Monaco.editor.ITextModel): string[] {
  const uriStr = model.uri ? model.uri.toString() : 'default';
  const key = `${uriStr}:${model.getVersionId()}`;
  if (key === cachedDocKey) {
    return cachedWords;
  }
  const text = model.getValue();
  const wordSet = new Set<string>();
  // Match words of length >= 3 containing letters, digits, underscores, or hyphens (starting with a letter)
  const regex = /\b[A-Za-z][A-Za-z0-9_-]{2,}\b/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    wordSet.add(match[0]);
  }
  cachedDocKey = key;
  cachedWords = Array.from(wordSet);
  return cachedWords;
}

const STANDARD_ENVIRONMENTS: Array<{ name: string; detail: string }> = [
  { name: 'itemize', detail: 'Bulleted list (itemize)' },
  { name: 'enumerate', detail: 'Numbered list (enumerate)' },
  { name: 'description', detail: 'Labeled description list' },
  { name: 'figure', detail: 'Floating figure environment' },
  { name: 'figure*', detail: 'Full-width floating figure' },
  { name: 'table', detail: 'Floating table environment' },
  { name: 'table*', detail: 'Full-width floating table' },
  { name: 'tabular', detail: 'Tabular data / grid' },
  { name: 'tabularx', detail: 'Auto-sizing tabular (tabularx)' },
  { name: 'center', detail: 'Centered text block' },
  { name: 'flushleft', detail: 'Left-aligned text block' },
  { name: 'flushright', detail: 'Right-aligned text block' },
  { name: 'equation', detail: 'Numbered single-line display equation' },
  { name: 'equation*', detail: 'Unnumbered single-line display equation' },
  { name: 'align', detail: 'Numbered aligned multiline equations' },
  { name: 'align*', detail: 'Unnumbered aligned multiline equations' },
  { name: 'gather', detail: 'Numbered centered multiline equations' },
  { name: 'gather*', detail: 'Unnumbered centered multiline equations' },
  { name: 'multline', detail: 'Numbered multiline equation' },
  { name: 'multline*', detail: 'Unnumbered multiline equation' },
  { name: 'minipage', detail: 'Miniature page / box container' },
  { name: 'quote', detail: 'Short indented quotation' },
  { name: 'quotation', detail: 'Long indented quotation' },
  { name: 'verse', detail: 'Verse / poetry formatting' },
  { name: 'verbatim', detail: 'Preformatted monospace text' },
  { name: 'verbatim*', detail: 'Preformatted text with visible spaces' },
  { name: 'lstlisting', detail: 'Source code listing (listings package)' },
  { name: 'minted', detail: 'Syntax-highlighted code (minted package)' },
  { name: 'abstract', detail: 'Document abstract section' },
  { name: 'proof', detail: 'Mathematical proof (amsthm)' },
  { name: 'theorem', detail: 'Mathematical theorem' },
  { name: 'lemma', detail: 'Mathematical lemma' },
  { name: 'corollary', detail: 'Mathematical corollary' },
  { name: 'definition', detail: 'Mathematical definition' },
  { name: 'example', detail: 'Mathematical example' },
  { name: 'remark', detail: 'Mathematical remark' },
  { name: 'document', detail: 'Main document body' },
  { name: 'matrix', detail: 'Matrix without delimiters' },
  { name: 'pmatrix', detail: 'Matrix with parentheses (...)' },
  { name: 'bmatrix', detail: 'Matrix with square brackets [...]' },
  { name: 'Bmatrix', detail: 'Matrix with curly braces {...}' },
  { name: 'vmatrix', detail: 'Determinant / single-bar matrix |...|' },
  { name: 'Vmatrix', detail: 'Norm / double-bar matrix ||...||' },
  { name: 'cases', detail: 'Piecewise case expressions' },
  { name: 'tikzpicture', detail: 'TikZ vector graphics canvas' },
  { name: 'algorithm', detail: 'Algorithm floating container' },
  { name: 'algorithmic', detail: 'Algorithmic pseudo-code block' },
];

export function registerLatexCompletions(
  monaco: typeof Monaco,
  getContext: () => ProjectContext
): void {
  // Dispose previous providers if registered to avoid duplicates
  if (completionDisposable) {
    completionDisposable.dispose();
    completionDisposable = null;
  }
  if (inlineCompletionDisposable) {
    inlineCompletionDisposable.dispose();
    inlineCompletionDisposable = null;
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

      // Ignore comments (%)
      const commentIndex = lineUntilPosition.search(/(^|[^\\])%/);
      if (commentIndex !== -1) {
        return { suggestions: [] };
      }

      // Ignore LaTeX line break (\\)
      if (lineUntilPosition.endsWith('\\\\')) {
        return { suggestions: [] };
      }

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

      // Context Handler: Inside \begin{...} or \end{...}
      // Return ONLY environment names. Never insert nested \begin{...}\end{...} snippets!
      const envMatch = lineUntilPosition.match(/\\(?:begin|end)\*?(?:\[[^\]]*\])?\s*\{([^}]*)$/i);
      if (envMatch) {
        const rawPrefix = envMatch[1];
        const envRange = rangeForPrefix(rawPrefix);
        const queryPrefix = rawPrefix.trim().toLowerCase();

        const fullLine = model.getLineContent(position.lineNumber);
        const afterCursor = fullLine.slice(position.column - 1);
        const hasClosingBrace = afterCursor.startsWith('}');

        // Discover custom environments in the current document
        const fullDoc = model.getValue();
        const knownEnvNames = new Set(STANDARD_ENVIRONMENTS.map((e) => e.name));
        const customEnvs: Array<{ name: string; detail: string }> = [];

        const customEnvRegex = /\\(?:newenvironment|renewenvironment)\{([^}]+)\}/g;
        let m: RegExpExecArray | null;
        while ((m = customEnvRegex.exec(fullDoc)) !== null) {
          const name = m[1].trim();
          if (name && !knownEnvNames.has(name)) {
            knownEnvNames.add(name);
            customEnvs.push({ name, detail: 'User-defined environment' });
          }
        }

        const usedEnvRegex = /\\begin\{([^}]+)\}/g;
        while ((m = usedEnvRegex.exec(fullDoc)) !== null) {
          const name = m[1].trim();
          if (name && !knownEnvNames.has(name)) {
            knownEnvNames.add(name);
            customEnvs.push({ name, detail: 'Document environment' });
          }
        }

        const allEnvs = [...STANDARD_ENVIRONMENTS, ...customEnvs];
        const envSuggestions: Monaco.languages.CompletionItem[] = allEnvs
          .filter((env) => !queryPrefix || env.name.toLowerCase().includes(queryPrefix))
          .map((env, index) => ({
            label: env.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: hasClosingBrace ? env.name : `${env.name}}`,
            detail: env.detail,
            documentation: {
              value: `\`\\begin{${env.name}}\` ... \`\\end{${env.name}}\``,
            },
            sortText: String(index).padStart(4, '0'),
            range: envRange,
          }));

        return { suggestions: envSuggestions };
      }

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
      const wordInfo = model.getWordUntilPosition(position);
      const fullLine = model.getLineContent(position.lineNumber);

      // Check if word has a preceding backslash on this line (e.g. \ite, \sec, \frac)
      // wordInfo.startColumn is 1-based. The character before the word is at 0-based index (startColumn - 2).
      const hasLeadingBackslash =
        wordInfo.startColumn > 1 &&
        fullLine.charAt(wordInfo.startColumn - 2) === '\\' &&
        (wordInfo.startColumn <= 2 || fullLine.charAt(wordInfo.startColumn - 3) !== '\\');

      // If user typed \cmd, commandRange covers the typed backslash as well.
      // Replacing \cmd with \insertText eliminates duplicate double-backslashes (\\cmd).
      const commandRange: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: hasLeadingBackslash ? wordInfo.startColumn - 1 : wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      const wordRange: Monaco.IRange = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      // Helper to build a command completion item with proper filterText & range
      const createCommand = (cfg: {
        name: string;
        displayLabel?: string;
        kind: Monaco.languages.CompletionItemKind;
        insertText: string;
        isSnippet?: boolean;
        detail?: string;
        documentation?: string;
        sortText?: string;
        filterAliases?: string[];
      }): Monaco.languages.CompletionItem => {
        const prefix = hasLeadingBackslash ? '\\' : '';
        const primaryFilter = `${prefix}${cfg.name}`;
        const aliasFilters = (cfg.filterAliases || []).map((a) => `${prefix}${a}`);
        const filterText = [primaryFilter, ...aliasFilters].join(' ');

        return {
          label: cfg.displayLabel ?? `\\${cfg.name}`,
          kind: cfg.kind,
          insertText: cfg.insertText,
          insertTextRules: cfg.isSnippet
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          detail: cfg.detail,
          documentation: cfg.documentation ? { value: cfg.documentation } : undefined,
          sortText: cfg.sortText,
          filterText,
          range: commandRange,
        };
      };

      const commandSuggestions: Monaco.languages.CompletionItem[] = [
        // List items
        createCommand({
          name: 'item',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: '\\item ',
          detail: 'List item',
          sortText: '00_item',
        }),

        // Environment Snippets (matching both \begin{env} and \env)
        createCommand({
          name: 'itemize',
          displayLabel: '\\begin{itemize}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{itemize}', '\t\\item ${1:first item}', '\t\\item ${2:second item}', '\\end{itemize}'].join('\n'),
          isSnippet: true,
          detail: 'Bulleted list (itemize environment)',
          filterAliases: ['begin{itemize}'],
          sortText: '01_itemize',
        }),
        createCommand({
          name: 'enumerate',
          displayLabel: '\\begin{enumerate}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{enumerate}', '\t\\item ${1:first item}', '\t\\item ${2:second item}', '\\end{enumerate}'].join('\n'),
          isSnippet: true,
          detail: 'Numbered list (enumerate environment)',
          filterAliases: ['begin{enumerate}'],
          sortText: '02_enumerate',
        }),
        createCommand({
          name: 'description',
          displayLabel: '\\begin{description}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{description}', '\t\\item[${1:label}] ${2:description}', '\\end{description}'].join('\n'),
          isSnippet: true,
          detail: 'Labeled description list',
          filterAliases: ['begin{description}'],
          sortText: '03_description',
        }),
        createCommand({
          name: 'equation',
          displayLabel: '\\begin{equation}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{equation}', '\t${1:E = mc^2}', '\\end{equation}'].join('\n'),
          isSnippet: true,
          detail: 'Numbered display equation',
          filterAliases: ['begin{equation}'],
          sortText: '04_equation',
        }),
        createCommand({
          name: 'align',
          displayLabel: '\\begin{align}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{align}', '\t${1:y} &= ${2:mx + b} \\\\', '\t${3:z} &= ${4:ax + d}', '\\end{align}'].join('\n'),
          isSnippet: true,
          detail: 'Aligned multiline equations',
          filterAliases: ['begin{align}'],
          sortText: '05_align',
        }),
        createCommand({
          name: 'figure',
          displayLabel: '\\begin{figure}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            '\\begin{figure}[htbp]',
            '\t\\centering',
            '\t\\includegraphics[width=${1:0.8}\\linewidth]{${2:figure}}',
            '\t\\caption{${3:Caption text}}',
            '\t\\label{fig:${4:label}}',
            '\\end{figure}',
          ].join('\n'),
          isSnippet: true,
          detail: 'Floating figure environment',
          filterAliases: ['begin{figure}'],
          sortText: '06_figure',
        }),
        createCommand({
          name: 'table',
          displayLabel: '\\begin{table}',
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
          isSnippet: true,
          detail: 'Floating table environment',
          filterAliases: ['begin{table}'],
          sortText: '07_table',
        }),
        createCommand({
          name: 'tabular',
          displayLabel: '\\begin{tabular}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: [
            '\\begin{tabular}{${1:llr}}',
            '\t\\toprule',
            '\t${2:Header 1} & ${3:Header 2} & ${4:Header 3} \\\\',
            '\t\\midrule',
            '\t${5:Data 1} & ${6:Data 2} & ${7:Data 3} \\\\',
            '\t\\bottomrule',
            '\\end{tabular}',
          ].join('\n'),
          isSnippet: true,
          detail: 'Tabular data environment',
          filterAliases: ['begin{tabular}'],
          sortText: '08_tabular',
        }),
        createCommand({
          name: 'abstract',
          displayLabel: '\\begin{abstract}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{abstract}', '\t${1:Abstract summary here...}', '\\end{abstract}'].join('\n'),
          isSnippet: true,
          detail: 'Document abstract section',
          filterAliases: ['begin{abstract}'],
          sortText: '09_abstract',
        }),
        createCommand({
          name: 'begin',
          displayLabel: '\\begin{...}',
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: ['\\begin{${1:environment}}', '\t${2}', '\\end{${1:environment}}'].join('\n'),
          isSnippet: true,
          detail: 'Generic \\begin{...} \\end{...}',
          sortText: '10_begin',
        }),

        // Document Structure
        createCommand({
          name: 'section',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\section{${1:Title}}\n',
          isSnippet: true,
          detail: 'Section heading',
        }),
        createCommand({
          name: 'subsection',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\subsection{${1:Title}}\n',
          isSnippet: true,
          detail: 'Subsection heading',
        }),
        createCommand({
          name: 'subsubsection',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\subsubsection{${1:Title}}\n',
          isSnippet: true,
          detail: 'Subsubsection heading',
        }),
        createCommand({
          name: 'paragraph',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\paragraph{${1:Paragraph Title}} ',
          isSnippet: true,
          detail: 'Paragraph heading',
        }),

        // Document Setup & Meta
        createCommand({
          name: 'documentclass',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\documentclass[${1:11pt}]{${2:article}}\n',
          isSnippet: true,
          detail: 'Document class declaration',
        }),
        createCommand({
          name: 'usepackage',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\usepackage{${1:package}}\n',
          isSnippet: true,
          detail: 'Include LaTeX package',
        }),
        createCommand({
          name: 'input',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\input{${1:filename}}',
          isSnippet: true,
          detail: 'Include another TeX file',
        }),
        createCommand({
          name: 'title',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\title{${1:Title}}\n',
          isSnippet: true,
          detail: 'Document title',
        }),
        createCommand({
          name: 'author',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\author{${1:Author}}\n',
          isSnippet: true,
          detail: 'Document author',
        }),
        createCommand({
          name: 'date',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\date{${1:\\today}}\n',
          isSnippet: true,
          detail: 'Document date',
        }),
        createCommand({
          name: 'maketitle',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\maketitle\n',
          detail: 'Generate title block',
        }),
        createCommand({
          name: 'tableofcontents',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\tableofcontents\n',
          detail: 'Generate table of contents',
        }),

        // Text Formatting
        createCommand({
          name: 'textbf',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\textbf{${1:text}}',
          isSnippet: true,
          detail: 'Bold text',
        }),
        createCommand({
          name: 'textit',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\textit{${1:text}}',
          isSnippet: true,
          detail: 'Italic text',
        }),
        createCommand({
          name: 'emph',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\emph{${1:text}}',
          isSnippet: true,
          detail: 'Emphasized text',
        }),
        createCommand({
          name: 'underline',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\underline{${1:text}}',
          isSnippet: true,
          detail: 'Underlined text',
        }),
        createCommand({
          name: 'texttt',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\texttt{${1:code}}',
          isSnippet: true,
          detail: 'Monospace text',
        }),
        createCommand({
          name: 'centering',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\centering\n',
          detail: 'Center alignment switch',
        }),
        createCommand({
          name: 'caption',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\caption{${1:Caption text}}',
          isSnippet: true,
          detail: 'Figure or table caption',
        }),

        // References & Citations
        createCommand({
          name: 'cite',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\cite{${1:key}}',
          isSnippet: true,
          detail: 'Citation reference',
        }),
        createCommand({
          name: 'citep',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\citep{${1:key}}',
          isSnippet: true,
          detail: 'Parenthetical citation (Natbib)',
        }),
        createCommand({
          name: 'citet',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\citet{${1:key}}',
          isSnippet: true,
          detail: 'Textual citation (Natbib)',
        }),
        createCommand({
          name: 'ref',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\ref{${1:key}}',
          isSnippet: true,
          detail: 'Cross-reference',
        }),
        createCommand({
          name: 'eqref',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\eqref{${1:eq:key}}',
          isSnippet: true,
          detail: 'Equation reference with parentheses',
        }),
        createCommand({
          name: 'label',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\label{${1:key}}',
          isSnippet: true,
          detail: 'Anchor label',
        }),
        createCommand({
          name: 'footnote',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\footnote{${1:text}}',
          isSnippet: true,
          detail: 'Footnote',
        }),

        // Math Commands & Symbols
        createCommand({
          name: 'frac',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\frac{${1:numerator}}{${2:denominator}}',
          isSnippet: true,
          detail: 'Fraction',
        }),
        createCommand({
          name: 'sqrt',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\sqrt{${1:x}}',
          isSnippet: true,
          detail: 'Square root',
        }),
        createCommand({
          name: 'sum',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\sum_{${1:i=1}}^{${2:n}} ',
          isSnippet: true,
          detail: 'Summation symbol',
        }),
        createCommand({
          name: 'int',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\int_{${1:a}}^{${2:b}} ${3:f(x)} \\, d${4:x}',
          isSnippet: true,
          detail: 'Definite integral',
        }),
        createCommand({
          name: 'lim',
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: '\\lim_{${1:x} \\to ${2:\\infty}} ',
          isSnippet: true,
          detail: 'Limit expression',
        }),
        createCommand({
          name: 'partial',
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: '\\partial ',
          detail: 'Partial derivative symbol (∂)',
        }),
        createCommand({
          name: 'infty',
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: '\\infty ',
          detail: 'Infinity symbol (∞)',
        }),

        // Greek Letters
        ...[
          'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta',
          'theta', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma',
          'tau', 'phi', 'chi', 'psi', 'omega', 'Gamma', 'Delta', 'Theta',
          'Lambda', 'Xi', 'Pi', 'Sigma', 'Phi', 'Psi', 'Omega',
        ].map((greek) =>
          createCommand({
            name: greek,
            kind: monaco.languages.CompletionItemKind.Constant,
            insertText: `\\${greek} `,
            detail: `Greek letter ${greek}`,
          })
        ),
      ];

      // In-file Document Word Completions
      // When typing standard text (no backslash), offer words previously typed in this document
      const currentWord = wordInfo.word.toLowerCase();
      const docWords = getCachedDocumentWords(model);
      const wordSuggestions: Monaco.languages.CompletionItem[] =
        !hasLeadingBackslash && wordInfo.word.length >= 2
          ? docWords
              .filter((w) => w.toLowerCase().startsWith(currentWord) && w.toLowerCase() !== currentWord)
              .slice(0, 30)
              .map((w) => ({
                label: w,
                kind: monaco.languages.CompletionItemKind.Text,
                insertText: w,
                detail: 'Document text',
                sortText: `zz_${w}`,
                range: wordRange,
              }))
          : [];

      return { suggestions: [...commandSuggestions, ...wordSuggestions] };
    },
  });

  // 2. Register Inline Ghost-Text Completion Provider
  // As the user types words that exist in their document, Monaco displays an inline ghost-text preview.
  // Pressing Tab immediately accepts the previewed completion.
  inlineCompletionDisposable = monaco.languages.registerInlineCompletionsProvider('latex', {
    provideInlineCompletions: (model, position) => {
      const lineUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Don't show ghost text in comments or on line breaks
      if (/(^|[^\\])%/.test(lineUntilPosition) || lineUntilPosition.endsWith('\\\\')) {
        return { items: [] };
      }

      const wordInfo = model.getWordUntilPosition(position);
      const query = wordInfo.word;

      // Provide inline ghost-text for words with at least 3 characters typed
      if (!query || query.length < 3) {
        return { items: [] };
      }

      const fullLine = model.getLineContent(position.lineNumber);
      const hasLeadingBackslash =
        wordInfo.startColumn > 1 &&
        fullLine.charAt(wordInfo.startColumn - 2) === '\\' &&
        (wordInfo.startColumn <= 2 || fullLine.charAt(wordInfo.startColumn - 3) !== '\\');

      // For in-file text preview: match words already present in the document
      if (!hasLeadingBackslash) {
        const words = getCachedDocumentWords(model);
        const queryLower = query.toLowerCase();

        // Match first distinct candidate that starts with the typed query and is longer
        const match = words.find(
          (w) => w.length > query.length && w.toLowerCase().startsWith(queryLower)
        );

        if (match) {
          return {
            items: [
              {
                insertText: match,
                range: {
                  startLineNumber: position.lineNumber,
                  startColumn: wordInfo.startColumn,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                },
              },
            ],
          };
        }
      }

      return { items: [] };
    },
    disposeInlineCompletions: () => {},
  });
}
