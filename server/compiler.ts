import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { extractLatexTitle } from './latexTitle.js';

export interface SuggestedFix {
  type: 'add_preamble' | 'install_package' | 'wrap_math_mode' | 'replace_line';
  packageName?: string;
  codeSnippet: string;
  label: string;
  description: string;
  line?: number;
  targetEnvironment?: string;
  /** For replace_line: the exact source line to find */
  find?: string;
  /** For replace_line: the replacement text (empty string = delete the line) */
  replace?: string;
}

export interface DetectedMissingPackage {
  packageName: string;
  codeSnippet: string;
  label: string;
  description: string;
}

export interface CompileError {
  file: string;
  line: number;
  message: string;
  friendlyExplanation?: string;
  suggestedFix?: SuggestedFix;
  isCascading?: boolean;
  cascadingFromLine?: number;
  raw: string;
}

export interface CompileResult {
  success: boolean;
  pdfUrl?: string;
  durationMs: number;
  errors: CompileError[];
  warnings: string[];
  rawLog: string;
  documentTitle?: string;
  pdfDownloadFilename?: string;
  detectedMissingPackages?: DetectedMissingPackage[];
}

// Don Norman Error Translator: maps cryptic TeX errors to helpful human advice
function translateTeXError(rawText: string): string {
  // Normalize line wrapping (TeX wraps at 79 columns, splitting words across lines)
  const raw = rawText.replace(/\r?\n\s*/g, ' ').replace(/\s+/g, ' ');

  // Figure not found detection
  const figureNotFound =
    raw.match(/File `([^']+)'\s+not found/i) ||
    raw.match(/File '([^']+)'\s+not found/i) ||
    raw.match(/File `([^']+)'\s+n\s*ot found/i);

  if (figureNotFound) {
    const file = figureNotFound[1].trim();
    const isImage =
      /\.(png|jpe?g|pdf|svg|webp|eps)$/i.test(file) ||
      file.startsWith('figures/') ||
      file.startsWith('figures\\');

    if (file === 'graphicx.sty') {
      return "The 'graphicx' package is missing. Add \\usepackage{graphicx} to your LaTeX preamble.";
    }
    if (isImage) {
      return `Figure could not be found.\nExpected: ${file}\nCheck that the image exists in the project and that the LaTeX path matches the File Tree.`;
    }
    return `Missing package or file: "${file}". If it's a LaTeX package, verify \\usepackage or install it via your TeX package manager.`;
  }

  // Corrupted or invalid image
  if (
    raw.includes('libpng: internal error') ||
    raw.includes('libpng error') ||
    (raw.includes('pdfTeX error') && raw.includes('.png'))
  ) {
    return 'Corrupted or invalid image file. The image file exists but cannot be read by pdfTeX. Try re-exporting or re-uploading the image.';
  }

  // Cannot determine size of graphic
  if (raw.includes('Cannot determine size of graphic') || raw.includes('no BoundingBox')) {
    return 'Cannot determine size of graphic. Ensure \\usepackage{graphicx} is included and the image format is supported (PNG, JPEG, PDF).';
  }

  // Missing graphicx command
  if (raw.includes('Undefined control sequence') && raw.includes('\\includegraphics')) {
    return 'The \\includegraphics command is unrecognized. Make sure you have \\usepackage{graphicx} in your document preamble.';
  }

  if (raw.includes('Undefined control sequence')) {
    return 'Typo or unrecognized command. Check the command name right after the line number.';
  }
  if (raw.includes('Missing $ inserted')) {
    const mathEnvMatch = raw.match(/\\begin\{(bmatrix|pmatrix|vmatrix|Vmatrix|Bmatrix|matrix|cases|aligned|gathered|split)\}/i);
    if (mathEnvMatch) {
      return `The \\begin{${mathEnvMatch[1]}} environment must be used inside math mode. Wrap it in display math (\\[ ... \\]) or \\begin{equation}.`;
    }
    return 'Mathematical symbol used outside of a math environment. Wrap the formula in $...$ or \\begin{equation}.';
  }
  if (raw.includes('Emergency stop')) {
    return 'LaTeX encountered a fatal syntax error and halted. Check your latest typed line.';
  }
  if (raw.includes('Runaway argument')) {
    return "Unclosed bracket '{' or parenthesis. A command didn't find its closing delimiter.";
  }
  return 'Review the line indicated for syntax errors.';
}

export const COMMON_PACKAGE_RULES: Array<{
  packageName: string;
  codeSnippet: string;
  pattern: RegExp;
  description: string;
}> = [
  {
    packageName: 'amsmath',
    codeSnippet: '\\usepackage{amsmath}',
    pattern: /\\begin\{(align\*?|gather\*?|multline\*?|bmatrix|pmatrix|vmatrix|Vmatrix|Bmatrix|aligned|gathered)\}|\\(eqref|DeclareMathOperator|substack)\b/,
    description: 'Provides advanced math environments, matrix notation, and \\eqref references.',
  },
  {
    packageName: 'graphicx',
    codeSnippet: '\\usepackage{graphicx}',
    pattern: /\\includegraphics\b/,
    description: 'Enables embedding figures and scaling graphics.',
  },
  {
    packageName: 'xcolor',
    codeSnippet: '\\usepackage{xcolor}',
    pattern: /\\(textcolor|definecolor|colorlet|pagecolor)\b|\\color\{/,
    description: 'Provides text and background color commands.',
  },
  {
    packageName: 'booktabs',
    codeSnippet: '\\usepackage{booktabs}',
    pattern: /\\(toprule|midrule|bottomrule|cmidrule)\b/,
    description: 'High-quality table rules (\\toprule, \\midrule, \\bottomrule).',
  },
  {
    packageName: 'hyperref',
    codeSnippet: '\\usepackage{hyperref}',
    pattern: /\\(href|url|hypersetup|autoref)\b/,
    description: 'Clickable hyperlinks, URLs, and cross-references.',
  },
  {
    packageName: 'listings',
    codeSnippet: '\\usepackage{listings}',
    pattern: /\\begin\{lstlisting\}|\\(lstinline|lstset)\b/,
    description: 'Syntax-highlighted source code listings and inline code blocks.',
  },
  {
    packageName: 'tikz',
    codeSnippet: '\\usepackage{tikz}',
    pattern: /\\begin\{tikzpicture\}|\\tikz\b/,
    description: 'Vector graphics and programmatic diagrams.',
  },
  {
    packageName: 'tabularx',
    codeSnippet: '\\usepackage{tabularx}',
    pattern: /\\begin\{tabularx\}/,
    description: 'Auto-sizing table columns matching text width.',
  },
  {
    packageName: 'amssymb',
    codeSnippet: '\\usepackage{amssymb}',
    pattern: /\\(mathbb|checkmark|subseteqq|subsetneq|triangleq|mathbbm)\b/,
    description: 'Extended mathematical symbols and blackboard bold fonts.',
  },
  {
    packageName: 'siunitx',
    codeSnippet: '\\usepackage{siunitx}',
    pattern: /\\(SI|si|qty|ang|num|unit)\b/,
    description: 'Consistent scientific units and numeric formatting.',
  },
];

export function scanMissingPackages(source: string): DetectedMissingPackage[] {
  if (!source || typeof source !== 'string') return [];

  // Extract preamble (before \begin{document})
  const beginDocIdx = source.indexOf('\\begin{document}');
  const preamble = beginDocIdx !== -1 ? source.slice(0, beginDocIdx) : source;

  const missing: DetectedMissingPackage[] = [];

  for (const rule of COMMON_PACKAGE_RULES) {
    const isDeclared = new RegExp(`\\\\usepackage(?:\\[.*?\\])?\\{${rule.packageName}\\}`, 'i').test(preamble);
    if (!isDeclared) {
      if (rule.pattern.test(source)) {
        missing.push({
          packageName: rule.packageName,
          codeSnippet: rule.codeSnippet,
          label: `Add \\usepackage{${rule.packageName}}`,
          description: rule.description,
        });
      }
    }
  }

  return missing;
}

// Intelligent Quick-Fix Engine: Detects missing packages, unescaped macros, and math environment wraps
export function detectSuggestedFix(rawText: string, message: string = '', lineNumber: number = 0): SuggestedFix | undefined {
  const combined = `${message} ${rawText}`.replace(/\r?\n\s*/g, ' ').replace(/\s+/g, ' ');
  const isUndefinedCtrl = /Undefined control sequence/i.test(combined);

  // 0. Inner Math Mode Wrapping (e.g. \begin{bmatrix} or \begin{cases} outside math mode)
  const mathEnvMatch = combined.match(/\\begin\{(bmatrix|pmatrix|vmatrix|Vmatrix|Bmatrix|matrix|cases|aligned|gathered|split)\}/i);
  if (
    (/Missing \$ inserted/i.test(combined) ||
      /Display math should end with/i.test(combined) ||
      /Bad math environment delimiter/i.test(combined) ||
      /LaTeX Error: \w+ not in outer par mode/i.test(combined)) &&
    mathEnvMatch
  ) {
    const envName = mathEnvMatch[1];
    return {
      type: 'wrap_math_mode',
      packageName: 'amsmath',
      targetEnvironment: envName,
      line: lineNumber,
      codeSnippet: `\\[\n\\begin{${envName}}\n...\n\\end{${envName}}\n\\]`,
      label: `Wrap in \\[ ... \\]`,
      description: `The \\begin{${envName}} environment requires math mode. Wrap it in display math mode (\\[ ... \\]).`,
    };
  }

  // 1. Math packages (amsmath)
  if (
    /Environment\s+(align\*?|gather\*?|multline\*?|bmatrix|pmatrix|vmatrix|Vmatrix|Bmatrix|aligned|gathered)\s+undefined/i.test(combined) ||
    (isUndefinedCtrl && /\\(eqref|DeclareMathOperator|substack)\b/i.test(combined))
  ) {
    return {
      type: 'add_preamble',
      packageName: 'amsmath',
      codeSnippet: '\\usepackage{amsmath}',
      label: 'Add \\usepackage{amsmath}',
      description: 'Provides advanced multi-line equations, matrices, and \\eqref references.',
    };
  }

  // 2. Graphics package (graphicx)
  if (
    (isUndefinedCtrl && /\\includegraphics\b/i.test(combined)) ||
    /Cannot determine size of graphic/i.test(combined) ||
    /File ['`]graphicx\.sty['`]\s+not found/i.test(combined)
  ) {
    return {
      type: 'add_preamble',
      packageName: 'graphicx',
      codeSnippet: '\\usepackage{graphicx}',
      label: 'Add \\usepackage{graphicx}',
      description: 'Required for embedding figures, images, and scaling graphic elements.',
    };
  }

  // 3. Hyperlinks & URLs (hyperref)
  if (isUndefinedCtrl && /\\(href|url|hypersetup|autoref)\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'hyperref',
      codeSnippet: '\\usepackage{hyperref}',
      label: 'Add \\usepackage{hyperref}',
      description: 'Enables clickable hyperlinks, web URLs, and cross-references.',
    };
  }

  // 4. Booktabs for professional tables
  if (isUndefinedCtrl && /\\(toprule|midrule|bottomrule|cmidrule)\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'booktabs',
      codeSnippet: '\\usepackage{booktabs}',
      label: 'Add \\usepackage{booktabs}',
      description: 'Required for high-quality table rules (\\toprule, \\midrule, \\bottomrule).',
    };
  }

  // 5. Code Listings (listings)
  if (
    /Environment\s+lstlisting\s+undefined/i.test(combined) ||
    (isUndefinedCtrl && /\\(lstinline|lstset)\b/i.test(combined))
  ) {
    return {
      type: 'add_preamble',
      packageName: 'listings',
      codeSnippet: '\\usepackage{listings}',
      label: 'Add \\usepackage{listings}',
      description: 'Provides syntax-highlighted source code listings and inline code blocks.',
    };
  }

  // 6. Colors (xcolor)
  if (
    isUndefinedCtrl &&
    (/\\(definecolor|textcolor|colorbox|pagecolor)\b/i.test(combined) ||
      (/\\color\b/i.test(combined) && !combined.includes('\\colortbl')))
  ) {
    return {
      type: 'add_preamble',
      packageName: 'xcolor',
      codeSnippet: '\\usepackage{xcolor}',
      label: 'Add \\usepackage{xcolor}',
      description: 'Enables colored text, background highlighting, and custom color definitions.',
    };
  }

  // 7. TikZ diagrams
  if (
    /Environment\s+tikzpicture\s+undefined/i.test(combined) ||
    (isUndefinedCtrl && /\\(tikz|node)\b/i.test(combined))
  ) {
    return {
      type: 'add_preamble',
      packageName: 'tikz',
      codeSnippet: '\\usepackage{tikz}',
      label: 'Add \\usepackage{tikz}',
      description: 'Powerful graphics toolkit for programmatic diagrams, plots, and charts.',
    };
  }

  // 8. Bold math (bm)
  if (isUndefinedCtrl && /\\(bm|boldsymbol)\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'bm',
      codeSnippet: '\\usepackage{bm}',
      label: 'Add \\usepackage{bm}',
      description: 'Provides true bold font formatting for mathematical symbols.',
    };
  }

  // 9. Subcaptions / Subfigures
  if (
    /Environment\s+(subfigure|subtable)\s+undefined/i.test(combined) ||
    (isUndefinedCtrl && /\\subcaption/i.test(combined))
  ) {
    return {
      type: 'add_preamble',
      packageName: 'subcaption',
      codeSnippet: '\\usepackage{subcaption}',
      label: 'Add \\usepackage{subcaption}',
      description: 'Supports multi-panel subfigures and subtables with independent captions.',
    };
  }

  // 10. SI Units (siunitx)
  if (isUndefinedCtrl && /\\(SI|si|qty|unit|num)\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'siunitx',
      codeSnippet: '\\usepackage{siunitx}',
      label: 'Add \\usepackage{siunitx}',
      description: 'Standardized typesetting for physical quantities and SI units.',
    };
  }

  // 11. Multirow tables
  if (isUndefinedCtrl && /\\multirow\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'multirow',
      codeSnippet: '\\usepackage{multirow}',
      label: 'Add \\usepackage{multirow}',
      description: 'Enables table cells that span across multiple rows.',
    };
  }

  // 12. Geometry
  if (isUndefinedCtrl && /\\(geometry|newgeometry)\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'geometry',
      codeSnippet: '\\usepackage{geometry}',
      label: 'Add \\usepackage{geometry}',
      description: 'Configures paper margins, header spacing, and page orientation.',
    };
  }

  // 13. Microtype
  if (isUndefinedCtrl && /\\microtypesetup\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'microtype',
      codeSnippet: '\\usepackage{microtype}',
      label: 'Add \\usepackage{microtype}',
      description: 'Micro-typographic optimization for cleaner line-breaking and spacing.',
    };
  }

  // 14. Lipsum placeholder
  if (isUndefinedCtrl && /\\lipsum\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'lipsum',
      codeSnippet: '\\usepackage{lipsum}',
      label: 'Add \\usepackage{lipsum}',
      description: 'Generates standard dummy placeholder paragraphs.',
    };
  }

  // 15. Algorithms (algorithm2e)
  if (
    /Environment\s+(algorithm|algorithmic)\s+undefined/i.test(combined) ||
    (isUndefinedCtrl && /\\(Require|Ensure|State)\b/i.test(combined))
  ) {
    return {
      type: 'add_preamble',
      packageName: 'algorithm2e',
      codeSnippet: '\\usepackage[ruled,vlined]{algorithm2e}',
      label: 'Add \\usepackage{algorithm2e}',
      description: 'Provides environments and formatting for pseudocode and algorithms.',
    };
  }

  // 16. Cleveref
  if (isUndefinedCtrl && /\\(cref|Cref)\b/i.test(combined)) {
    return {
      type: 'add_preamble',
      packageName: 'cleveref',
      codeSnippet: '\\usepackage{cleveref}',
      label: 'Add \\usepackage{cleveref}',
      description: 'Intelligent cross-referencing that automatically names referenced objects.',
    };
  }

  // 17. Missing system .sty file
  const styMatch = combined.match(/File ['`]([a-zA-Z0-9_\-]+)\.sty['`]\s+not found/i);
  if (styMatch) {
    const pkg = styMatch[1];
    return {
      type: 'install_package',
      packageName: pkg,
      codeSnippet: `\\usepackage{${pkg}}`,
      label: `Install '${pkg}' package`,
      description: `Package file '${pkg}.sty' is missing from your LaTeX system distribution.`,
    };
  }

  return undefined;
}

// Reconstructs messages that TeX hard-wraps at 79 columns or across linebreaks
function extractFullErrorMessage(initialMsg: string, subsequentLines: string[], fullLine: string): string {
  let msg = initialMsg;

  for (let k = 0; k < Math.min(subsequentLines.length, 3); k++) {
    const next = subsequentLines[k];
    if (!next || next.trim() === '') break;
    // Stop if next line is a new error indicator, file location, or TeX line pointer
    if (
      next.startsWith('! ') ||
      /^[A-Za-z]:.*?:\d+:/.test(next) ||
      /^l\.\d+/.test(next) ||
      /^<inserted text>/.test(next) ||
      next.startsWith('See the LaTeX manual') ||
      next.startsWith('Type  H <return>') ||
      next.startsWith('Your command was ignored')
    ) {
      break;
    }

    if (fullLine.length >= 78 || /:\s*$/.test(msg) || !/[.!?]$/.test(msg)) {
      if (msg.endsWith(' ') || /:\s*$/.test(msg)) {
        msg = msg.trim() + ' ' + next.trim();
      } else {
        msg = msg + next.trim();
      }
      if (/[.!?]$/.test(msg)) {
        break;
      }
    } else {
      break;
    }
  }

  return msg.trim();
}

export function parseLatexLog(
  logContent: string,
  sourceLines?: string[],
  projectDir?: string
): { errors: CompileError[]; warnings: string[] } {
  const errors: CompileError[] = [];
  const warnings: string[] = [];
  const lines = logContent.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File-line-error format: ./main.tex:24: Undefined control sequence.
    // The optional leading drive letter matters on Windows, where the engine
    // reports absolute paths like C:\project\main.tex:24: and a naive
    // [^:]+ pattern stops dead at the drive colon.
    const fileLineMatch = line.match(
      /^((?:[A-Za-z]:)?[^:]*?\.(?:tex|sty|cls|bib)):(\d+):\s*(.*)$/
    );
    if (fileLineMatch) {
      const [, file, lineStr, rawMessage] = fileLineMatch;
      const fullMessage = extractFullErrorMessage(rawMessage, lines.slice(i + 1, i + 4), line);
      // Combine with next lines in case TeX wrapped the message or put macro on next line
      const nextLines = lines.slice(i + 1, i + 6).join(' ');
      const combined = `${fullMessage} ${nextLines}`;
      const raw = lines.slice(i, i + 5).join('\n');
      errors.push({
        file,
        line: parseInt(lineStr, 10),
        message: fullMessage,
        friendlyExplanation: translateTeXError(combined),
        suggestedFix: detectSuggestedFix(combined, fullMessage, parseInt(lineStr, 10)),
        raw,
      });
      continue;
    }

    // Classic '! ...' TeX error format
    if (line.startsWith('! ')) {
      const rawMessage = line.substring(2);
      const fullMessage = extractFullErrorMessage(rawMessage, lines.slice(i + 1, i + 4), line);
      let lineNumber = 0;
      let file = 'main.tex';

      // Look ahead for "l.<number>"
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const lineMatch = lines[j].match(/^l\.(\d+)/);
        if (lineMatch) {
          lineNumber = parseInt(lineMatch[1], 10);
          break;
        }
      }

      const combined = `${fullMessage} ${lines.slice(i, i + 4).join(' ')}`;
      errors.push({
        file,
        line: lineNumber,
        message: fullMessage,
        friendlyExplanation: translateTeXError(combined),
        suggestedFix: detectSuggestedFix(combined, fullMessage, lineNumber),
        raw: lines.slice(i, i + 4).join('\n'),
      });
    }

    // pdfTeX fatal error format: !pdfTeX error: pdflatex (file ...): ...
    // "! LaTeX Error:" is deliberately NOT handled here: it already starts with
    // "! " and was captured above. Matching it twice reported every such error
    // as two separate cards in the UI.
    if (line.startsWith('!pdfTeX error:')) {
      const combined = lines.slice(i, i + 4).join(' ');
      errors.push({
        file: 'main.tex',
        line: 1,
        message: line.substring(1).trim(),
        friendlyExplanation: translateTeXError(combined),
        suggestedFix: detectSuggestedFix(combined, line, 1),
        raw: lines.slice(i, i + 4).join('\n'),
      });
    }

    // LaTeX Warnings
    if (line.includes('LaTeX Warning:')) {
      warnings.push(line.replace('LaTeX Warning:', '').trim());
    }
  }

  const uniqueErrors = dedupeErrors(errors);
  const enrichedErrors = sourceLines
    ? enrichErrorsWithSourceContext(uniqueErrors, sourceLines, projectDir)
    : uniqueErrors;

  return { errors: markCascadingErrors(enrichedErrors), warnings: [...new Set(warnings)] };
}

// TeX repeats itself: the same fault appears in the on-disk log and again in
// stdout, and a multi-pass build reports it once per pass. Collapse by the
// identity the user actually cares about.
function dedupeErrors(errors: CompileError[]): CompileError[] {
  const seen = new Set<string>();
  const unique: CompileError[] = [];

  for (const err of errors) {
    const key = `${err.file}:${err.line}:${err.message.trim()}`;
    if (seen.has(key)) {
      // Keep the entry that carries a usable line number
      const existing = unique.find(
        (e) => `${e.file}:${e.line}:${e.message.trim()}` === key
      );
      if (existing) {
        if (existing.line <= 0 && err.line > 0) {
          existing.line = err.line;
          existing.file = err.file;
        }
        if (!existing.suggestedFix && err.suggestedFix) {
          existing.suggestedFix = err.suggestedFix;
        }
      }
      continue;
    }
    seen.add(key);
    unique.push(err);
  }

  return unique;
}

// Identifies secondary errors cascading from the primary root error
function markCascadingErrors(errors: CompileError[]): CompileError[] {
  if (errors.length <= 1) return errors;

  const rootError = errors[0];

  return errors.map((err, idx) => {
    if (idx === 0) return err;

    // Detect if this subsequent error is a classic TeX cascade caused by the unresolved root error
    const isCascadePattern =
      /Misplaced alignment|Missing \$ inserted|ended by \\end|Undefined control sequence|Runaway argument|Extra \}|Missing \} inserted|Emergency stop/i.test(
        err.message
      );

    if (isCascadePattern && (rootError.suggestedFix || rootError.line > 0)) {
      return {
        ...err,
        isCascading: true,
        cascadingFromLine: rootError.line,
        friendlyExplanation: `Secondary error cascading from Line ${rootError.line}. Resolving the root issue on Line ${rootError.line} will fix this.`,
      };
    }

    return err;
  });
}

/**
 * Source-aware enrichment pass — runs AFTER log parsing and deduplication.
 * Inspects source code to remap misleading errors to their true source line,
 * provides clear plain-English explanations, and attaches 1-click Quick Fixes.
 */
function enrichErrorsWithSourceContext(
  errors: CompileError[],
  sourceLines: string[],
  projectDir?: string
): CompileError[] {
  // Pre-find author line with \And (if any)
  let authorLineIdx = -1;
  for (let i = 0; i < sourceLines.length; i++) {
    if (/\\author\b/.test(sourceLines[i])) {
      for (let j = i; j < Math.min(i + 15, sourceLines.length); j++) {
        if (/\\And\b/.test(sourceLines[j])) {
          authorLineIdx = j;
          break;
        }
        if (sourceLines[j].includes('}') && !sourceLines[j].includes('\\author')) break;
      }
    }
    if (authorLineIdx >= 0) break;
  }

  // Pre-find \maketitle line (if any)
  const maketitleLineIdx = sourceLines.findIndex((l) => /\\maketitle\b/.test(l));
  let authorFixAssigned = false;

  return errors.map((err) => {
    const lineIdx = (err.line ?? 0) - 1; // convert to 0-based

    // ── Pattern 1: \And used instead of \and in \author{} ─────────────────
    // Symptoms:
    // Case A: "Undefined control sequence" with \And nearby.
    // Case B: With amsmath loaded, \And is a math-symbol macro (\mathchar "3026).
    // When \maketitle renders the author block inside a tabular, TeX hits math mode
    // inside text mode and crashes with "Missing $ inserted" or "Extra }, or forgotten $"
    // on or right after \maketitle (often reported on a blank line!).
    if (authorLineIdx >= 0) {
      const isNearMaketitle =
        maketitleLineIdx >= 0 &&
        (Math.abs(lineIdx - maketitleLineIdx) <= 4 ||
          (lineIdx >= maketitleLineIdx && lineIdx <= maketitleLineIdx + 5));

      const isAndError =
        (/Undefined control sequence/i.test(err.message) &&
          /\\And\b/.test(sourceLines[lineIdx] || '')) ||
        ((/Missing \$ inserted|Extra \}|forgotten \$|Misplaced alignment tab/i.test(err.message)) &&
          isNearMaketitle);

      if (isAndError) {
        if (!authorFixAssigned) {
          authorFixAssigned = true;
          const actualLine = authorLineIdx + 1;
          const srcLine = sourceLines[authorLineIdx];
          const fixedLine = srcLine.replace(/\\And\b/g, '\\and');
          return {
            ...err,
            line: actualLine,
            message: `\\And used in \\author instead of \\and`,
            friendlyExplanation:
              `Line ${actualLine} uses \\And (capitalized) instead of \\and inside \\author{...}. ` +
              `In standard LaTeX document classes, multiple authors must be separated with lowercase \\and. ` +
              `Because amsmath is loaded, \\And is defined as a mathematical symbol, which caused \\maketitle to fail ` +
              `with "${err.message}" on line ${err.line}.`,
            suggestedFix: {
              type: 'replace_line' as const,
              codeSnippet: fixedLine,
              label: `Replace \\And with \\and (Line ${actualLine})`,
              description: `In \\author{...}, replace \\And with \\and to properly separate multiple authors.`,
              line: actualLine,
              find: srcLine,
              replace: fixedLine,
            },
          };
        } else {
          return {
            ...err,
            isCascading: true,
            cascadingFromLine: authorLineIdx + 1,
            friendlyExplanation: `Secondary error cascading from Line ${authorLineIdx + 1}. Resolving the root issue on Line ${authorLineIdx + 1} will fix this.`,
          };
        }
      }
    }

    // ── Pattern 2: \\ used outside a valid context / There's no line here to end ──
    // Symptoms: "There's no line here to end", "Missing $ inserted", or "Extra }, or forgotten $"
    // Real cause: \\ on the reported line, or on preceding lines (e.g. after \end{itemize},
    // after section titles, or standalone \\). TeX often reports this on the blank line following it.
    if (
      /There's no line here to end|Missing \$ inserted|Extra \}|forgotten \$/i.test(err.message)
    ) {
      const candidateIndices = [lineIdx, lineIdx - 1, lineIdx - 2].filter(
        (i) => i >= 0 && i < sourceLines.length
      );

      for (const idx of candidateIndices) {
        const srcLine = sourceLines[idx];
        const isIllegalNewline =
          /\\end\{[^}]+\}\s*\\\\+/.test(srcLine) || // \end{itemize}\\
          /^\s*\\\\+\s*$/.test(srcLine) || // standalone \\ or \\\\
          /\\(?:sub)*section\{[^}]+\}\s*\\\\+/.test(srcLine) || // \section{...}\\ or \subsection{...}\\
          /\S+.*\\\\{2,}\s*$/.test(srcLine); // text\\\\ (double backslash)

        if (isIllegalNewline) {
          const actualLine = idx + 1;
          const envMatch = srcLine.match(/\\end\{([^}]+)\}/);
          const isStandalone = /^\s*\\\\+\s*$/.test(srcLine);
          const isDoubleNewline = /\S+.*\\\\{2,}\s*$/.test(srcLine);
          const isHeading = /\\(?:sub)*section/.test(srcLine);

          const context = envMatch
            ? `after \\end{${envMatch[1]}}`
            : isStandalone
            ? 'as a standalone line break'
            : isHeading
            ? 'after a section heading'
            : isDoubleNewline
            ? 'as a double line break (\\\\\\\\)'
            : 'at the end of the line';

          const fixedLine = isStandalone
            ? ''
            : isDoubleNewline
            ? srcLine.replace(/\\\\{2,}\s*$/, '').trimEnd()
            : srcLine.replace(/\s*\\\\+\s*$/, '').trimEnd();

          return {
            ...err,
            line: actualLine,
            message: `Illegal \\\\ ${context}`,
            friendlyExplanation:
              `The \\\\ on line ${actualLine} is used ${context}, which is illegal in LaTeX. ` +
              `Line breaks (\\\\) can only be used inside running paragraph text or table cells — ` +
              `never after list environments (\\end{...}), section headings, or on blank lines. ` +
              `Remove \\\\ to fix this error.`,
            suggestedFix: {
              type: 'replace_line' as const,
              codeSnippet: fixedLine || '(delete line)',
              label: isStandalone
                ? `Delete \\\\ on line ${actualLine}`
                : `Remove \\\\ on line ${actualLine}`,
              description: `Remove the illegal \\\\ ${context} on line ${actualLine}.`,
              line: actualLine,
              find: srcLine,
              replace: fixedLine,
            },
          };
        }
      }
    }

    // ── Pattern 3: Missing image/graphic located in a subfolder ───────────────
    // Symptoms: "File '<name>' not found" or "Package pdftex.def Error: File '<name>' not found"
    // If the file actually exists inside figures/, images/, img/, assets/, etc.,
    // suggest updating the path in \includegraphics.
    const fileNotFoundMatch = err.message.match(
      /File [`']?([^`'\s:]+\.(?:png|jpe?g|pdf|eps))[`']?\s+not found/i
    );
    if (fileNotFoundMatch && projectDir) {
      const missingFile = fileNotFoundMatch[1].trim();
      const candidateDirs = ['figures', 'images', 'img', 'assets', 'graphics', 'photos'];
      let foundSubdir: string | null = null;

      for (const dir of candidateDirs) {
        const candidatePath = path.join(projectDir, dir, missingFile);
        if (fs.existsSync(candidatePath)) {
          foundSubdir = dir;
          break;
        }
      }

      if (foundSubdir) {
        const relativePath = `${foundSubdir}/${missingFile}`;
        let imgLineIdx = lineIdx;
        if (
          imgLineIdx < 0 ||
          imgLineIdx >= sourceLines.length ||
          !sourceLines[imgLineIdx].includes(missingFile)
        ) {
          imgLineIdx = sourceLines.findIndex((l) => l.includes(missingFile));
        }

        if (imgLineIdx >= 0) {
          const actualLine = imgLineIdx + 1;
          const srcLine = sourceLines[imgLineIdx];
          const fixedLine = srcLine.replace(missingFile, relativePath);

          return {
            ...err,
            line: actualLine,
            message: `Image '${missingFile}' found in '${foundSubdir}/'`,
            friendlyExplanation:
              `File '${missingFile}' was not found in the project root directory, but it exists at '${relativePath}'. ` +
              `Update the path in \\includegraphics to resolve this error.`,
            suggestedFix: {
              type: 'replace_line' as const,
              codeSnippet: fixedLine,
              label: `Update path to ${relativePath}`,
              description: `Change '${missingFile}' to '${relativePath}' in \\includegraphics on line ${actualLine}.`,
              line: actualLine,
              find: srcLine,
              replace: fixedLine,
            },
          };
        }
      }
    }

    return err;
  });
}

// The whole point of compiling locally is not hitting a compute wall, so the
// default ceiling is generous and exists only to reap a genuinely runaway
// process. Set OVERLEAF_COPY_COMPILE_TIMEOUT_MS=0 to disable it entirely.
const DEFAULT_COMPILE_TIMEOUT_MS = (() => {
  const raw = process.env.OVERLEAF_COPY_COMPILE_TIMEOUT_MS;
  if (raw === undefined) return 600000; // 10 minutes
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 600000;
})();

// Cache whether latexmk+Perl are available so we pay the probe cost only once
// per server process. undefined = not yet checked; true/false = known.
let latexmkAvailableCache: boolean | undefined = undefined;

export async function isLatexmkAvailable(): Promise<boolean> {
  if (latexmkAvailableCache !== undefined) return latexmkAvailableCache;

  // Cheap probe: ask latexmk to print its version. No TeX files are touched,
  // so this completes in milliseconds — or immediately fails if Perl is absent.
  const probe = await executeCommand('latexmk', ['--version'], process.cwd(), 5000);
  const unavailable =
    !!probe.error ||
    /is not recognized|command not found|ENOENT/i.test(probe.stderr) ||
    /can't (find|locate).*perl|perl.*not (found|installed)|script engine.*perl|could not find.*perl/i.test(
      probe.stdout + probe.stderr
    );

  latexmkAvailableCache = !unavailable;
  return latexmkAvailableCache;
}

function getProjectSearchPaths(
  projectDir: string,
  buildDir: string
): { texInputs: string; bibInputs: string } {
  const sep = path.delimiter;
  const userSubdirs: string[] = [];

  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      // Include user subfolders (e.g. figures, sections, images).
      // Explicitly ignore .git, .build, node_modules, etc., preventing catastrophic Kpathsea crawls inside Git objects.
      if (
        entry.isDirectory() &&
        !entry.name.startsWith('.') &&
        entry.name !== 'node_modules' &&
        entry.name !== 'dist'
      ) {
        userSubdirs.push(path.join(projectDir, entry.name));
      }
    }
  } catch {
    // Ignore if directory read fails
  }

  // Include cwd, project directory, user subdirectories (with // for nested subfolders), and buildDir.
  // The trailing empty element creates a trailing delimiter, telling Kpathsea to search standard system TeX packages.
  const basePaths = [
    '.',
    projectDir,
    ...userSubdirs.map((d) => `${d}//`),
    buildDir,
    '',
  ];

  let texInputs = basePaths.join(sep);
  if (process.env.TEXINPUTS) {
    texInputs += process.env.TEXINPUTS.endsWith(sep)
      ? process.env.TEXINPUTS
      : `${process.env.TEXINPUTS}${sep}`;
  }

  let bibInputs = basePaths.join(sep);
  if (process.env.BIBINPUTS) {
    bibInputs += process.env.BIBINPUTS.endsWith(sep)
      ? process.env.BIBINPUTS
      : `${process.env.BIBINPUTS}${sep}`;
  }

  return { texInputs, bibInputs };
}

function executeCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number = DEFAULT_COMPILE_TIMEOUT_MS,
  extraEnv?: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string; stderr: string; error?: Error }> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let resolved = false;

    const child = spawn(cmd, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: extraEnv ? { ...process.env, ...extraEnv } : process.env,
    });

    const timer =
      timeoutMs > 0
        ? setTimeout(() => {
            if (!resolved) {
              resolved = true;
              try {
                child.kill('SIGKILL');
              } catch {
                // Ignore
              }
              resolve({
                code: -1,
                stdout,
                stderr:
                  stderr +
                  `\nCompilation exceeded ${Math.round(
                    timeoutMs / 1000
                  )}s and was stopped. Raise or disable this with OVERLEAF_COPY_COMPILE_TIMEOUT_MS.`,
              });
            }
          }, timeoutMs)
        : null;

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }
    });

    child.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve({ code: -1, stdout, stderr, error });
      }
    });
  });
}

export function cleanBuildCache(projectDir: string): { cleaned: boolean; message: string } {
  const buildDir = path.join(projectDir, '.build');
  if (fs.existsSync(buildDir)) {
    try {
      const files = fs.readdirSync(buildDir);
      for (const f of files) {
        fs.rmSync(path.join(buildDir, f), { recursive: true, force: true });
      }
      return { cleaned: true, message: 'Build cache cleared successfully.' };
    } catch (err: any) {
      return { cleaned: false, message: `Failed to clean build cache: ${err.message}` };
    }
  }
  return { cleaned: true, message: 'Build cache already clean.' };
}

export async function compileDocument(
  projectDir: string,
  mainFile: string = 'main.tex',
  engine: 'pdflatex' | 'xelatex' | 'lualatex' = 'pdflatex',
  options: { shellEscape?: boolean } = {}
): Promise<CompileResult> {
  const startTime = Date.now();
  const buildDir = path.join(projectDir, '.build');

  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }

  const baseName = path.basename(mainFile, path.extname(mainFile));
  const generatedPdf = path.join(buildDir, `${baseName}.pdf`);

  // Remove stale build PDF to ensure fresh compilation verification
  if (fs.existsSync(generatedPdf)) {
    try {
      fs.unlinkSync(generatedPdf);
    } catch {
      // Ignore if locked
    }
  }

  // Resolve search paths for LaTeX and BibTeX (excluding .git and .build)
  const { texInputs, bibInputs } = getProjectSearchPaths(projectDir, buildDir);

  const compileEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TEXINPUTS: texInputs,
    BIBINPUTS: bibInputs,
    BSTINPUTS: bibInputs,
  };

  const relMainFile = path.isAbsolute(mainFile) ? path.relative(projectDir, mainFile) : mainFile;
  const auxFile = path.join(buildDir, `${baseName}.aux`);

  // latexmk is preferred: it decides how many passes are needed and runs
  // bibtex/biber on its own. The availability check is cached after the first
  // compile so we don't pay the probe overhead on every subsequent keypress.
  const latexmkArgs = [
    '-pdf',
    `-pdflatex=${engine}`,
    '-interaction=nonstopmode',
    '-synctex=1',
    '-file-line-error',
    `-outdir=${buildDir}`,
    ...(options.shellEscape ? ['-shell-escape'] : []),
    path.join(projectDir, mainFile),
  ];

  // Portable flags only. -c-style-errors, -disable-installer and
  // -include-directory are MiKTeX extensions that make this path fail
  // outright on TeX Live; TEXINPUTS already covers file resolution.
  const directArgs = [
    '-interaction=nonstopmode',
    '-file-line-error',
    '-synctex=1',
    `-output-directory=${buildDir}`,
    ...(options.shellEscape ? ['-shell-escape'] : []),
    relMainFile,
  ];

  let res: { code: number | null; stdout: string; stderr: string; error?: Error };

  if (await isLatexmkAvailable()) {
    res = await executeCommand('latexmk', latexmkArgs, projectDir, undefined, compileEnv);
  } else {
    res = await executeCommand(engine, directArgs, projectDir, undefined, compileEnv);

    // Without latexmk nothing resolves citations or cross-references, so drive
    // the passes by hand: bibtex when the aux file actually records citations,
    // then reruns until the labels settle.
    const needsBibtex = fs.existsSync(auxFile) && /^\\citation\{/m.test(readSafe(auxFile));
    if (needsBibtex) {
      await executeCommand('bibtex', [baseName], buildDir, undefined, compileEnv);
      res = await executeCommand(engine, directArgs, projectDir, undefined, compileEnv);
    }

    const needsRerun =
      needsBibtex ||
      /Rerun to get|may have changed|Label\(s\) may have changed/i.test(res.stdout + readSafe(path.join(buildDir, `${baseName}.log`)));
    if (needsRerun) {
      res = await executeCommand(engine, directArgs, projectDir, undefined, compileEnv);
    }
  }

  const durationMs = Date.now() - startTime;
  const buildLogFile = path.join(buildDir, `${baseName}.log`);
  const diskLog = readSafe(buildLogFile);

  // The on-disk log is the authoritative record and already contains anything
  // the engine printed. Only fall back to stdout/stderr when it is missing,
  // otherwise every error gets parsed twice.
  const fullLog = diskLog || `${res.stdout}\n${res.stderr}`;
  const mainSourcePath = path.isAbsolute(mainFile) ? mainFile : path.join(projectDir, mainFile);
  const mainSource = readSafe(mainSourcePath);
  const sourceLines = mainSource.split('\n').map((l) => l.replace(/\r$/, ''));
  const documentTitle = extractLatexTitle(mainSource) || undefined;
  const pdfDownloadFilename = documentTitle ? `${documentTitle}.pdf` : `${baseName}.pdf`;
  const detectedMissingPackages = scanMissingPackages(mainSource);

  const { errors, warnings } = parseLatexLog(fullLog, sourceLines, projectDir);
  const pdfGenerated = fs.existsSync(generatedPdf);

  // A PDF that exists is worth showing even when the log carries errors, which
  // is how Overleaf behaves: the diagnostics panel reports the problems while
  // the preview still updates.
  const outputPdf = path.join(projectDir, `${baseName}.pdf`);
  if (pdfGenerated) {
    try {
      fs.copyFileSync(generatedPdf, outputPdf);
    } catch {
      // Ignore if the target is locked by a viewer
    }
  }

  return {
    success: pdfGenerated,
    pdfUrl: pdfGenerated ? `/api/pdf?file=${encodeURIComponent(outputPdf)}` : undefined,
    durationMs,
    errors,
    warnings,
    rawLog: fullLog + (res.stderr ? `\n${res.stderr}` : ''),
    documentTitle,
    pdfDownloadFilename,
    detectedMissingPackages,
  };
}

function readSafe(filePath: string): string {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  } catch {
    return '';
  }
}
