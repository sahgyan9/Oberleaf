/**
 * Finds the LaTeX constructs that the editor's Visual mode renders.
 *
 * Visual mode is only a different rendering of the source buffer: this module
 * reports where recognised constructs are, as character offsets into the
 * text, and never rewrites anything. Whatever it does not recognise (or cannot
 * parse with confidence) is simply not reported and stays visible as source.
 */

export type FormatStyle = 'bold' | 'italic' | 'underline' | 'mono';
export type ChipKind = 'cite' | 'ref' | 'label';
export type ListType = 'itemize' | 'enumerate' | 'description';

interface Span {
  /** Offset of the first character of the construct. */
  start: number;
  /** Offset just past the last character of the construct. */
  end: number;
}

export interface HeadingConstruct extends Span {
  kind: 'heading';
  command: string;
  /** 1 = chapter/part, 2 = section, 3 = subsection, 4 = subsubsection, 5 = paragraph. */
  level: number;
  contentStart: number;
  contentEnd: number;
}

export interface FormatConstruct extends Span {
  kind: 'format';
  style: FormatStyle;
  contentStart: number;
  contentEnd: number;
}

export interface InlineMathConstruct extends Span {
  kind: 'inlineMath';
  math: string;
}

/** A construct occupying whole lines, hidden and replaced by a rendered block. */
interface BlockSpan extends Span {
  /** 0-based line indices of the first and last line of the block. */
  startLine: number;
  endLine: number;
}

export interface DisplayMathConstruct extends BlockSpan {
  kind: 'displayMath';
  /** The math as KaTeX should see it (environment kept for align, gather, ...). */
  math: string;
}

export interface FigureConstruct extends BlockSpan {
  kind: 'figure';
  imagePath: string | null;
  caption: string | null;
}

export interface ListItemConstruct extends Span {
  kind: 'listItem';
  listType: ListType;
  depth: number;
  /** Text shown in place of `\item`: a bullet, a number or the optional label. */
  marker: string;
}

export interface ListDelimiterConstruct extends Span {
  kind: 'listDelimiter';
}

export interface ChipConstruct extends Span {
  kind: 'chip';
  chip: ChipKind;
  command: string;
  keys: string[];
}

export type VisualConstruct =
  | HeadingConstruct
  | FormatConstruct
  | InlineMathConstruct
  | DisplayMathConstruct
  | FigureConstruct
  | ListItemConstruct
  | ListDelimiterConstruct
  | ChipConstruct;

const HEADING_LEVELS: Record<string, number> = {
  part: 1,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
};

const FORMAT_STYLES: Record<string, FormatStyle> = {
  textbf: 'bold',
  textit: 'italic',
  emph: 'italic',
  textsl: 'italic',
  underline: 'underline',
  texttt: 'mono',
};

const CHIP_KINDS: Record<string, ChipKind> = {
  cite: 'cite',
  citep: 'cite',
  citet: 'cite',
  citealp: 'cite',
  citeauthor: 'cite',
  citeyear: 'cite',
  parencite: 'cite',
  textcite: 'cite',
  autocite: 'cite',
  footcite: 'cite',
  nocite: 'cite',
  ref: 'ref',
  eqref: 'ref',
  autoref: 'ref',
  cref: 'ref',
  Cref: 'ref',
  pageref: 'ref',
  nameref: 'ref',
  label: 'label',
};

/** Environments KaTeX renders directly, so they are kept around the math. */
const KATEX_MATH_ENVS = new Set([
  'equation',
  'equation*',
  'align',
  'align*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'flalign',
  'flalign*',
  'alignat',
  'alignat*',
  'displaymath',
]);

const FIGURE_ENVS = new Set(['figure', 'figure*', 'wrapfigure']);
const LIST_ENVS = new Set<ListType>(['itemize', 'enumerate', 'description']);
const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'Verbatim', 'lstlisting', 'minted', 'comment', 'filecontents', 'filecontents*']);

/** Content longer than this inside one formatting command is left as source. */
const MAX_FORMAT_LENGTH = 4000;
const MAX_BLOCK_LENGTH = 20000;

function isLetter(ch: string | undefined): boolean {
  return !!ch && ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z'));
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i--) backslashes++;
  return backslashes % 2 === 1;
}

function lineEnd(text: string, from: number): number {
  const nl = text.indexOf('\n', from);
  return nl === -1 ? text.length : nl;
}

function skipSpaces(text: string, from: number, allowNewline = false): number {
  let i = from;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\r' || (allowNewline && ch === '\n')) i++;
    else break;
  }
  return i;
}

/**
 * Index of the `}` matching the `{` at `open`, or -1. Escaped braces and
 * comments are skipped. Stops at `limit`.
 */
export function matchBrace(text: string, open: number, limit = text.length): number {
  if (text[open] !== '{') return -1;
  let depth = 0;
  for (let i = open; i < limit; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '%') {
      i = lineEnd(text, i);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Index just past `[...]` at `from`, or `from` when there is no optional argument on this line. */
function skipOptionalArg(text: string, from: number): number {
  if (text[from] !== '[') return from;
  let depth = 0;
  const stop = lineEnd(text, from);
  for (let i = from; i < stop; i++) {
    const ch = text[i];
    if (ch === '\\') {
      i++;
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === ']' && depth === 0) return i + 1;
  }
  return from;
}

/** Finds `\end{env}` matching a `\begin{env}` whose body starts at `from`, counting nesting. */
function findEnvEnd(text: string, env: string, from: number, limit: number): { start: number; end: number } | null {
  const begin = `\\begin{${env}}`;
  const end = `\\end{${env}}`;
  let depth = 1;
  let i = from;
  while (i < limit) {
    const nextEnd = text.indexOf(end, i);
    if (nextEnd === -1 || nextEnd >= limit) return null;
    const nextBegin = text.indexOf(begin, i);
    if (nextBegin !== -1 && nextBegin < nextEnd) {
      depth++;
      i = nextBegin + begin.length;
      continue;
    }
    depth--;
    if (depth === 0) return { start: nextEnd, end: nextEnd + end.length };
    i = nextEnd + end.length;
  }
  return null;
}

/** Finds an unescaped occurrence of `token` at or after `from`. */
function findUnescaped(text: string, token: string, from: number, limit: number): number {
  let i = from;
  while (i < limit) {
    const at = text.indexOf(token, i);
    if (at === -1 || at + token.length > limit) return -1;
    if (!isEscaped(text, at)) return at;
    i = at + 1;
  }
  return -1;
}

class LineIndex {
  private readonly starts: number[] = [0];
  constructor(private readonly text: string) {
    for (let i = 0; i < text.length; i++) if (text[i] === '\n') this.starts.push(i + 1);
  }
  lineOf(offset: number): number {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }
  lineStart(line: number): number {
    return this.starts[line];
  }
  /** True when only whitespace precedes `offset` on its line. */
  startsLine(offset: number): boolean {
    const start = this.starts[this.lineOf(offset)];
    return this.text.slice(start, offset).trim() === '';
  }
  /** True when only whitespace or a comment follows `offset` on its line. */
  endsLine(offset: number): boolean {
    const rest = this.text.slice(offset, lineEnd(this.text, offset)).trim();
    return rest === '' || rest.startsWith('%');
  }
}

function readEnvName(text: string, from: number): { name: string; end: number } | null {
  const i = skipSpaces(text, from);
  if (text[i] !== '{') return null;
  const close = text.indexOf('}', i);
  if (close === -1 || close - i > 40) return null;
  const name = text.slice(i + 1, close).trim();
  if (!/^[A-Za-z]+\*?$/.test(name)) return null;
  return { name, end: close + 1 };
}

function stripComments(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '%' && !isEscaped(line, i)) return line.slice(0, i);
      }
      return line;
    })
    .join('\n');
}

/** Math for KaTeX: comments, labels and tags removed, numbered environments made unnumbered. */
export function mathForKatex(source: string): string {
  return stripComments(source)
    .replace(/\\label\s*\{[^{}]*\}/g, '')
    .replace(/\\(?:no)?tag\*?\s*(?:\{[^{}]*\})?/g, '')
    .replace(/\\nonumber\b|\\notag\b/g, '')
    .replace(/\\(begin|end)\{(equation|align|gather|multline|flalign|alignat)\}/g, '\\$1{$2*}')
    .trim();
}

function figureDetails(body: string): { imagePath: string | null; caption: string | null } {
  const clean = stripComments(body);
  const graphics = /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^{}]+)\}/.exec(clean);
  let caption: string | null = null;
  const capMatch = /\\caption\s*(?:\[[^\]]*\])?\s*\{/.exec(clean);
  if (capMatch) {
    const open = capMatch.index + capMatch[0].length - 1;
    const close = matchBrace(clean, open);
    if (close !== -1) {
      caption = clean
        .slice(open + 1, close)
        .replace(/\\label\s*\{[^{}]*\}/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }
  }
  return { imagePath: graphics ? graphics[1].trim() : null, caption };
}

/** Where the document body starts and ends; the preamble is never rendered. */
function bodyBounds(text: string): { start: number; end: number } {
  const begin = /\\begin\s*\{document\}/.exec(text);
  const start = begin ? begin.index + begin[0].length : 0;
  const endMatch = /\\end\s*\{document\}/.exec(text.slice(start));
  const end = endMatch ? start + endMatch.index : text.length;
  return { start, end };
}

/**
 * Simple macro definitions from the preamble, in the form KaTeX accepts as
 * `macros`, so equations written with a paper's own shorthands (\R, \vect{x},
 * \DeclareMathOperator{\Tr}{Tr}) still render. Definitions with optional
 * arguments or anything unusual are skipped; KaTeX then reports the unknown
 * command and the equation stays as source.
 */
export function extractKatexMacros(text: string): Record<string, string> {
  const macros: Record<string, string> = {};
  const src = stripComments(text.slice(0, bodyBounds(text).start || text.length));

  const cmdDef = /\\(?:re)?newcommand\*?\s*\{?\s*(\\[A-Za-z]+)\s*\}?\s*(?:\[(\d)\])?\s*\{/g;
  for (let m = cmdDef.exec(src); m; m = cmdDef.exec(src)) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(src, open);
    if (close === -1) continue;
    // `[n][default]` (an optional first argument) never matches the pattern above.
    macros[m[1]] = src.slice(open + 1, close);
    cmdDef.lastIndex = close + 1;
  }

  const def = /\\def\s*(\\[A-Za-z]+)\s*((?:#\d)*)\s*\{/g;
  for (let m = def.exec(src); m; m = def.exec(src)) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(src, open);
    if (close === -1) continue;
    macros[m[1]] = src.slice(open + 1, close);
    def.lastIndex = close + 1;
  }

  const op = /\\DeclareMathOperator(\*?)\s*\{\s*(\\[A-Za-z]+)\s*\}\s*\{([^{}]*)\}/g;
  for (let m = op.exec(src); m; m = op.exec(src)) {
    macros[m[2]] = m[1] ? `\\operatorname*{${m[3]}}` : `\\operatorname{${m[3]}}`;
  }
  return macros;
}

interface ListFrame {
  type: ListType;
  counter: number;
}

export function parseVisualConstructs(text: string): VisualConstruct[] {
  const out: VisualConstruct[] = [];
  const lines = new LineIndex(text);
  const { start: bodyStart, end: bodyEnd } = bodyBounds(text);
  const lists: ListFrame[] = [];

  const block = (start: number, end: number): { startLine: number; endLine: number } | null => {
    if (!lines.startsLine(start) || !lines.endsLine(end)) return null;
    return { startLine: lines.lineOf(start), endLine: lines.lineOf(end) };
  };

  let i = bodyStart;
  while (i < bodyEnd) {
    const ch = text[i];

    if (ch === '%') {
      i = lineEnd(text, i);
      continue;
    }

    if (ch === '$') {
      if (text[i + 1] === '$') {
        const close = findUnescaped(text, '$$', i + 2, Math.min(bodyEnd, i + MAX_BLOCK_LENGTH));
        if (close === -1) {
          i += 2;
          continue;
        }
        const end = close + 2;
        const lineRange = block(i, end);
        const math = mathForKatex(text.slice(i + 2, close));
        if (lineRange && math) out.push({ kind: 'displayMath', start: i, end, ...lineRange, math });
        i = end;
        continue;
      }
      const stop = lineEnd(text, i);
      const close = findUnescaped(text, '$', i + 1, stop);
      if (close === -1) {
        i += 1;
        continue;
      }
      const math = text.slice(i + 1, close);
      if (math.trim()) out.push({ kind: 'inlineMath', start: i, end: close + 1, math: math.trim() });
      i = close + 1;
      continue;
    }

    if (ch !== '\\') {
      i++;
      continue;
    }

    // A control symbol (\$, \%, \\, \{ ...) or a control word.
    const next = text[i + 1];
    if (!isLetter(next)) {
      if (next === '[') {
        const close = findUnescaped(text, '\\]', i + 2, Math.min(bodyEnd, i + MAX_BLOCK_LENGTH));
        if (close !== -1) {
          const end = close + 2;
          const lineRange = block(i, end);
          const math = mathForKatex(text.slice(i + 2, close));
          if (lineRange && math) out.push({ kind: 'displayMath', start: i, end, ...lineRange, math });
          i = end;
          continue;
        }
      } else if (next === '(') {
        const close = findUnescaped(text, '\\)', i + 2, lineEnd(text, i));
        if (close !== -1) {
          const math = text.slice(i + 2, close).trim();
          if (math) out.push({ kind: 'inlineMath', start: i, end: close + 2, math });
          i = close + 2;
          continue;
        }
      }
      i += 2;
      continue;
    }

    let nameEnd = i + 1;
    while (isLetter(text[nameEnd])) nameEnd++;
    const name = text.slice(i + 1, nameEnd);

    // Inline verbatim: \verb|...|, \verb*+...+, \lstinline!...! (brace form too).
    if (name === 'verb' || name === 'lstinline') {
      let j = nameEnd;
      if (text[j] === '*') j++;
      if (name === 'lstinline') j = skipOptionalArg(text, j);
      const delim = text[j];
      const stop = lineEnd(text, j);
      const close = !delim || delim === '\n' ? -1 : text.indexOf(delim === '{' ? '}' : delim, j + 1);
      i = close === -1 || close > stop ? stop : close + 1;
      continue;
    }

    if (name === 'begin') {
      const env = readEnvName(text, nameEnd);
      if (!env) {
        i = nameEnd;
        continue;
      }
      if (VERBATIM_ENVS.has(env.name)) {
        const close = findEnvEnd(text, env.name, env.end, bodyEnd);
        i = close ? close.end : bodyEnd;
        continue;
      }
      if (KATEX_MATH_ENVS.has(env.name) || FIGURE_ENVS.has(env.name)) {
        const close = findEnvEnd(text, env.name, env.end, Math.min(bodyEnd, i + MAX_BLOCK_LENGTH));
        if (!close) {
          i = env.end;
          continue;
        }
        const lineRange = block(i, close.end);
        if (lineRange) {
          if (FIGURE_ENVS.has(env.name)) {
            out.push({ kind: 'figure', start: i, end: close.end, ...lineRange, ...figureDetails(text.slice(env.end, close.start)) });
          } else {
            const math = mathForKatex(text.slice(i, close.end));
            out.push({ kind: 'displayMath', start: i, end: close.end, ...lineRange, math });
          }
        }
        i = close.end;
        continue;
      }
      if (LIST_ENVS.has(env.name as ListType)) {
        lists.push({ type: env.name as ListType, counter: 0 });
        if (lines.startsLine(i) && lines.endsLine(skipOptionalArg(text, env.end))) {
          out.push({ kind: 'listDelimiter', start: i, end: skipOptionalArg(text, env.end) });
        }
      }
      i = env.end;
      continue;
    }

    if (name === 'end') {
      const env = readEnvName(text, nameEnd);
      if (env && LIST_ENVS.has(env.name as ListType)) {
        if (lists.length && lists[lists.length - 1].type === env.name) lists.pop();
        if (lines.startsLine(i) && lines.endsLine(env.end)) out.push({ kind: 'listDelimiter', start: i, end: env.end });
      }
      i = env ? env.end : nameEnd;
      continue;
    }

    if (name === 'item' && lists.length > 0) {
      const frame = lists[lists.length - 1];
      let end = nameEnd;
      let marker: string;
      const optEnd = skipOptionalArg(text, end);
      if (optEnd !== end) {
        marker = text.slice(end + 1, optEnd - 1).trim();
        end = optEnd;
      } else if (frame.type === 'enumerate') {
        frame.counter++;
        marker = `${frame.counter}.`;
      } else {
        marker = lists.length % 2 === 1 ? '•' : '–';
      }
      // Swallow one following space so the item text lines up after the marker.
      if (text[end] === ' ') end++;
      out.push({ kind: 'listItem', start: i, end, listType: frame.type, depth: lists.length, marker });
      i = end;
      continue;
    }

    if (name in HEADING_LEVELS) {
      let j = nameEnd;
      if (text[j] === '*') j++;
      j = skipOptionalArg(text, skipSpaces(text, j));
      j = skipSpaces(text, j);
      const close = text[j] === '{' ? matchBrace(text, j, lineEnd(text, j)) : -1;
      if (close !== -1 && lines.startsLine(i)) {
        out.push({ kind: 'heading', command: name, level: HEADING_LEVELS[name], start: i, end: close + 1, contentStart: j + 1, contentEnd: close });
        // Keep scanning inside the title: it may hold math or formatting.
        i = j + 1;
        continue;
      }
      i = nameEnd;
      continue;
    }

    if (name in FORMAT_STYLES) {
      const j = skipSpaces(text, nameEnd);
      const close = text[j] === '{' ? matchBrace(text, j, Math.min(bodyEnd, j + MAX_FORMAT_LENGTH)) : -1;
      if (close !== -1 && close > j + 1) {
        out.push({ kind: 'format', style: FORMAT_STYLES[name], start: i, end: close + 1, contentStart: j + 1, contentEnd: close });
        i = j + 1;
        continue;
      }
      i = nameEnd;
      continue;
    }

    if (name in CHIP_KINDS) {
      let j = nameEnd;
      if (text[j] === '*') j++;
      // Up to two optional arguments: \cite[see][p.~4]{key}.
      j = skipOptionalArg(text, skipSpaces(text, j));
      j = skipOptionalArg(text, skipSpaces(text, j));
      j = skipSpaces(text, j);
      const close = text[j] === '{' ? matchBrace(text, j, lineEnd(text, j)) : -1;
      if (close !== -1) {
        const keys = text
          .slice(j + 1, close)
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean);
        if (keys.length > 0 && keys.every((k) => !/[\\{}$]/.test(k))) {
          out.push({ kind: 'chip', chip: CHIP_KINDS[name], command: name, keys, start: i, end: close + 1 });
        }
        i = close + 1;
        continue;
      }
    }

    i = nameEnd;
  }

  return out;
}
