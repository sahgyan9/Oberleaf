// Counts the words a reader would see in a LaTeX source: the prose, headings
// and captions, without commands, comments, math or the preamble. Journals and
// fellowship calls set limits in words, and LaTeX itself never says how many
// a document has.

export interface WordCount {
  /** Words in running text, headings and captions */
  words: number;
  /** Inline formulas ($...$, \(...\)) */
  inlineMath: number;
  /** Displayed formulas (equation, align, \[...\], ...) */
  displayMath: number;
  figures: number;
  tables: number;
  citations: number;
}

const DISPLAY_MATH_ENVS = 'equation|align|gather|multline|flalign|alignat|eqnarray|displaymath';
const DROPPED_ENVS = 'verbatim|lstlisting|minted|comment|tikzpicture|thebibliography|filecontents';

// Commands whose argument is not prose: a key, a path, a length, a name.
const NON_TEXT_COMMANDS =
  'label|ref|eqref|autoref|cref|Cref|pageref|nameref|cite[a-zA-Z]*|nocite|includegraphics|input|include|' +
  'bibliography|bibliographystyle|usepackage|documentclass|begin|end|url|vspace|hspace|setlength|' +
  'newcommand|renewcommand|providecommand|newenvironment|definecolor|color|pagestyle|thispagestyle|' +
  'graphicspath|setcounter|addtocounter|input|hypersetup|geometry|fontsize|selectfont|rule';

function count(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

export function countLatexWords(source: string): WordCount {
  // Comments first: a % inside one must not be read as anything else.
  let text = source.replace(/(^|[^\\])%.*$/gm, '$1');

  // Only the body counts. A file with no \begin{document} is a chapter or
  // section file, which is all body.
  const begin = text.indexOf('\\begin{document}');
  if (begin !== -1) text = text.slice(begin + '\\begin{document}'.length);
  const end = text.indexOf('\\end{document}');
  if (end !== -1) text = text.slice(0, end);

  const figures = count(text, /\\begin\{figure\*?\}/g);
  const tables = count(text, /\\begin\{table\*?\}/g);
  const citations = count(text, /\\(?:cite[a-zA-Z]*|parencite|textcite|footcite)\*?(?:\[[^\]]*\])*\{/g);

  text = text.replace(new RegExp(`\\\\begin\\{(${DROPPED_ENVS})\\*?\\}[\\s\\S]*?\\\\end\\{\\1\\*?\\}`, 'g'), ' ');

  let displayMath = 0;
  text = text.replace(new RegExp(`\\\\begin\\{(${DISPLAY_MATH_ENVS})\\*?\\}[\\s\\S]*?\\\\end\\{\\1\\*?\\}`, 'g'), () => {
    displayMath++;
    return ' ';
  });
  text = text.replace(/\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g, () => {
    displayMath++;
    return ' ';
  });

  let inlineMath = 0;
  text = text.replace(/\\\([\s\S]*?\\\)|(?<!\\)\$[^$\n]*?(?<!\\)\$/g, () => {
    inlineMath++;
    return ' ';
  });

  // Table cells are data, not prose; captions inside the float still count.
  text = text.replace(/\\begin\{(tabular\*?|tabularx|longtable|array)\}[\s\S]*?\\end\{\1\}/g, ' ');

  // Drop non-text commands together with their arguments, then the names of
  // the rest, keeping what their braces hold (\textbf{word} counts "word").
  text = text.replace(new RegExp(`\\\\(?:${NON_TEXT_COMMANDS})\\*?(?:\\s*\\[[^\\]]*\\])*(?:\\s*\\{[^{}]*\\})*`, 'g'), ' ');
  text = text.replace(/\\[a-zA-Z@]+\*?(?:\s*\[[^\]]*\])?/g, ' ');
  text = text.replace(/\\./g, ' ').replace(/[{}~]/g, ' ');

  const words = count(text, /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu);
  return { words, inlineMath, displayMath, figures, tables, citations };
}

/** "1,204 words (about 5 min read)" style helpers for the status bar. */
export function describeWordCount(c: WordCount): string {
  const parts = [`${c.words.toLocaleString()} words in this file`];
  const math = c.inlineMath + c.displayMath;
  if (math) parts.push(`${c.displayMath} displayed and ${c.inlineMath} inline formulas`);
  if (c.figures) parts.push(`${c.figures} ${c.figures === 1 ? 'figure' : 'figures'}`);
  if (c.tables) parts.push(`${c.tables} ${c.tables === 1 ? 'table' : 'tables'}`);
  if (c.citations) parts.push(`${c.citations} citation commands`);
  return `${parts.join(', ')}. Comments, commands, math and the preamble are not counted.`;
}
