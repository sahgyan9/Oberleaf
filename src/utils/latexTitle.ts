/**
 * Utility for extracting and sanitizing LaTeX \title{} to use as downloadable PDF filenames.
 */

export function isEscaped(str: string, index: number): boolean {
  let count = 0;
  for (let i = index - 1; i >= 0 && str[i] === '\\'; i--) {
    count++;
  }
  return count % 2 === 1;
}

/**
 * Remove LaTeX comments (% not preceded by \), preserving newlines.
 */
export function stripLatexComments(latex: string): string {
  if (!latex) return '';
  return latex.replace(/(^|[^\\])%.*$/gm, '$1');
}

/**
 * Strips \thanks{...} including nested braces.
 */
function removeThanks(content: string): string {
  const thanksRegex = /\\thanks\s*\{/g;
  let match: RegExpExecArray | null;
  let result = content;

  while ((match = thanksRegex.exec(result)) !== null) {
    const start = match.index;
    const braceStart = match.index + match[0].length;
    let depth = 1;
    let end = braceStart;

    for (let i = braceStart; i < result.length; i++) {
      const ch = result[i];
      if (ch === '{' && !isEscaped(result, i)) {
        depth++;
      } else if (ch === '}' && !isEscaped(result, i)) {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }

    result = result.substring(0, start) + result.substring(end);
    thanksRegex.lastIndex = start;
  }

  return result;
}

/**
 * Clean and normalize a raw LaTeX title string into a filesystem-safe title.
 */
export function cleanLatexTitle(raw: string): string | null {
  if (!raw) return null;

  let s = raw;

  // 1. Remove \thanks{...}
  s = removeThanks(s);

  // 2. Line breaks \\ or \newline
  s = s.replace(/\\\\(?:\s*\[[^\]]*\])?/g, ' ');
  s = s.replace(/\\newline\b/g, ' ');

  // 3. Known LaTeX logos
  s = s.replace(/\\LaTeX\b(?:\{\})?/g, 'LaTeX');
  s = s.replace(/\\TeX\b(?:\{\})?/g, 'TeX');

  // 4. Standalone formatting/layout macros without arguments
  s = s.replace(
    /\\(centering|raggedright|raggedleft|large|Large|LARGE|huge|Huge|small|footnotesize|scriptsize|tiny|bfseries|itshape|scshape|mdseries|upshape|bf|it|rm|sl|sf|tt)\b/g,
    ''
  );

  // 5. Unwrap commands with 1 curly argument like \textbf{...}, \textit{...}, \emph{...}, \text{...}
  let prev = '';
  let iterations = 0;
  while (prev !== s && iterations < 10) {
    prev = s;
    s = s.replace(/\\[a-zA-Z]+\*?\s*\{([^{}]*)\}/g, '$1');
    iterations++;
  }

  // 6. Math mode delimiters $...$
  s = s.replace(/\$([^$]+)\$/g, '$1');

  // 7. Unescape escaped characters like \&, \%, \$, \#, \_
  s = s.replace(/\\([$&%#_{}])/g, '$1');

  // 8. Strip any remaining backslash commands
  s = s.replace(/\\[a-zA-Z]+\*?/g, '');

  // 9. Remove any remaining unmatched curly braces
  s = s.replace(/[{}]/g, '');

  // 10. Tildes ~ as non-breaking spaces
  s = s.replace(/~/g, ' ');

  // 11. Sanitize invalid filesystem characters (especially on Windows: < > : " / \ | ? *)
  s = s.replace(/[:]/g, ' - ');
  s = s.replace(/[\\/]/g, '-');
  s = s.replace(/[<>"|?*]/g, '');

  // 12. Normalize whitespace and dashes
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/\s*-\s*-\s*/g, ' - ');
  s = s.trim();

  // 13. Trim leading/trailing dots, spaces, dashes (Windows filenames cannot end with . or space)
  s = s.replace(/^[\s.-]+|[\s.-]+$/g, '');

  // 14. Truncate if excessively long (e.g. > 120 chars), breaking at word boundary
  if (s.length > 120) {
    s = s.substring(0, 120).replace(/\s+\S*$/, '').trim();
    s = s.replace(/^[\s.-]+|[\s.-]+$/g, '');
  }

  return s.length > 0 ? s : null;
}

/**
 * Extracts the \title{...} from LaTeX document content.
 * Handles optional arguments (\title[...]{...}), balanced braces, and multi-line titles.
 */
export function extractLatexTitle(latexContent: string): string | null {
  if (!latexContent) return null;

  const noComments = stripLatexComments(latexContent);
  const match = /\\title(?:\s*\[[^\]]*\])?\s*\{/.exec(noComments);
  if (!match) return null;

  let depth = 1;
  const start = match.index + match[0].length;
  let end = start;

  for (let i = start; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch === '{' && !isEscaped(noComments, i)) {
      depth++;
    } else if (ch === '}' && !isEscaped(noComments, i)) {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const rawTitle = noComments.substring(start, end);
  return cleanLatexTitle(rawTitle);
}

/**
 * Sanitize a generic fallback string (e.g. project name) into a safe filename.
 */
export function sanitizeFilename(name: string, fallback: string = 'document'): string {
  if (!name || !name.trim()) return fallback;
  let s = name.trim();
  s = s.replace(/[:]/g, ' - ');
  s = s.replace(/[\\/]/g, '-');
  s = s.replace(/[<>"|?*]/g, '');
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/^[\s.-]+|[\s.-]+$/g, '');
  if (s.length > 120) {
    s = s.substring(0, 120).trim();
    s = s.replace(/^[\s.-]+|[\s.-]+$/g, '');
  }
  return s.length > 0 ? s : fallback;
}

/**
 * Get the full PDF download filename (ending with .pdf) based on the LaTeX content,
 * falling back to the project name or 'document.pdf'.
 */
export function getLatexPdfFilename(latexContent?: string | null, fallbackName?: string): string {
  const extracted = latexContent ? extractLatexTitle(latexContent) : null;
  if (extracted) {
    return `${extracted}.pdf`;
  }
  const safeFallback = sanitizeFilename(fallbackName || 'document');
  return `${safeFallback}.pdf`;
}
