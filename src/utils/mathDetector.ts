export interface MathContext {
  math: string;
  displayMode: boolean;
}

const MATH_ENVS = [
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
  'split',
  'math',
  'displaymath',
];

/**
 * Strips LaTeX labels, tags, and comments so KaTeX can render smoothly without throwing errors.
 */
export function cleanMathForKaTeX(math: string): string {
  return math
    .replace(/%.*$/gm, '') // Strip LaTeX comments
    .replace(/\\label\{[^}]*\}/g, '') // Strip \label{...}
    .replace(/\\tag\{[^}]*\}/g, '') // Strip \tag{...}
    .trim();
}

/**
 * Accurately determines if cursor at `offset` is inside a valid LaTeX math construct.
 * Returns the math string and displayMode, or null if cursor is on plain text.
 */
export function extractMathAtPosition(text: string, offset: number): MathContext | null {
  if (!text || offset < 0 || offset > text.length) return null;

  // 1. Check Display Delimiters: \[ ... \]
  const lastDisplayOpen = text.lastIndexOf('\\[', offset);
  if (lastDisplayOpen !== -1) {
    const closeBefore = text.indexOf('\\]', lastDisplayOpen + 2);
    if (closeBefore === -1 || closeBefore >= offset) {
      const closeAfter = text.indexOf('\\]', offset);
      if (closeAfter !== -1) {
        // Ensure no nested/new open bracket intervened
        const nextOpen = text.indexOf('\\[', lastDisplayOpen + 2);
        if (nextOpen === -1 || nextOpen >= closeAfter) {
          const rawMath = text.substring(lastDisplayOpen + 2, closeAfter);
          const cleaned = cleanMathForKaTeX(rawMath);
          if (cleaned.length > 0) {
            return { math: cleaned, displayMode: true };
          }
        }
      }
    }
  }

  // 2. Check Display Delimiters: $$ ... $$
  let lastDoubleDollar = -1;
  let i = 0;
  while (i < offset) {
    if (text[i] === '\\' && text[i + 1] === '$') {
      i += 2;
      continue;
    }
    if (text[i] === '$' && text[i + 1] === '$') {
      lastDoubleDollar = i;
      i += 2;
      continue;
    }
    i++;
  }
  if (lastDoubleDollar !== -1) {
    const closeDouble = text.indexOf('$$', lastDoubleDollar + 2);
    if (closeDouble !== -1 && offset >= lastDoubleDollar && offset <= closeDouble + 2) {
      const rawMath = text.substring(lastDoubleDollar + 2, closeDouble);
      const cleaned = cleanMathForKaTeX(rawMath);
      if (cleaned.length > 0) {
        return { math: cleaned, displayMode: true };
      }
    }
  }

  // 3. Check LaTeX Environments: \begin{ENV} ... \end{ENV}
  // Find all matching math environments
  const envPattern = new RegExp(
    `\\\\begin\\{(${MATH_ENVS.map((e) => e.replace('*', '\\*')).join('|')})\\}`,
    'g'
  );

  let match: RegExpExecArray | null;
  let activeEnv: { name: string; start: number; contentStart: number; end: number } | null = null;

  while ((match = envPattern.exec(text)) !== null) {
    if (match.index <= offset) {
      const envName = match[1];
      const endTag = `\\end{${envName}}`;
      const endIdx = text.indexOf(endTag, match.index + match[0].length);

      // Environment is open and extends past or to the cursor
      if (endIdx !== -1) {
        const fullEnd = endIdx + endTag.length;
        if (offset <= fullEnd) {
          activeEnv = {
            name: envName,
            start: match.index,
            contentStart: match.index + match[0].length,
            end: endIdx,
          };
        }
      }
    } else {
      break;
    }
  }

  if (activeEnv) {
    // KaTeX handles \begin{align}, \begin{equation}, etc. with displayMode: true
    const wholeEnv = text.substring(activeEnv.start, activeEnv.end + `\\end{${activeEnv.name}}`.length);
    const cleaned = cleanMathForKaTeX(wholeEnv);
    if (cleaned.length > 0) {
      return { math: cleaned, displayMode: true };
    }
  }

  // 4. Check Delimiters: \( ... \)
  const lastInlineParen = text.lastIndexOf('\\(', offset);
  if (lastInlineParen !== -1) {
    const closeBefore = text.indexOf('\\)', lastInlineParen + 2);
    if (closeBefore === -1 || closeBefore >= offset) {
      const closeAfter = text.indexOf('\\)', offset);
      if (closeAfter !== -1) {
        const nextOpen = text.indexOf('\\(', lastInlineParen + 2);
        if (nextOpen === -1 || nextOpen >= closeAfter) {
          const rawMath = text.substring(lastInlineParen + 2, closeAfter);
          const cleaned = cleanMathForKaTeX(rawMath);
          if (cleaned.length > 0) {
            return { math: cleaned, displayMode: false };
          }
        }
      }
    }
  }

  // 5. Check Inline Math on Current Line: $ ... $
  const lineStart = text.lastIndexOf('\n', offset - 1) + 1;
  let lineEnd = text.indexOf('\n', offset);
  if (lineEnd === -1) lineEnd = text.length;

  const lineText = text.substring(lineStart, lineEnd);
  const lineOffset = offset - lineStart;

  let inDollar = false;
  let dollarStart = -1;
  let idx = 0;

  while (idx < lineText.length) {
    // Skip escaped dollar
    if (lineText[idx] === '\\' && lineText[idx + 1] === '$') {
      idx += 2;
      continue;
    }
    // Skip double dollar (handled in step 2)
    if (lineText[idx] === '$' && lineText[idx + 1] === '$') {
      idx += 2;
      continue;
    }

    if (lineText[idx] === '$') {
      if (!inDollar) {
        inDollar = true;
        dollarStart = idx;
      } else {
        inDollar = false;
        const dollarEnd = idx;
        // Cursor is strictly within this pair: [dollarStart, dollarEnd]
        if (lineOffset >= dollarStart && lineOffset <= dollarEnd) {
          const rawMath = lineText.substring(dollarStart + 1, dollarEnd);
          const cleaned = cleanMathForKaTeX(rawMath);
          if (cleaned.length > 0) {
            return { math: cleaned, displayMode: false };
          }
        }
      }
    }
    idx++;
  }

  // Cursor is in plain text
  return null;
}
