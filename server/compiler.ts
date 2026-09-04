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
    const fileLineMatch = line.match(/^(\.[\\/][^:]+|[^:]+\.tex):(\d+):\s*(.*)$/);
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
    if (line.startsWith('!pdfTeX error:') || line.startsWith('! LaTeX Error:')) {
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

  return { errors, warnings };
}

function executeCommand(
  cmd: string,
  args: string[],
  cwd: string,
  timeoutMs: number = 20000,
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

    const timer = setTimeout(() => {
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
          stderr: stderr + '\nCompilation timed out after 20 seconds.',
        });
      }
    }, timeoutMs);

    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));

    child.on('close', (code) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }
    });

    child.on('error', (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
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

  // Find all subdirectories in the project for comprehensive file resolution
  const subdirs: string[] = [];
  try {
    const entries = fs.readdirSync(projectDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        subdirs.push(path.join(projectDir, entry.name));
      }
    }
  } catch {
    // Ignore
  }

  // Set TEXINPUTS so LaTeX searches the project directory and all subdirectories recursively (//)
  // Exactly matching Overleaf's automatic file and figure resolution
  const sep = path.delimiter;
  const normProjectDir = projectDir.replace(/\\/g, '/');
  const normBuildDir = buildDir.replace(/\\/g, '/');
  const texInputs = `.${sep}${projectDir}//${sep}${normProjectDir}//${sep}${buildDir}${sep}${normBuildDir}${sep}${process.env.TEXINPUTS ? process.env.TEXINPUTS + sep : ''}`;

  const compileEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TEXINPUTS: texInputs,
  };

  // Try latexmk first if available
  const latexmkArgs = [
    '-pdf',
    `-pdflatex=${engine}`,
    '-interaction=nonstopmode',
    '-synctex=1',
    '-file-line-error',
    `-outdir=${buildDir}`,
    path.join(projectDir, mainFile),
  ];

  let res = await executeCommand('latexmk', latexmkArgs, projectDir, 20000, compileEnv);

  // If latexmk was not found, failed due to missing Perl, or didn't produce the PDF:
  const perlMissing = res.stdout.includes('perl') || res.stderr.includes('perl');
  if (res.error || res.code !== 0 || perlMissing || !fs.existsSync(generatedPdf)) {
    const relMainFile = path.isAbsolute(mainFile)
      ? path.relative(projectDir, mainFile)
      : mainFile;
    const directArgs = [
      '-interaction=nonstopmode',
      '-halt-on-error',
      '-disable-installer',
      '-synctex=1',
      '-c-style-errors',
      `-include-directory=${projectDir}`,
      ...subdirs.map((d) => `-include-directory=${d}`),
      `--output-directory=${buildDir}`,
      relMainFile,
    ];
    res = await executeCommand(engine, directArgs, projectDir, 20000, compileEnv);
  }

  const durationMs = Date.now() - startTime;
  const buildLogFile = path.join(buildDir, `${baseName}.log`);
  const diskLog = fs.existsSync(buildLogFile) ? fs.readFileSync(buildLogFile, 'utf-8') : '';
  const fullLog = (diskLog ? diskLog + '\n' : '') + res.stdout + '\n' + res.stderr;
  const { errors, warnings } = parseLatexLog(fullLog);
  const pdfGenerated = fs.existsSync(generatedPdf);
  const success = pdfGenerated && (res.code === 0 || errors.length === 0);

  // Copy compiled PDF to active project directory for direct consumption
  const outputPdf = path.join(projectDir, `${baseName}.pdf`);
  if (success && pdfGenerated) {
    fs.copyFileSync(generatedPdf, outputPdf);
  }

  return {
    success,
    pdfUrl: success ? `/api/pdf?file=${encodeURIComponent(outputPdf)}` : undefined,
    durationMs,
    errors,
    warnings,
    rawLog: fullLog,
  };
}
