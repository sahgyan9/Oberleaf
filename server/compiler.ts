import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface CompileError {
  file: string;
  line: number;
  message: string;
  friendlyExplanation?: string;
  raw: string;
}

export interface CompileResult {
  success: boolean;
  pdfUrl?: string;
  durationMs: number;
  errors: CompileError[];
  warnings: string[];
  rawLog: string;
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

export function parseLatexLog(logContent: string): { errors: CompileError[]; warnings: string[] } {
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
      const [, file, lineStr, message] = fileLineMatch;
      // Combine with next lines in case TeX wrapped the message
      const nextLines = lines.slice(i + 1, i + 3).join(' ');
      const combined = `${message} ${nextLines}`;
      const raw = lines.slice(i, i + 4).join('\n');
      errors.push({
        file,
        line: parseInt(lineStr, 10),
        message: message.trim(),
        friendlyExplanation: translateTeXError(combined),
        raw,
      });
      continue;
    }

    // Classic '! ...' TeX error format
    if (line.startsWith('! ')) {
      const message = line.substring(2).trim();
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

      const combined = lines.slice(i, i + 4).join(' ');
      errors.push({
        file,
        line: lineNumber,
        message,
        friendlyExplanation: translateTeXError(combined),
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
        raw: lines.slice(i, i + 4).join('\n'),
      });
    }

    // LaTeX Warnings
    if (line.includes('LaTeX Warning:')) {
      warnings.push(line.replace('LaTeX Warning:', '').trim());
    }
  }

  return { errors: dedupeErrors(errors), warnings: [...new Set(warnings)] };
}

// TeX repeats itself: the same fault appears in the on-disk log and again in
// stdout, and a multi-pass build reports it once per pass. Collapse by the
// identity the user actually cares about.
function dedupeErrors(errors: CompileError[]): CompileError[] {
  const seen = new Set<string>();
  const unique: CompileError[] = [];

  for (const err of errors) {
    const key = `${err.message.trim()}`;
    if (seen.has(key)) {
      // Keep the entry that carries a usable line number
      const existing = unique.find((e) => e.message.trim() === key);
      if (existing && existing.line <= 0 && err.line > 0) {
        existing.line = err.line;
        existing.file = err.file;
      }
      continue;
    }
    seen.add(key);
    unique.push(err);
  }

  return unique;
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

export async function compileDocument(
  projectDir: string,
  mainFile: string = 'main.tex',
  engine: 'pdflatex' | 'xelatex' | 'lualatex' = 'pdflatex'
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

  // Set TEXINPUTS so LaTeX searches the project directory and all subdirectories recursively (//)
  // Exactly matching Overleaf's automatic file and figure resolution
  const sep = path.delimiter;
  const normProjectDir = projectDir.replace(/\\/g, '/');
  const normBuildDir = buildDir.replace(/\\/g, '/');
  const texInputs = `.${sep}${projectDir}//${sep}${normProjectDir}//${sep}${buildDir}${sep}${normBuildDir}${sep}${process.env.TEXINPUTS ? process.env.TEXINPUTS + sep : ''}`;

  // bibtex resolves .bib files through BIBINPUTS, not TEXINPUTS, and it runs
  // with the build directory as its working directory. Without this it opens
  // whatever "references.bib" it can find on the default path and silently
  // emits an empty bibliography, leaving every \cite rendered as [?].
  const bibInputs = `.${sep}${projectDir}//${sep}${normProjectDir}//${sep}${
    process.env.BIBINPUTS ? process.env.BIBINPUTS + sep : ''
  }`;

  const compileEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TEXINPUTS: texInputs,
    BIBINPUTS: bibInputs,
    BSTINPUTS: bibInputs,
  };

  const relMainFile = path.isAbsolute(mainFile) ? path.relative(projectDir, mainFile) : mainFile;
  const auxFile = path.join(buildDir, `${baseName}.aux`);

  // latexmk is preferred: it decides how many passes are needed and runs
  // bibtex/biber on its own. Only fall back when it is genuinely unavailable,
  // rather than on any non-zero exit -- a LaTeX error also exits non-zero, and
  // re-running the engine there produced a second copy of every log message.
  const latexmkArgs = [
    '-pdf',
    `-pdflatex=${engine}`,
    '-interaction=nonstopmode',
    '-synctex=1',
    '-file-line-error',
    `-outdir=${buildDir}`,
    path.join(projectDir, mainFile),
  ];

  let res = await executeCommand('latexmk', latexmkArgs, projectDir, undefined, compileEnv);

  // ENOENT means no latexmk on PATH; latexmk also aborts when Perl is absent.
  const latexmkUnavailable =
    !!res.error ||
    /is not recognized|command not found|ENOENT/i.test(res.stderr) ||
    /can't (find|locate).*perl|perl.*not (found|installed)/i.test(res.stdout + res.stderr);

  if (latexmkUnavailable) {
    // Portable flags only. -c-style-errors, -disable-installer and
    // -include-directory are MiKTeX extensions that make this path fail
    // outright on TeX Live; TEXINPUTS already covers file resolution.
    const directArgs = [
      '-interaction=nonstopmode',
      '-file-line-error',
      '-synctex=1',
      `-output-directory=${buildDir}`,
      relMainFile,
    ];

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
  const { errors, warnings } = parseLatexLog(fullLog);
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
  };
}

function readSafe(filePath: string): string {
  try {
    return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
  } catch {
    return '';
  }
}
