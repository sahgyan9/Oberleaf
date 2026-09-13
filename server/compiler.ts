import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { extractLatexTitle } from './latexTitle.js';

export interface SuggestedFix {
  type: 'add_preamble' | 'install_package' | 'wrap_math_mode' | 'replace_line' | 'set_engine' | 'open_doctor';
  packageName?: string;
  /** For set_engine: the engine the magic comment selects */
  engine?: SupportedEngine;
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
  /** The engine that actually ran, after any % !TEX program override */
  engine?: SupportedEngine;
}

// Package errors continue on lines prefixed with "(fontspec)", so the two
// halves of the sentence are separated by that prefix, not just whitespace.
const FONTSPEC_ENGINE_ERROR = /fontspec package requires either XeTeX or[\s\S]{0,80}?LuaTeX/i;

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
  if (FONTSPEC_ENGINE_ERROR.test(raw)) {
    return 'fontspec loads system fonts, which pdfLaTeX cannot do. This document has to be compiled with XeLaTeX or LuaLaTeX.';
  }
  if (raw.includes('auto expansion is only possible with scalable fonts')) {
    return 'pdfTeX fell back to a bitmap font, and microtype cannot stretch bitmaps. Either the scalable font package is missing or the font maps are stale.';
  }
  if (/Unicode character .* not set up for use with\s*LaTeX/i.test(raw)) {
    return 'pdfLaTeX has no definition for this character. Replace it with the equivalent LaTeX command, or compile with XeLaTeX.';
  }
  if (raw.includes('Missing \\begin{document}')) {
    return 'Text was found in the preamble. Everything that prints must come after \\begin{document}; check for a stray character above it.';
  }
  if (raw.includes('File ended while scanning use of')) {
    return 'A command argument was never closed. Look for a missing } in or just before the reported line.';
  }
  if (raw.includes("Too many }'s")) {
    return 'There is a } with no matching {. Remove it or add the missing opening brace.';
  }
  if (raw.includes('Option clash for package')) {
    return 'The same package is loaded twice with different options, often once directly and once by the document class or another package. Load it once and merge the options.';
  }
  if (raw.includes("I can't write on file")) {
    return 'The output file is locked, usually because the PDF is open in another viewer such as Acrobat. Close it and compile again.';
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

  // Mirrors isPackageLoaded in src/utils/latexPackages.ts: comma lists such as
  // \usepackage{amsmath,amssymb} count, and commented-out lines do not.
  const livePreamble = preamble.replace(/(^|[^\\])%.*$/gm, '$1');
  for (const rule of COMMON_PACKAGE_RULES) {
    const isDeclared = new RegExp(
      `\\\\(?:usepackage|RequirePackage)\\s*(?:\\[[^\\]]*\\])?\\s*\\{(?:[^}]*[\\s,])?${rule.packageName}\\s*(?:,[^}]*)?\\}`
    ).test(livePreamble);
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

  // 0a. fontspec under pdfLaTeX. The document is right; the engine is wrong.
  // A magic comment is the fix rather than a hidden setting: it lives in the
  // source, travels with the project, and is what TeXstudio, TeXShop and
  // LaTeX Workshop already read.
  if (FONTSPEC_ENGINE_ERROR.test(combined)) {
    return {
      type: 'set_engine',
      engine: 'xelatex',
      line: 1,
      codeSnippet: '% !TEX program = xelatex',
      label: 'Compile with XeLaTeX',
      description: 'Adds "% !TEX program = xelatex" as the first line, so this document always compiles with XeLaTeX.',
    };
  }

  // 0b. microtype on a bitmap font. The font name in the message separates the
  // two causes: ec*/tc* are T1/TS1 fonts whose scalable versions come from
  // cm-super; anything else means the maps do not point at files that exist.
  if (/auto expansion is only possible with scalable fonts/i.test(combined)) {
    const font = combined.match(/\(file ([A-Za-z0-9-]+)\)\s*:\s*auto expansion/i)?.[1] ?? '';
    if (/^(ec|tc)/i.test(font)) {
      return {
        type: 'install_package',
        packageName: 'cm-super',
        codeSnippet: 'cm-super',
        label: 'Install cm-super fonts',
        description: `The T1 font "${font}" has no scalable version installed. cm-super provides it.`,
      };
    }
    return {
      type: 'open_doctor',
      codeSnippet: '',
      label: 'Open TeX Doctor',
      description: `pdfTeX has no scalable file mapped for ${font ? `"${font}"` : 'this font'}. TeX Doctor can rebuild the font maps.`,
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

const FILE_LINE_ERROR = /^((?:[A-Za-z]:)?[^:]*?\.(?:tex|sty|cls|bib)):(\d+):\s*(.*)$/;

// TeX hard-wraps the log at max_print_line (79 by default in both TeX Live
// and MiKTeX). An error raised inside an installed package carries its full
// absolute path, which on Windows is long enough to split the
// "file:line: message" prefix itself:
//
//   C:\Users\me\AppData\Local\Programs\MiKTeX\tex/latex/fontspec\fontspec.sty:10
//   1: Fatal Package fontspec Error: The fontspec package requires either XeTeX or
//
// Neither half matches, so the error vanished and the user got a failed
// compile with an empty diagnostics panel. Rejoin a full-width line with its
// successors whenever that is what turns it into a file-line-error.
function unwrapFileLineErrors(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.length >= 79 && !FILE_LINE_ERROR.test(line)) {
      let joined = line;
      for (let k = 1; k <= 3 && i + k < lines.length; k++) {
        joined += lines[i + k];
        if (FILE_LINE_ERROR.test(joined)) {
          line = joined;
          i += k;
          break;
        }
        if (lines[i + k].length < 79) break;
      }
    }
    out.push(line);
  }
  return out;
}

export function parseLatexLog(
  logContent: string,
  sourceLines?: string[],
  projectDir?: string
): { errors: CompileError[]; warnings: string[] } {
  const errors: CompileError[] = [];
  const warnings: string[] = [];
  const lines = unwrapFileLineErrors(logContent.split('\n').map((l) => l.replace(/\r$/, '')));

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // File-line-error format: ./main.tex:24: Undefined control sequence.
    // The optional leading drive letter matters on Windows, where the engine
    // reports absolute paths like C:\project\main.tex:24: and a naive
    // [^:]+ pattern stops dead at the drive colon.
    const fileLineMatch = line.match(FILE_LINE_ERROR);
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

  // A cascade belongs to the most recent root error before it in the log, not
  // to the first error in the document. With an unrelated error earlier (a
  // stray Unicode character on line 6, say), blaming errors[0] told the user
  // that fixing line 6 would clear the fallout of an undefined environment on
  // line 8.
  let rootError = errors[0];

  return errors.map((err, idx) => {
    if (idx === 0) return err;

    // Detect if this subsequent error is a classic TeX cascade caused by the unresolved root error
    const isCascadePattern =
      /Misplaced alignment|Missing \$ inserted|ended by \\end|Undefined control sequence|Runaway argument|Extra \}|Missing \} inserted|Emergency stop|Fatal error occurred, no output PDF/i.test(
        err.message
      );

    // An error that carries its own targeted fix (an \includegraphics without
    // graphicx is also "Undefined control sequence") is actionable by itself
    // and stays a root cause.
    if (err.isCascading) return err;
    if (isCascadePattern && !err.suggestedFix && (rootError.suggestedFix || rootError.line > 0)) {
      return {
        ...err,
        isCascading: true,
        cascadingFromLine: rootError.line,
        friendlyExplanation: `Secondary error cascading from Line ${rootError.line}. Resolving the root issue on Line ${rootError.line} will fix this.`,
      };
    }

    rootError = err;
    return err;
  });
}

// Characters pdfLaTeX's utf8 input does not define, mapped to commands that
// work in both text and math mode (\ensuremath), so the fix does not need to
// know which mode the character sits in. Characters the LaTeX kernel already
// handles (é, ü, °, ±, ×, –, —, curly quotes) never raise the error and are
// deliberately absent.
const UNICODE_TO_LATEX: Record<number, string> = (() => {
  const m = (cmd: string) => `\\ensuremath{${cmd}}`;
  const table: Record<number, string> = {
    // Invisible characters that arrive with copy-paste
    0x00a0: '~', 0x2009: '\\,', 0x200b: '', 0x2060: '', 0xfeff: '', 0x2011: '-',
    // Lowercase Greek
    0x03b1: m('\\alpha'), 0x03b2: m('\\beta'), 0x03b3: m('\\gamma'), 0x03b4: m('\\delta'),
    0x03b5: m('\\varepsilon'), 0x03f5: m('\\epsilon'), 0x03b6: m('\\zeta'), 0x03b7: m('\\eta'),
    0x03b8: m('\\theta'), 0x03d1: m('\\vartheta'), 0x03b9: m('\\iota'), 0x03ba: m('\\kappa'),
    0x03bb: m('\\lambda'), 0x03bc: m('\\mu'), 0x03bd: m('\\nu'), 0x03be: m('\\xi'),
    0x03c0: m('\\pi'), 0x03c1: m('\\rho'), 0x03c2: m('\\varsigma'), 0x03c3: m('\\sigma'),
    0x03c4: m('\\tau'), 0x03c5: m('\\upsilon'), 0x03c6: m('\\varphi'), 0x03d5: m('\\phi'),
    0x03c7: m('\\chi'), 0x03c8: m('\\psi'), 0x03c9: m('\\omega'),
    // Uppercase Greek with distinct glyphs
    0x0393: m('\\Gamma'), 0x0394: m('\\Delta'), 0x0398: m('\\Theta'), 0x039b: m('\\Lambda'),
    0x039e: m('\\Xi'), 0x03a0: m('\\Pi'), 0x03a3: m('\\Sigma'), 0x03a5: m('\\Upsilon'),
    0x03a6: m('\\Phi'), 0x03a8: m('\\Psi'), 0x03a9: m('\\Omega'),
    // Relations and operators
    0x2212: m('-'), 0x2264: m('\\leq'), 0x2265: m('\\geq'), 0x2260: m('\\neq'),
    0x2248: m('\\approx'), 0x2261: m('\\equiv'), 0x221d: m('\\propto'), 0x223c: m('\\sim'),
    0x22c5: m('\\cdot'), 0x2217: m('\\ast'), 0x2297: m('\\otimes'), 0x2295: m('\\oplus'),
    0x2208: m('\\in'), 0x2209: m('\\notin'), 0x2282: m('\\subset'), 0x2286: m('\\subseteq'),
    0x2229: m('\\cap'), 0x222a: m('\\cup'), 0x2227: m('\\wedge'), 0x2228: m('\\vee'),
    0x2200: m('\\forall'), 0x2203: m('\\exists'), 0x2205: m('\\emptyset'),
    0x2211: m('\\sum'), 0x220f: m('\\prod'), 0x222b: m('\\int'), 0x221a: m('\\surd'),
    0x2202: m('\\partial'), 0x2207: m('\\nabla'), 0x221e: m('\\infty'),
    0x210f: m('\\hbar'), 0x2113: m('\\ell'), 0x2032: m("'"), 0x2033: m("''"),
    0x27e8: m('\\langle'), 0x27e9: m('\\rangle'), 0x2016: m('\\|'),
    // Arrows
    0x2192: m('\\rightarrow'), 0x2190: m('\\leftarrow'), 0x2194: m('\\leftrightarrow'),
    0x21d2: m('\\Rightarrow'), 0x21d0: m('\\Leftarrow'), 0x21d4: m('\\Leftrightarrow'),
    0x2191: m('\\uparrow'), 0x2193: m('\\downarrow'), 0x21a6: m('\\mapsto'),
  };
  return table;
})();

/**
 * Source-aware enrichment pass — runs AFTER log parsing and deduplication.
 * Inspects source code to remap misleading errors to their true source line,
 * provides clear plain-English explanations, and attaches 1-click Quick Fixes.
 */
function enrichErrorsWithSourceContext(
  rawErrors: CompileError[],
  sourceLines: string[],
  projectDir?: string
): CompileError[] {
  // An error raised inside an installed package reports the package's own
  // file and line (fontspec.sty:101), so "Jump" would land on line 101 of the
  // user's document. Point it at the \usepackage line that loaded the package.
  const errors = rawErrors.map((err) => {
    const ext = path.extname(err.file).toLowerCase();
    if (ext !== '.sty' && ext !== '.cls') return err;
    // A .sty the user keeps in the project is their own file; its line is right.
    if (projectDir && path.resolve(projectDir, err.file).startsWith(path.resolve(projectDir) + path.sep)) return err;
    const name = path.basename(err.file, ext).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const loader = new RegExp(
      ext === '.cls'
        ? `\\\\documentclass\\s*(?:\\[[^\\]]*\\])?\\s*\\{\\s*${name}\\s*\\}`
        : `\\\\(?:usepackage|RequirePackage)\\s*(?:\\[[^\\]]*\\])?\\s*\\{(?:[^}]*[\\s,])?${name}\\s*(?:,[^}]*)?\\}`
    );
    const idx = sourceLines.findIndex((l) => loader.test(l));
    return idx >= 0 ? { ...err, file: 'main.tex', line: idx + 1 } : err;
  });

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

    // ── Pattern 0: Unicode character pdfLaTeX has no definition for ────────
    // Typical source: Greek letters and math symbols pasted from a PDF, a web
    // page or Word. The code point in the message is authoritative; the glyph
    // next to it can be mangled by the log's encoding.
    const unicodeMatch = `${err.message} ${err.raw}`.match(/Unicode character .*?\(U\+([0-9A-Fa-f]{4,6})\)/);
    if (unicodeMatch) {
      const codePoint = parseInt(unicodeMatch[1], 16);
      const char = String.fromCodePoint(codePoint);
      const replacement = UNICODE_TO_LATEX[codePoint];
      const hex = `U+${unicodeMatch[1].toUpperCase()}`;

      const candidates = [lineIdx, lineIdx - 1, lineIdx + 1].filter((i) => i >= 0 && i < sourceLines.length);
      let targetIdx = candidates.find((i) => sourceLines[i].includes(char)) ?? -1;
      if (targetIdx < 0) targetIdx = sourceLines.findIndex((l) => l.includes(char));

      if (replacement === undefined || targetIdx < 0) {
        return {
          ...err,
          friendlyExplanation:
            `pdfLaTeX has no definition for "${char}" (${hex}). ` +
            'Replace it with a LaTeX command, or compile with XeLaTeX and a font that contains the character.',
        };
      }

      const actualLine = targetIdx + 1;
      const srcLine = sourceLines[targetIdx];
      // An empty replacement means "delete this line" to the client, and a
      // blank line is a paragraph break, so never let a fix produce one.
      const fixedLine = srcLine.split(char).join(replacement) || ' ';
      const shown = replacement === '' ? 'nothing (it is invisible)' : replacement;
      return {
        ...err,
        line: actualLine,
        friendlyExplanation:
          `Line ${actualLine} contains "${char}" (${hex}), which pdfLaTeX cannot typeset directly. ` +
          `The LaTeX equivalent is ${shown}.`,
        suggestedFix: {
          type: 'replace_line' as const,
          codeSnippet: fixedLine,
          label: replacement === '' ? `Remove invisible ${hex}` : `Replace "${char}" with ${replacement}`,
          description: `Replaces every "${char}" on line ${actualLine} with ${shown}.`,
          line: actualLine,
          find: srcLine,
          replace: fixedLine,
        },
      };
    }

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

    // A document that loops -- \loop without an exit, a runaway \def -- makes
    // pdfTeX print without bound. The compile timeout is configurable up to
    // "no limit", so nothing else stops these buffers from growing until the
    // server runs out of memory. The tail is what the log parser needs anyway.
    const MAX_CAPTURE_BYTES = 8 * 1024 * 1024;
    const appendCapped = (buffer: string, chunk: string): string => {
      const next = buffer + chunk;
      return next.length > MAX_CAPTURE_BYTES ? next.slice(next.length - MAX_CAPTURE_BYTES) : next;
    };

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

    child.stdout.on('data', (d) => (stdout = appendCapped(stdout, d.toString())));
    child.stderr.on('data', (d) => (stderr = appendCapped(stderr, d.toString())));

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

/**
 * The engines the app offers. This doubles as the allow-list the compile route
 * validates against: the value ends up inside latexmk's `-pdflatex=<cmd>`
 * option, which latexmk hands to a shell, so anything unvetted reaching it is
 * command execution on the host.
 */
export const SUPPORTED_ENGINES = ['pdflatex', 'xelatex', 'lualatex'] as const;
export type SupportedEngine = (typeof SUPPORTED_ENGINES)[number];

/**
 * Reads a "% !TEX program = xelatex" (or "% !TeX TS-program = ...") magic
 * comment from the top of a document. The value is only returned when it is
 * one of SUPPORTED_ENGINES, so a document cannot use it to name a command.
 */
export function readMagicEngine(source: string): SupportedEngine | undefined {
  const head = source.split('\n').slice(0, 20);
  for (const line of head) {
    const match = line.match(/^\s*%\s*!\s*TEX\s+(?:TS-)?program\s*=\s*([A-Za-z]+)/i);
    if (match) {
      const value = match[1].toLowerCase();
      return (SUPPORTED_ENGINES as readonly string[]).includes(value) ? (value as SupportedEngine) : undefined;
    }
  }
  return undefined;
}

export async function compileDocument(
  projectDir: string,
  mainFile: string = 'main.tex',
  engine: SupportedEngine = 'pdflatex',
  options: { shellEscape?: boolean } = {}
): Promise<CompileResult> {
  // Defence in depth. The route validates both of these, but this function is
  // also reachable from scripts and tests, and getting either one wrong is a
  // host compromise rather than a bad compile.
  if (!SUPPORTED_ENGINES.includes(engine)) {
    throw new Error(`Unsupported engine: ${engine}`);
  }
  const normalizedRoot = path.resolve(projectDir);
  const resolvedMain = path.resolve(projectDir, mainFile);
  if (
    resolvedMain !== normalizedRoot &&
    !resolvedMain.startsWith(normalizedRoot + path.sep)
  ) {
    throw new Error('Access outside project boundary is forbidden');
  }

  const startTime = Date.now();
  const buildDir = path.join(projectDir, '.build');

  // The document's own magic comment outranks the request default, because
  // the client always sends pdflatex and the comment is an explicit choice
  // written into the source.
  const mainSourcePath = path.isAbsolute(mainFile) ? mainFile : path.join(projectDir, mainFile);
  const mainSource = readSafe(mainSourcePath);
  engine = readMagicEngine(mainSource) ?? engine;

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
    '-g',
    `-pdflatex=${engine}`,
    '-interaction=nonstopmode',
    '-synctex=1',
    '-file-line-error',
    `-outdir=${buildDir}`,
    ...(options.shellEscape ? ['-shell-escape'] : []),
    path.join(projectDir, mainFile),
  ];

  // Remove stale log file so previous compile errors cannot bleed into this run
  const buildLogFile = path.join(buildDir, `${baseName}.log`);
  if (fs.existsSync(buildLogFile)) {
    try {
      fs.unlinkSync(buildLogFile);
    } catch {
      // Ignore if file is locked
    }
  }

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
  const diskLog = readSafe(buildLogFile);

  // The on-disk log is the authoritative record and already contains anything
  // the engine printed. Only fall back to stdout/stderr when it is missing,
  // otherwise every error gets parsed twice.
  const fullLog = diskLog || `${res.stdout}\n${res.stderr}`;
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
    engine,
  };
}

function readSafe(filePath: string): string {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  } catch {
    return '';
  }
}
