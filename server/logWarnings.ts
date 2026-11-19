// LaTeX warnings with the file and line they belong to.
//
// Errors carry their file through -file-line-error ("./ch1.tex:12: ..."), but
// warnings never do: "Reference `fig:x' on page 3 undefined on input line 12"
// says line 12 of whichever file TeX was reading. TeX records that in the log
// as a bracket stack, "(./ch1.tex" when a file opens and ")" when it closes,
// so the parser replays that stack to know which file a warning came from.
// Without it, every warning in an \input chapter would be pinned to the same
// line number in main.tex.

export type CompileWarningKind =
  | 'reference' // \ref to a label that does not exist
  | 'citation' // \cite to a key that is not in the bibliography
  | 'label' // a label defined twice
  | 'font' // font shape substituted
  | 'badbox' // overfull or underfull box: layout, not content
  | 'file' // \include skipped a file it could not find
  | 'other';

export interface CompileWarning {
  /** File as the log names it, without a leading "./"; '' when the stack gave nothing */
  file: string;
  /** 1-based line, 0 when the log gives none */
  line: number;
  message: string;
  kind: CompileWarningKind;
}

const TEX_LOG_WIDTH = 79;

// Extensions TeX opens while building a document. A "(" followed by anything
// else is prose, as in "(see the transcript file for additional information)".
const FILE_EXT =
  /\.(tex|ltx|sty|cls|clo|cfg|def|fd|aux|bbl|toc|lof|lot|out|nav|snm|vrb|ind|gls|glo|ist|bib|bst|mkii|dict|lua|ldf|code\.tex|w18)$/i;

const EXT_LIST =
  'tex|ltx|sty|cls|clo|cfg|def|fd|aux|bbl|toc|lof|lot|out|nav|snm|vrb|ind|gls|glo|ist|bib|bst|mkii|dict|lua|ldf|w18';

// A path TeX printed after "(". Absolute and ./ paths may hold spaces, and
// MiKTeX prints them unquoted: "(C:/Users/me/OneDrive/Documents/Oberleaf
// Projects/paper/main.tex". The path ends at the first known extension that is
// followed by a delimiter. A bare name ("(article.cls") never has spaces, which
// keeps prose like "(see the transcript file ...)" out. TeX Live quotes names
// with spaces instead: ("./my file.tex").
const ROOTED_PATH = new RegExp(`^((?:[A-Za-z]:[\\\\/]|\\.{0,2}[\\\\/])[^()\\n"]*?\\.(?:${EXT_LIST}))(?=$|[\\s()\\[\\]{}<>"])`, 'i');
const BARE_PATH = new RegExp(`^([\\w.-][^\\s()\\[\\]{}<>"]*?\\.(?:${EXT_LIST}))(?=$|[\\s()\\[\\]{}<>"])`, 'i');
const QUOTED_PATH = new RegExp(`^"([^"\\n]+?\\.(?:${EXT_LIST}))"`, 'i');

/** The path at the start of `text` and how many characters it used, if any. */
function readPath(text: string): { path: string; length: number } | null {
  const q = text.match(QUOTED_PATH);
  if (q) return { path: q[1], length: q[0].length };
  const m = text.match(ROOTED_PATH) ?? text.match(BARE_PATH);
  return m ? { path: m[1], length: m[1].length } : null;
}

function looksLikeFile(token: string): boolean {
  return FILE_EXT.test(token) && /^(?:[A-Za-z]:[\\/]|\.{0,2}[\\/]|[\w.-])/.test(token);
}

// Lines whose brackets are not TeX's file stack: the source text TeX quotes
// after an error (l.12 \foo(x), the inserted-text context, box contents).
function isContextLine(line: string): boolean {
  return /^l\.\d+[ ]/.test(line) || /^<[^>]*>/.test(line) || line.startsWith('[]') || /^\.\\/.test(line);
}

/**
 * The file TeX was reading at the start of each log line. Index i holds the
 * innermost open file before line i is processed.
 */
export function fileStackByLine(lines: string[]): string[] {
  const stack: Array<string | null> = [];
  const current = (): string => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k]) return stack[k]!;
    return '';
  };
  const result: string[] = new Array(lines.length);
  let skipPrefix = 0; // characters of this line already consumed as a wrapped path
  let inBoxDump = false;
  let afterContext = false;

  for (let i = 0; i < lines.length; i++) {
    result[i] = current();
    const line = lines[i];

    // An over/underfull box report is followed by the box's contents, which
    // quote the document text, parentheses included, up to a blank line.
    if (inBoxDump) {
      if (line.trim() === '') inBoxDump = false;
      skipPrefix = 0;
      continue;
    }
    if (/^(Overfull|Underfull) \\[hv]box/.test(line)) {
      inBoxDump = true;
      continue;
    }
    // "l.12 text before the error" is followed by an indented line with the
    // rest of the source line. Both quote the user's text.
    if (isContextLine(line)) {
      afterContext = /^l\.\d+[ ]/.test(line);
      skipPrefix = 0;
      continue;
    }
    if (afterContext) {
      afterContext = false;
      if (/^\s+\S/.test(line)) continue;
    }

    let nextSkip = 0;
    for (let j = skipPrefix; j < line.length; j++) {
      const ch = line[j];
      if (ch === '(') {
        const here = line.slice(j + 1);
        let found = readPath(here);
        // A path cut at column 79 continues at the start of the next line
        // (and the one after, for a long OneDrive path). Prefer the joined
        // reading whenever this line was cut: "main.t" + "ex" must not stop
        // at a shorter match, and a full-width line always continues.
        let joinedLines = 0;
        if (line.length >= TEX_LOG_WIDTH) {
          let text = here;
          for (let k = 1; k <= 3 && i + k < lines.length; k++) {
            text += lines[i + k];
            const joined = readPath(text);
            if (joined && joined.length > here.length) {
              found = joined;
              joinedLines = k;
              break;
            }
            if (lines[i + k].length < TEX_LOG_WIDTH) break;
          }
        }
        if (found && looksLikeFile(found.path)) {
          stack.push(found.path.replace(/^\.[\\/]/, ''));
          if (joinedLines) {
            // Skip what the path used of the following lines. Only the last
            // one can have text left after it, and that is where we resume.
            let used = found.length - here.length;
            for (let k = 1; k < joinedLines; k++) {
              used -= lines[i + k].length;
              result[i + k] = current();
            }
            i += joinedLines - 1;
            nextSkip = used;
            break;
          }
          j += found.length;
        } else {
          stack.push(null);
        }
      } else if (ch === ')') {
        stack.pop();
      }
    }
    skipPrefix = nextSkip;
  }
  return result;
}

const WARNING_START = /^(?:(LaTeX)|LaTeX (Font)|Package (\S+)|Class (\S+)) Warning: (.*)$/;

function kindOf(message: string, source: string): CompileWarningKind {
  if (source === 'Font') return 'font';
  if (/^Reference [`']/.test(message) || /undefined references/.test(message)) return 'reference';
  if (/Citation [`']/.test(message) || /undefined citations/.test(message)) return 'citation';
  if (/Label [`'].*multiply defined|multiply-defined labels/.test(message)) return 'label';
  return 'other';
}

/** Every warning in a pdfTeX/LaTeX log, attributed to its file and line. */
export function parseLatexWarnings(log: string): CompileWarning[] {
  const lines = log.split('\n').map((l) => l.replace(/\r$/, ''));
  const files = fileStackByLine(lines);
  const out: CompileWarning[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const box = line.match(
      /^(Overfull|Underfull) \\([hv])box \(([^)]*)\) (?:in paragraph at lines (\d+)--\d+|in alignment at lines (\d+)--\d+|detected at line (\d+)|has occurred while \\output is active)/
    );
    if (box) {
      const at = box[4] ?? box[5] ?? box[6];
      out.push({
        file: files[i],
        line: at ? parseInt(at, 10) : 0,
        message: `${box[1]} \\${box[2]}box (${box[3]})`,
        kind: 'badbox',
      });
      continue;
    }

    // \include of a missing file is not even a warning in TeX's eyes: the log
    // says "No file ch2.tex." and the chapter is silently left out. The same
    // line appears for auxiliary files on a first run (main.toc, main.bbl),
    // which is normal, so only .tex files count.
    const noFile = line.match(/^No file (.+\.tex)\.$/);
    if (noFile) {
      out.push({ file: '', line: 0, message: line.trim(), kind: 'file' });
      continue;
    }

    const start = line.match(WARNING_START);
    if (!start) continue;
    const source = start[2] ?? start[3] ?? start[4] ?? start[1];
    // Package and class warnings continue on lines prefixed "(name)", padded
    // to line up with the text; LaTeX's own continue after a hard wrap.
    const prefix = start[2] ? '(Font)' : start[3] || start[4] ? `(${source})` : null;
    let message = start[5];
    let previous = line;
    for (let k = i + 1; k < Math.min(i + 8, lines.length); k++) {
      const next = lines[k];
      if (next.trim() === '') break;
      if (prefix && next.startsWith(prefix)) {
        message = `${message.trimEnd()} ${next.slice(prefix.length).trim()}`;
      } else if (previous.length >= TEX_LOG_WIDTH) {
        message += next;
      } else {
        break;
      }
      previous = next;
      i = k;
    }
    message = message.replace(/\s+/g, ' ').trim();

    const lineMatch = message.match(/on input line (\d+)\.?/);
    out.push({
      file: files[i],
      line: lineMatch ? parseInt(lineMatch[1], 10) : 0,
      message,
      kind: kindOf(message, source),
    });
  }

  // LaTeX ends the log with one-line summaries of the warnings above them.
  // They add nothing when the itemised warnings are there.
  const SUMMARIES: Array<[RegExp, CompileWarningKind[]]> = [
    [/^There were undefined (references|citations)/, ['reference', 'citation']],
    [/^There were multiply-defined labels/, ['label']],
    [/^Some font shapes were not available/, ['font']],
  ];
  const filtered = out
    .filter((w) => {
      const summary = SUMMARIES.find(([re]) => re.test(w.message));
      if (!summary) return true;
      return !out.some((x) => x !== w && summary[1].includes(x.kind) && !SUMMARIES.some(([re]) => re.test(x.message)));
    })
    // A warning raised while reading main.aux ("Label `a' multiply defined")
    // is about the document, not the .aux file the user never opens.
    .map((w) => (/\.aux$/i.test(w.file) ? { ...w, file: '' } : w));

  const seen = new Set<string>();
  return filtered.filter((w) => {
    const key = `${w.file}|${w.line}|${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
