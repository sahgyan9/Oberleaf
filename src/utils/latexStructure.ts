// Live structure check for the editor: the mistakes that stop TeX, found while
// the user types and before any compile. Unbalanced { }, \begin/\end pairs, a
// missing or repeated \end{document}, and unmatched $, \[ \], \( \) and
// \left/\right. Overleaf's "Code check" flags the same kind of mistake.
//
// It reads the code mask from latexLint (comments, verbatim environments,
// \verb, \lstinline and URL addresses blanked, columns unchanged), so a { in
// a comment or a listing is never counted and every mark lands on the exact
// character in the source.
//
// One stack holds every open group (brace, math, \left, environment), the way
// TeX nests them. A closer that skips over open groups reports those groups,
// so a missing } is reported at its {, inside the environment it belongs to,
// instead of at the end of the file.
//
// Which arguments may not contain a blank line was checked with pdflatex
// (MiKTeX, 2026-11-19): every command in SHORT_ARGUMENT stops with "Paragraph
// ended before ... was complete"; \title, \url, \footnote and \mbox accept one.

import { analyze, VERBATIM_ENVS } from './latexLint';
import type { EditorDiagnostic } from './compileDiagnostics';

export type StructureRule =
  | 'unclosed-brace'
  | 'extra-brace'
  | 'unclosed-math'
  | 'extra-math-close'
  | 'unclosed-left'
  | 'extra-right'
  | 'unclosed-environment'
  | 'environment-mismatch'
  | 'extra-end'
  | 'missing-end-document'
  | 'duplicate-begin-document'
  | 'duplicate-end-document';

export interface StructureFinding extends EditorDiagnostic {
  rule: StructureRule;
  /** 1-based column of the first character to underline */
  column: number;
  /** 1-based column after the last character to underline */
  endColumn: number;
  /** Something opened and not closed. Hidden while the cursor is after it on its line: the user may still be typing it. */
  opener?: boolean;
}

interface Frame {
  kind: 'brace' | 'math' | 'left' | 'env';
  line: number;
  column: number;
  endColumn: number;
  /** As typed: '{', '$', '\\[', '\\left(', '\\begin{itemize}' */
  token: string;
  /** brace: the command this is an argument of, e.g. 'textbf' */
  owner?: string | null;
  /** brace: written right after the command (\textbf{), so messages can name it */
  named?: boolean;
  /** brace: the body of a definition; inside, only braces are counted */
  raw?: boolean;
  /** env: the environment name */
  name?: string;
  /** brace: the argument state to restore when it closes */
  saved?: ArgState;
}

interface ArgState {
  owner: string | null;
  depth: number;
  optional: boolean;
  /** A space since the command: TeX still takes the argument, but "\item {" should not read as "\item{" */
  gap?: boolean;
}

type Reason =
  | { kind: 'eof' }
  | { kind: 'paragraph' }
  /** Closed by a later token that skipped over it */
  | { kind: 'closer'; token: string; line: number };

/** Commands whose argument may not contain a blank line (checked with pdflatex) */
const SHORT_ARGUMENT = new Set([
  'textbf', 'textit', 'textsl', 'textsc', 'textsf', 'texttt', 'textrm', 'textup', 'textmd', 'textnormal', 'emph',
  'part', 'chapter', 'section', 'subsection', 'subsubsection', 'paragraph', 'subparagraph',
  'caption', 'author', 'label', 'ref', 'eqref', 'pageref', 'autoref', 'nameref', 'cref', 'Cref',
  'cite', 'citep', 'citet', 'parencite', 'textcite', 'autocite', 'footcite', 'nocite',
  'href', 'textcolor', 'includegraphics',
]);

/** Commands whose argument is text even inside math, so a $ in it opens new math */
const TEXT_ARGUMENT = new Set([
  'text', 'textrm', 'textbf', 'textit', 'textsf', 'texttt', 'textup', 'textnormal', 'textsl', 'textsc', 'emph',
  'mbox', 'hbox', 'fbox', 'makebox', 'framebox', 'parbox', 'intertext', 'shortintertext', 'tag',
]);

/**
 * Definition commands and how many brace groups follow them that are bodies
 * (name in braces, name as a control sequence). \newcommand{\be}{\begin{equation}}
 * is half an environment on purpose, so only braces are counted inside.
 */
const DEFINITIONS: Record<string, [number, number]> = {
  newcommand: [2, 1], renewcommand: [2, 1], providecommand: [2, 1], DeclareRobustCommand: [2, 1],
  newenvironment: [3, 3], renewenvironment: [3, 3], lstnewenvironment: [3, 3],
  NewDocumentCommand: [3, 2], RenewDocumentCommand: [3, 2], ProvideDocumentCommand: [3, 2], DeclareDocumentCommand: [3, 2],
  NewDocumentEnvironment: [4, 4], RenewDocumentEnvironment: [4, 4], ProvideDocumentEnvironment: [4, 4], DeclareDocumentEnvironment: [4, 4],
  NewEnviron: [2, 2], RenewEnviron: [2, 2],
  def: [1, 1], gdef: [1, 1], edef: [1, 1], xdef: [1, 1],
  AtBeginDocument: [1, 1], AtEndDocument: [1, 1], AtEndPreamble: [1, 1], AfterEndPreamble: [1, 1],
  AtBeginEnvironment: [2, 2], AtEndEnvironment: [2, 2], BeforeBeginEnvironment: [2, 2], AfterEndEnvironment: [2, 2],
  apptocmd: [4, 3], pretocmd: [4, 3], patchcmd: [5, 4],
};

const RIGHT_DELIMITER: Record<string, string> = {
  '(': ')', '[': ']', '\\{': '\\}', '\\lbrace': '\\rbrace', '\\langle': '\\rangle', '<': '>',
  '|': '|', '\\|': '\\|', '\\vert': '\\vert', '\\Vert': '\\Vert', '\\lvert': '\\rvert', '\\lVert': '\\rVert',
  '\\lfloor': '\\rfloor', '\\lceil': '\\rceil', '.': '.', '/': '/',
};

const MATH_CLOSER: Record<string, string> = { $: '$', $$: '$$', '\\(': '\\)', '\\[': '\\]' };

const WORD = /[A-Za-z@]+/y;
const ENV_NAME = /\s*\{([^{}\\%]+)\}/y;
const DELIMITER = /\s*(\\[A-Za-z]+|\\[^A-Za-z\s]|[^\s{}$%\\])/y;
const AFTER_DEFINITION = /\s*\*?\s*(\S)/y;

export function checkLatexStructure(source: string): StructureFinding[] {
  const lines = analyze(source);
  const findings: StructureFinding[] = [];
  const stack: Frame[] = [];
  let arg: ArgState = { owner: null, depth: 0, optional: false };
  let rawPending: { count: number; depth: number } | null = null;
  let documentBegin: Frame | null = null;
  let documentEnd: { line: number; column: number; endColumn: number; index: number; stop: number } | null = null;
  /**
   * A brace the last blank line cut off; the } meant for it then has no
   * partner. Set inside paragraphBreak, so cast: TypeScript would otherwise
   * narrow it to null in the loop.
   */
  let cutBrace = null as { frame: Frame; line: number } | null;

  const add = (f: StructureFinding) => findings.push(f);
  const top = () => stack[stack.length - 1];
  const inRaw = () => top()?.kind === 'brace' && !!top().raw;
  const isTextBrace = (f: Frame) => f.kind === 'brace' && !!f.owner && TEXT_ARGUMENT.has(f.owner);

  const describe = (f: Frame) => (f.kind === 'brace' && f.owner && f.named ? `\\${f.owner}{` : f.token);

  const closingFor = (f: Frame): string => {
    if (f.kind === 'brace') return '}';
    if (f.kind === 'math') return MATH_CLOSER[f.token];
    if (f.kind === 'env') return `\\end{${f.name}}`;
    const right = RIGHT_DELIMITER[f.token.slice('\\left'.length)];
    return right ? `\\right${right}` : '\\right';
  };

  const reportUnclosed = (f: Frame, reason: Reason) => {
    const what = describe(f);
    const close = closingFor(f);
    const where =
      reason.kind === 'eof'
        ? 'is never closed'
        : reason.kind === 'paragraph'
          ? 'is not closed before the paragraph ends'
          : `is not closed before ${reason.token}${reason.line !== f.line ? ` on line ${reason.line}` : ''}`;
    let detail: string;
    if (f.kind === 'env' && f.name === 'document') {
      add({
        rule: 'missing-end-document',
        line: f.line,
        column: f.column,
        endColumn: f.endColumn,
        severity: 'error',
        message: '\\end{document} is missing',
        detail: 'TeX reaches the end of the file before the document ends and stops without a PDF. Add \\end{document} as the last line.',
        opener: true,
      });
      return;
    }
    if (f.kind === 'brace') {
      detail =
        reason.kind === 'paragraph'
          ? `The argument of \\${f.owner} cannot contain a blank line. TeX stops at the blank line, or reads on to the end of the file if no } follows. Add the missing } before the blank line.`
          : reason.kind === 'eof'
            ? 'TeX reads to the end of the file looking for the matching } and stops without a PDF. Add } where the group should end.'
            : `Add the missing } before ${reason.token}.`;
    } else if (f.kind === 'math') {
      detail =
        reason.kind === 'paragraph'
          ? `Math has to end in the paragraph it starts in; TeX reports "Missing $ inserted". Add the closing ${close}.`
          : reason.kind === 'eof'
            ? `Add the closing ${close}.`
            : `Add the closing ${close} before ${reason.token}.`;
    } else if (f.kind === 'left') {
      detail = `Every \\left needs a \\right in the same formula; TeX reports "Missing \\right. inserted". Add ${close}, or \\right. for an invisible one.`;
    } else if (VERBATIM_ENVS.has(f.name!)) {
      detail = `TeX reads everything after it as literal text, looking for ${close} on a line of its own, and stops at the end of the file without a PDF.`;
    } else if (reason.kind === 'closer' && reason.token.startsWith('\\end')) {
      detail = `TeX reports "\\begin{${f.name}} on input line ${f.line} ended by ${reason.token}". Add ${close} before ${reason.token}.`;
    } else {
      detail =
        reason.kind === 'closer'
          ? `Add ${close} before ${reason.token}.`
          : `TeX reaches the end of the file with the environment still open. Add ${close} where it should end.`;
    }
    const rule: StructureRule =
      f.kind === 'brace' ? 'unclosed-brace' : f.kind === 'math' ? 'unclosed-math' : f.kind === 'left' ? 'unclosed-left' : 'unclosed-environment';
    add({ rule, line: f.line, column: f.column, endColumn: f.endColumn, severity: 'error', message: `${what} ${where}`, detail, opener: true });
  };

  /** Reports and removes every frame from index `from` up. */
  const cut = (from: number, reason: Reason) => {
    for (const f of stack.splice(from)) reportUnclosed(f, reason);
  };

  const pushBrace = (line: number, col: number) => {
    let raw = inRaw();
    if (!raw && rawPending && rawPending.depth === stack.length) {
      raw = true;
      if (--rawPending.count === 0) rawPending = null;
    }
    const owner = !raw && arg.owner && arg.depth === stack.length && !arg.optional ? arg.owner : null;
    stack.push({ kind: 'brace', line, column: col, endColumn: col + 1, token: '{', owner, named: !arg.gap, raw, saved: arg });
    arg = { owner: null, depth: stack.length, optional: false };
  };

  /**
   * Finds the opener a closer belongs to, looking down the stack past the
   * frames `skip` allows. Those frames are reported as not closed and
   * removed, together with the opener. Returns false and changes nothing
   * when there is no such opener.
   */
  const closeDown = (isOpener: (f: Frame) => boolean, skip: (f: Frame) => boolean, closer: Reason & { kind: 'closer' }) => {
    for (let k = stack.length - 1; k >= 0; k--) {
      const f = stack[k];
      if (isOpener(f)) {
        cut(k + 1, closer);
        stack.pop();
        if (f.kind === 'brace') arg = f.saved!;
        return true;
      }
      if (!skip(f)) return false;
    }
    return false;
  };

  /** A blank line or \par: math, \left and short arguments cannot run past it. */
  const paragraphBreak = (line: number) => {
    if (inRaw()) return;
    rawPending = null;
    cutBrace = null;
    arg = { owner: null, depth: stack.length, optional: false };
    const k = stack.findIndex(
      (f) => f.kind === 'math' || f.kind === 'left' || (f.kind === 'brace' && !f.raw && !!f.owner && SHORT_ARGUMENT.has(f.owner))
    );
    if (k < 0) return;
    reportUnclosed(stack[k], { kind: 'paragraph' });
    if (stack[k].kind === 'brace') cutBrace = { frame: stack[k], line };
    // Whatever was opened inside it ends with it; one mark is enough.
    stack.length = k;
  };

  const hasDocumentClass = () => lines.some((l) => /\\documentclass(?![A-Za-z@])/.test(l.code));

  /** Whether `\end{name}` follows (line index, column) in the raw text. */
  const verbatimCloses = (index: number, from: number, name: string) => {
    const tag = `\\end{${name}}`;
    if (lines[index].raw.indexOf(tag, from) >= 0) return true;
    for (let k = index + 1; k < lines.length; k++) if (lines[k].raw.includes(tag)) return true;
    return false;
  };

  let previousBlank = false;
  scan: for (let li = 0; li < lines.length; li++) {
    const n = li + 1;
    const { raw, code } = lines[li];
    const trailingEmpty = li === lines.length - 1 && raw === '';
    const blankLine = !lines[li].verbatim && !trailingEmpty && /^[ \t]*$/.test(raw);
    // Several blank lines in a row end one paragraph.
    if (blankLine && !previousBlank) paragraphBreak(n);
    previousBlank = blankLine;

    // The line break counts as a space between a command and its argument.
    if (arg.owner && !arg.optional) arg = { ...arg, gap: true };
    for (let i = 0; i < code.length; i++) {
      const ch = code[i];
      if (ch === ' ' || ch === '\t') {
        if (arg.owner && !arg.optional && !arg.gap) arg = { ...arg, gap: true };
        continue;
      }

      if (ch === '\\') {
        WORD.lastIndex = i + 1;
        const word = WORD.exec(code)?.[0];

        // Control symbol: \{ \} \$ \% \\ and the math delimiters \( \) \[ \]
        if (!word) {
          const sym = code[i + 1];
          i++;
          if (sym === undefined) continue;
          arg = { owner: null, depth: stack.length, optional: false };
          if (inRaw()) continue;
          const at = { line: n, column: i, endColumn: i + 2 };
          if (sym === '(' || sym === '[') {
            stack.push({ kind: 'math', ...at, token: `\\${sym}` });
          } else if (sym === ')' || sym === ']') {
            const opener = sym === ')' ? '\\(' : '\\[';
            const token = `\\${sym}`;
            const closed = closeDown(
              (f) => f.kind === 'math' && f.token === opener,
              (f) => f.kind === 'left' || f.kind === 'math' || (f.kind === 'brace' && !isTextBrace(f)),
              { kind: 'closer', token, line: n }
            );
            if (!closed) {
              add({
                rule: 'extra-math-close',
                ...at,
                severity: 'error',
                message: `${token} has no matching ${opener}`,
                detail: `Math is not open here, so TeX reports "Bad math environment delimiter". Delete it or add ${opener} where the formula starts.`,
              });
            }
          }
          continue;
        }

        const end = i + 1 + word.length;
        const start = i;
        i = end - 1;

        if (word === 'begin' || word === 'end') {
          ENV_NAME.lastIndex = end;
          const m = ENV_NAME.exec(code);
          if (!m) {
            arg = { owner: word, depth: stack.length, optional: false };
            continue;
          }
          const name = m[1];
          const stop = end + m[0].length;
          const token = `\\${word}{${name}}`;
          const at = { line: n, column: start + 1, endColumn: stop + 1 };
          i = stop - 1;
          arg = { owner: null, depth: stack.length, optional: false };

          if (VERBATIM_ENVS.has(name)) {
            // The mask already blanked the body; only a missing \end matters.
            if (word === 'begin' && !inRaw() && !verbatimCloses(li, stop, name)) {
              reportUnclosed({ kind: 'env', ...at, token, name }, { kind: 'eof' });
            }
            continue;
          }

          if (name === 'document') {
            if (word === 'begin') {
              if (documentBegin) {
                add({
                  rule: 'duplicate-begin-document',
                  ...at,
                  severity: 'error',
                  message: `\\begin{document} appears a second time (first on line ${documentBegin.line})`,
                  detail: 'TeX reports "Can be used only in preamble". Delete one of them.',
                });
                continue;
              }
              // The preamble has to be closed before the document starts.
              cut(0, { kind: 'closer', token, line: n });
              rawPending = null;
              documentBegin = { kind: 'env', ...at, token, name };
              stack.push(documentBegin);
              continue;
            }
            const k = stack.findIndex((f) => f.kind === 'env' && f.name === 'document');
            if (k >= 0) {
              cut(k + 1, { kind: 'closer', token, line: n });
              stack.length = k;
            } else if (hasDocumentClass()) {
              add({
                rule: 'extra-end',
                ...at,
                severity: 'error',
                message: '\\end{document} has no matching \\begin{document}',
                detail: 'TeX reports "Missing \\begin{document}". Add \\begin{document} after the preamble.',
              });
            }
            // TeX stops reading here (in a file without \documentclass this
            // is the end of a document split over several files).
            documentEnd = { ...at, index: li, stop };
            break scan;
          }

          if (inRaw()) continue;

          if (word === 'begin') {
            stack.push({ kind: 'env', ...at, token, name });
            continue;
          }

          // \end{name}: the nearest open environment should be name.
          let nearest = -1;
          let match = -1;
          for (let k = stack.length - 1; k >= 0; k--) {
            if (stack[k].kind !== 'env') continue;
            if (nearest < 0) nearest = k;
            if (stack[k].name === name) {
              match = k;
              break;
            }
          }
          if (match >= 0) {
            cut(match + 1, { kind: 'closer', token, line: n });
            stack.length = match;
          } else if (nearest >= 0 && stack[nearest].name !== 'document') {
            const open = stack[nearest];
            add({
              rule: 'environment-mismatch',
              ...at,
              severity: 'error',
              message: `${token} does not match \\begin{${open.name}} on line ${open.line}`,
              detail: `TeX reports "\\begin{${open.name}} on input line ${open.line} ended by ${token}". Change one of the two names so they match.`,
            });
            add({
              rule: 'environment-mismatch',
              line: open.line,
              column: open.column,
              endColumn: open.endColumn,
              severity: 'error',
              message: `\\begin{${open.name}} is closed by ${token} on line ${n}`,
              detail: 'Change one of the two names so they match.',
              secondary: true,
            });
            cut(nearest + 1, { kind: 'closer', token, line: n });
            stack.length = nearest;
          } else {
            add({
              rule: 'extra-end',
              ...at,
              severity: 'error',
              message: `${token} has no matching \\begin{${name}}`,
              detail: documentBegin
                ? `TeX reports "\\begin{document} ended by ${token}". Delete it or add \\begin{${name}} where the environment starts.`
                : `Delete it or add \\begin{${name}} where the environment starts.`,
            });
          }
          continue;
        }

        if (inRaw()) continue;

        if (word === 'left' || word === 'right') {
          DELIMITER.lastIndex = end;
          const d = DELIMITER.exec(code);
          const stop = d ? end + d[0].length : end;
          const token = `\\${word}${d ? d[1] : ''}`;
          const at = { line: n, column: start + 1, endColumn: stop + 1 };
          i = stop - 1;
          arg = { owner: null, depth: stack.length, optional: false };
          if (word === 'left') {
            stack.push({ kind: 'left', ...at, token });
            continue;
          }
          const closed = closeDown(
            (f) => f.kind === 'left',
            (f) => f.kind === 'brace' && !isTextBrace(f),
            { kind: 'closer', token, line: n }
          );
          if (!closed) {
            add({
              rule: 'extra-right',
              ...at,
              severity: 'error',
              message: `${token} has no matching \\left`,
              detail: 'TeX reports "Extra \\right". Add a \\left before it in the same formula, or \\left. for an invisible one.',
            });
          }
          continue;
        }

        if (word === 'par') {
          paragraphBreak(n);
          continue;
        }

        const def = DEFINITIONS[word];
        if (def) {
          AFTER_DEFINITION.lastIndex = end;
          const next = AFTER_DEFINITION.exec(code)?.[1];
          rawPending = { count: next === '{' ? def[0] : def[1], depth: stack.length };
          arg = { owner: null, depth: stack.length, optional: false };
          continue;
        }

        arg = { owner: word, depth: stack.length, optional: false };
        continue;
      }

      if (ch === '{') {
        pushBrace(n, i + 1);
        continue;
      }

      if (ch === '}') {
        const closed = closeDown(
          (f) => f.kind === 'brace',
          (f) => f.kind === 'math' || f.kind === 'left',
          { kind: 'closer', token: '}', line: n }
        );
        if (closed) continue;
        if (cutBrace) {
          // Most likely the } that \textbf{ was waiting for, on the far side
          // of the blank line. Fixing that one fixes this one.
          const { frame, line } = cutBrace;
          cutBrace = null;
          add({
            rule: 'extra-brace',
            line: n,
            column: i + 1,
            endColumn: i + 2,
            severity: 'error',
            message: 'This } has no matching {',
            detail: `It probably belongs to ${describe(frame)} on line ${frame.line}, which the blank line on line ${line} cut off.`,
            secondary: true,
          });
          continue;
        }
        add({
          rule: 'extra-brace',
          line: n,
          column: i + 1,
          endColumn: i + 2,
          severity: 'error',
          message: 'This } has no matching {',
          detail: stack.some((f) => f.kind === 'env' && f.name !== 'document')
            ? 'TeX reports "Extra }, or forgotten \\endgroup". Delete it or add the missing {.'
            : 'TeX reports "Too many }\'s". Delete it or add the missing {.',
        });
        continue;
      }

      if (ch === '$') {
        const double = code[i + 1] === '$';
        if (inRaw()) {
          if (double) i++;
          continue;
        }
        arg = { owner: null, depth: stack.length, optional: false };
        // A $ closes the nearest open $ unless a text argument (\text{...})
        // lies in between, where it starts new math.
        const skip = (f: Frame) => f.kind === 'left' || (f.kind === 'brace' && !isTextBrace(f));
        if (closeDown((f) => f.kind === 'math' && f.token === '$', skip, { kind: 'closer', token: '$', line: n })) continue;
        if (double) {
          if (!closeDown((f) => f.kind === 'math' && f.token === '$$', skip, { kind: 'closer', token: '$$', line: n })) {
            stack.push({ kind: 'math', line: n, column: i + 1, endColumn: i + 3, token: '$$' });
          }
          i++;
          continue;
        }
        stack.push({ kind: 'math', line: n, column: i + 1, endColumn: i + 2, token: '$' });
        continue;
      }

      // Optional arguments and a star keep the command's arguments going:
      // \section*{...}, \includegraphics[width=3cm]{...}.
      if (ch === '[' && arg.owner && arg.depth === stack.length && !arg.optional) {
        arg = { ...arg, optional: true };
        continue;
      }
      if (ch === ']' && arg.optional && arg.depth === stack.length) {
        arg = { ...arg, optional: false };
        continue;
      }
      if (ch === '*' || arg.optional) continue;
      arg = { owner: null, depth: stack.length, optional: false };
    }
  }

  if (documentEnd) {
    // TeX ignores everything after \end{document}. A second one means the
    // text between the two is missing from the PDF.
    const again = /\\end\s*\{document\}/;
    const rest = [lines[documentEnd.index].code.slice(documentEnd.stop), ...lines.slice(documentEnd.index + 1).map((l) => l.code)];
    const hit = rest.findIndex((l) => again.test(l));
    if (hit >= 0) {
      const line = documentEnd.index + 1 + hit;
      add({
        rule: 'duplicate-end-document',
        line: documentEnd.line,
        column: documentEnd.column,
        endColumn: documentEnd.endColumn,
        severity: 'warning',
        message: `\\end{document} appears again on line ${line}`,
        detail: `TeX stops reading at this \\end{document}, so nothing after line ${documentEnd.line} is in the PDF. Delete the one that does not belong.`,
      });
    }
  } else {
    for (const f of stack) reportUnclosed(f, { kind: 'eof' });
  }

  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

/**
 * The findings to show with the cursor at (line, column), both 1-based. An
 * opener is hidden while the cursor is after it on the same line, so typing
 * \textbf{ or $ does not raise a mark before the user has had a chance to
 * close it.
 */
export function visibleStructureFindings(
  findings: StructureFinding[],
  cursor: { line: number; column: number } | null
): StructureFinding[] {
  if (!cursor) return findings;
  return findings.filter((f) => !(f.opener && f.line === cursor.line && cursor.column > f.column));
}
