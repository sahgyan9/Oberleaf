// Document checks for the TeX Diagnostics "Document" tab: mistakes that
// compile without an error but print wrong, or that LaTeX style guides have
// long recommended against. Sources: l2tabu ("obsolete commands, packages and
// other common mistakes") and ChkTeX's warning list.
//
// Every rule runs on a mask of each line, the same length as the line, in
// which comments, verbatim text and (for text rules) math are blanked out.
// That keeps "..." inside $...$ or a % comment from being reported, and lets a
// fix edit the original line at the exact columns the rule matched.

import { closestMatch } from '../../server/texKnowledge';

export interface LintFix {
  label: string;
  /** The whole original line, used to find it again before editing */
  find: string;
  /** The whole line after the fix */
  replace: string;
}

export interface LintFinding {
  rule: string;
  line: number;
  title: string;
  explanation: string;
  source: 'l2tabu' | 'ChkTeX' | 'Oberleaf';
  fix?: LintFix;
}

export interface LintContext {
  /** Citation keys from the project's .bib files */
  bibKeys?: string[];
  /** Project-relative paths of every file, forward slashes */
  projectFiles?: string[];
}

interface LineInfo {
  raw: string;
  /** Comments and verbatim blanked; math kept */
  code: string;
  /** Like code, with math blanked as well */
  text: string;
  /** Only math kept */
  math: string;
}

const VERBATIM_ENVS = new Set(['verbatim', 'verbatim*', 'lstlisting', 'minted', 'comment', 'Verbatim']);
const MATH_ENVS = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*', 'multline', 'multline*', 'flalign', 'flalign*',
  'alignat', 'alignat*', 'eqnarray', 'eqnarray*', 'displaymath', 'math',
]);

const blank = (s: string) => s.replace(/[^\n]/g, ' ');

function analyze(source: string): LineInfo[] {
  const lines = source.split('\n').map((l) => l.replace(/\r$/, ''));
  const out: LineInfo[] = [];
  // Set by analyzeLine when a verbatim environment opens and stays open
  let verbatimEnd = null as string | null;
  let inline = false; // $...$ or \(...\)
  let display = false; // $$...$$, \[...\] or a math environment
  let mathEnvDepth = 0;

  for (const raw of lines) {
    if (verbatimEnd !== null) {
      const closeTag: string = verbatimEnd;
      const endAt = raw.indexOf(closeTag);
      if (endAt < 0) {
        out.push({ raw, code: blank(raw), text: blank(raw), math: blank(raw) });
        continue;
      }
      // Blank up to and including the \end{...}; the rest of the line is normal
      const cut = endAt + closeTag.length;
      verbatimEnd = null;
      const rest = analyzeLine(raw.slice(cut));
      out.push({
        raw,
        code: blank(raw.slice(0, cut)) + rest.code,
        text: blank(raw.slice(0, cut)) + rest.text,
        math: blank(raw.slice(0, cut)) + rest.math,
      });
      continue;
    }
    const info = analyzeLine(raw);
    out.push({ raw, ...info });
  }
  return out;

  function analyzeLine(line: string): Omit<LineInfo, 'raw'> {
    const code = line.split('');
    const text = line.split('');
    const math = line.split('').map(() => ' ');
    const inMath = () => inline || display || mathEnvDepth > 0;
    const markMath = (from: number, to: number) => {
      for (let k = from; k < to; k++) {
        math[k] = line[k];
        text[k] = ' ';
      }
    };

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];

      if (ch === '%') {
        for (let k = i; k < line.length; k++) code[k] = text[k] = math[k] = ' ';
        break;
      }

      if (ch === '\\') {
        const next = line[i + 1] ?? '';
        if (next === '(' || next === '[') {
          if (next === '(') inline = true;
          else display = true;
          markMath(i, i + 2);
          i++;
          continue;
        }
        if (next === ')' || next === ']') {
          markMath(i, i + 2);
          if (next === ')') inline = false;
          else display = false;
          i++;
          continue;
        }
        const name = line.slice(i + 1).match(/^[A-Za-z@]+\*?|^./)?.[0] ?? '';
        const end = i + 1 + name.length;

        if (name === 'verb' || name === 'verb*') {
          const delim = line[end];
          const close = delim ? line.indexOf(delim, end + 1) : -1;
          const stop = close < 0 ? line.length : close + 1;
          for (let k = i; k < stop; k++) code[k] = text[k] = math[k] = ' ';
          i = stop - 1;
          continue;
        }

        if (name === 'begin' || name === 'end') {
          const env = line.slice(end).match(/^\s*\{([^}]+)\}/);
          if (env) {
            const envEnd = end + env[0].length;
            if (name === 'begin' && VERBATIM_ENVS.has(env[1])) {
              const closeTag = `\\end{${env[1]}}`;
              const closeAt = line.indexOf(closeTag, envEnd);
              if (closeAt < 0) {
                verbatimEnd = closeTag;
                for (let k = envEnd; k < line.length; k++) code[k] = text[k] = math[k] = ' ';
                break;
              }
              for (let k = envEnd; k < closeAt; k++) code[k] = text[k] = math[k] = ' ';
              i = closeAt + closeTag.length - 1;
              continue;
            }
            if (MATH_ENVS.has(env[1])) {
              if (name === 'begin') mathEnvDepth++;
              else mathEnvDepth = Math.max(0, mathEnvDepth - 1);
            }
            if (inMath()) markMath(i, envEnd);
            i = envEnd - 1;
            continue;
          }
        }

        if (inMath()) markMath(i, end);
        // A control symbol (\" accent, \% \& \$ \\) is markup, not prose:
        // R\"ontgen has no quote in it.
        else if (/^[^A-Za-z@]$/.test(name)) for (let k = i; k < end; k++) text[k] = ' ';
        i = end - 1;
        continue;
      }

      if (ch === '$') {
        if (line[i + 1] === '$' && !inline) {
          display = !display;
          markMath(i, i + 2);
          i++;
        } else {
          markMath(i, i + 1);
          inline = !inline;
        }
        continue;
      }

      if (inMath()) markMath(i, i + 1);
    }
    return { code: code.join(''), text: text.join(''), math: math.join('') };
  }
}

/** Applies [start, end, replacement] edits (on original columns) to a line. */
function applyEdits(line: string, edits: Array<[number, number, string]>): string {
  let out = line;
  for (const [s, e, r] of [...edits].sort((a, b) => b[0] - a[0])) out = out.slice(0, s) + r + out.slice(e);
  return out;
}

function matchesIn(mask: string, re: RegExp): RegExpExecArray[] {
  const flags = re.flags.includes('g') ? re.flags : re.flags + 'g';
  return [...mask.matchAll(new RegExp(re.source, flags))];
}

const FONT_SWITCHES: Record<string, { command: string; declaration: string }> = {
  bf: { command: 'textbf', declaration: 'bfseries' },
  it: { command: 'textit', declaration: 'itshape' },
  rm: { command: 'textrm', declaration: 'rmfamily' },
  sf: { command: 'textsf', declaration: 'sffamily' },
  tt: { command: 'texttt', declaration: 'ttfamily' },
  sc: { command: 'textsc', declaration: 'scshape' },
  sl: { command: 'textsl', declaration: 'slshape' },
};

const OBSOLETE_PACKAGES: Record<string, string> = {
  epsfig: 'graphicx (\\includegraphics)',
  psfig: 'graphicx (\\includegraphics)',
  times: 'mathptmx or newtxtext/newtxmath',
  a4: 'geometry (\\usepackage[a4paper]{geometry})',
  a4wide: 'geometry',
  doublespace: 'setspace',
  fancyheadings: 'fancyhdr',
  subfigure: 'subcaption',
  caption2: 'caption',
  scrpage2: 'scrlayer-scrpage',
  isolatin1: 'inputenc',
  t1enc: 'fontenc (\\usepackage[T1]{fontenc})',
};

const IMAGE_EXTENSIONS = ['', '.pdf', '.png', '.jpg', '.jpeg', '.eps'];

export function lintLatex(source: string, context: LintContext = {}): LintFinding[] {
  const lines = analyze(source);
  const findings: LintFinding[] = [];
  const add = (f: LintFinding) => findings.push(f);

  const preambleEnd = lines.findIndex((l) => /\\begin\s*\{document\}/.test(l.code));
  const preamble = lines.slice(0, preambleEnd < 0 ? lines.length : preambleEnd).map((l) => l.code).join('\n');
  const usesGermanQuotes = /\\usepackage\s*\[[^\]]*\b(n?german|ngerman)\b[^\]]*\]\s*\{babel\}|\\usepackage[^{]*\{csquotes\}/.test(preamble);
  const isMultiFile = lines.some((l) => /\\(input|include|subfile|import)\s*\{/.test(l.code));

  // Collected for the cross-reference rules
  const labels = new Map<string, number>();
  const refs: Array<{ key: string; line: number; col: number; command: string }> = [];
  const cites: Array<{ key: string; line: number; command: string }> = [];
  const bibitems = new Set<string>();

  // Float tracking for \label-before-\caption and center-in-float
  let inFloat = false;
  let captionSeen = false;
  let earlyLabelLine = -1;
  let dollarParity = 0;

  lines.forEach((info, idx) => {
    const n = idx + 1;
    const { raw, code, math } = info;
    // Prose rules (quotes, ellipsis, ties) only look at the body: quotes in
    // \hypersetup{pdftitle="..."} or package options are not prose.
    const inBody = preambleEnd < 0 || idx > preambleEnd;
    const text = info.text;
    const prose = inBody ? text : blank(text);

    // $$ ... $$
    const dollars = matchesIn(code, /\$\$/);
    if (dollars.length) {
      const edits: Array<[number, number, string]> = dollars.map((m) => {
        const r = dollarParity % 2 === 0 ? '\\[' : '\\]';
        dollarParity++;
        return [m.index!, m.index! + 2, r];
      });
      add({
        rule: 'display-dollars',
        line: n,
        title: '$$ for display math',
        explanation: '$$ is plain TeX. In LaTeX it gets the spacing around displays wrong and breaks the fleqn option; use \\[ ... \\] or an equation environment.',
        source: 'l2tabu',
        fix: { label: 'Use \\[ \\]', find: raw, replace: applyEdits(raw, edits) },
      });
    }

    // {\bf text} and friends
    const fontMatches = matchesIn(text, /\\(bf|it|rm|sf|tt|sc|sl)(?![A-Za-z@])/);
    if (fontMatches.length) {
      const names = [...new Set(fontMatches.map((m) => `\\${m[1]}`))].join(', ');
      // {\bf text} on one line becomes \textbf{text}; a bare switch becomes
      // the declaration that behaves the same (\bfseries).
      let fixed = raw;
      for (const [sw, alt] of Object.entries(FONT_SWITCHES)) {
        fixed = fixed.replace(new RegExp(`\\{\\\\${sw}\\s+([^{}]*)\\}`, 'g'), `\\${alt.command}{$1}`);
      }
      const remaining = matchesIn(analyzeFixed(fixed), /\\(bf|it|rm|sf|tt|sc|sl)(?![A-Za-z@])/);
      fixed = applyEdits(
        fixed,
        remaining.map((m) => [m.index!, m.index! + m[0].length, `\\${FONT_SWITCHES[m[1]].declaration}`])
      );
      add({
        rule: 'obsolete-font-command',
        line: n,
        title: `Obsolete font command ${names}`,
        explanation: 'The two-letter font commands are LaTeX 2.09 leftovers: they reset each other, so {\\bf\\it x} is not bold italic. Use \\textbf{...} or the \\bfseries declaration.',
        source: 'l2tabu',
        fix: fixed !== raw ? { label: 'Use \\textbf-style commands', find: raw, replace: fixed } : undefined,
      });
    }

    // eqnarray
    if (/\\begin\s*\{eqnarray\*?\}/.test(code)) {
      add({
        rule: 'eqnarray',
        line: n,
        title: 'eqnarray environment',
        explanation: 'eqnarray puts too much space around the relation symbol and numbers lines inconsistently. Use align from amsmath; its columns are written a &= b instead of a &=& b, so this is a manual change.',
        source: 'l2tabu',
      });
    }

    // Word \ref{...}: a line break may separate "Figure" from its number.
    // Matched on `code`, where the spaces are the source's own: on the math
    // mask a whole formula would read as blanks and the fix would delete it.
    // The reference itself has to be in text, not math.
    const tieMatches = inBody
      ? matchesIn(code, /([^\s~{])( +)\\(ref|eqref|pageref|cite)(?![A-Za-z])/).filter(
          (m) => text[m.index! + m[1].length + m[2].length] === '\\'
        )
      : [];
    if (tieMatches.length) {
      const edits: Array<[number, number, string]> = tieMatches.map((m) => {
        const spaceStart = m.index! + m[1].length;
        return [spaceStart, spaceStart + m[2].length, '~'];
      });
      add({
        rule: 'tie-before-reference',
        line: n,
        title: 'Breakable space before a reference',
        explanation: 'A normal space lets the line break between "Figure" and its number, or a word and its citation. A tie (~) keeps them together.',
        source: 'ChkTeX',
        fix: { label: 'Use ~', find: raw, replace: applyEdits(raw, edits) },
      });
    }

    // ... in text
    const dots = matchesIn(prose, /(?<!\.)\.\.\.(?!\.)/);
    if (dots.length) {
      add({
        rule: 'ellipsis',
        line: n,
        title: 'Three periods instead of \\dots',
        explanation: 'Three typed periods are spaced too tightly and can break across lines. \\dots gives a proper ellipsis.',
        source: 'ChkTeX',
        fix: {
          label: 'Use \\dots',
          find: raw,
          replace: applyEdits(raw, dots.map((m) => [m.index!, m.index! + 3, '\\dots{}'])),
        },
      });
    }

    // "quoted" in text
    if (!usesGermanQuotes) {
      const quotes = matchesIn(prose, /"([^"\n]+)"/);
      if (quotes.length) {
        add({
          rule: 'straight-quotes',
          line: n,
          title: 'Straight double quotes',
          explanation: 'LaTeX prints " as two closing quotes, so "word" comes out as ”word”. Open with `` and close with \'\'.',
          source: 'ChkTeX',
          fix: {
            label: "Use `` and ''",
            find: raw,
            replace: applyEdits(
              raw,
              quotes.flatMap((m) => [
                [m.index!, m.index! + 1, '``'] as [number, number, string],
                [m.index! + m[0].length - 1, m.index! + m[0].length, "''"] as [number, number, string],
              ])
            ),
          },
        });
      }
    }

    // \over in math
    if (/\\over(?![A-Za-z])/.test(math)) {
      add({
        rule: 'over',
        line: n,
        title: '\\over instead of \\frac',
        explanation: '\\over is plain TeX and takes everything around it in the group as numerator and denominator, which is easy to get wrong. Write \\frac{a}{b}.',
        source: 'l2tabu',
      });
    }

    // Obsolete packages
    for (const m of matchesIn(code, /\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)) {
      for (const pkg of m[1].split(',').map((s) => s.trim())) {
        if (OBSOLETE_PACKAGES[pkg]) {
          add({
            rule: 'obsolete-package',
            line: n,
            title: `Obsolete package ${pkg}`,
            explanation: `${pkg} is outdated and no longer maintained. Use ${OBSOLETE_PACKAGES[pkg]} instead; the commands differ, so this is a manual change.`,
            source: 'l2tabu',
          });
        }
      }
    }

    // Floats: \label must follow \caption; \begin{center} adds extra space
    if (/\\begin\s*\{(figure|table)\*?\}/.test(code)) {
      inFloat = true;
      captionSeen = false;
      earlyLabelLine = -1;
    }
    if (inFloat) {
      const labelAt = code.search(/\\label\s*\{/);
      const captionAt = code.search(/\\caption\s*[[{]/);
      if (labelAt >= 0 && !captionSeen && earlyLabelLine < 0 && (captionAt < 0 || labelAt < captionAt)) earlyLabelLine = n;
      if (captionAt >= 0 && !captionSeen) {
        captionSeen = true;
        if (earlyLabelLine > 0) {
          add({
            rule: 'label-before-caption',
            line: earlyLabelLine,
            title: '\\label before \\caption',
            explanation: `The number is assigned when \\caption runs, so a \\label before it (line ${earlyLabelLine}, caption on line ${n}) refers to the enclosing section instead of this figure or table. Move \\label after \\caption.`,
            source: 'l2tabu',
          });
        }
      }
      if (/\\begin\s*\{center\}/.test(code)) {
        add({
          rule: 'center-in-float',
          line: n,
          title: 'center environment inside a float',
          explanation: '\\begin{center} adds vertical space above and below, on top of the float\'s own spacing. Inside a figure or table, \\centering centres without the extra space.',
          source: 'l2tabu',
        });
      }
      if (/\\end\s*\{(figure|table)\*?\}/.test(code)) inFloat = false;
    }

    // Collect labels, references, citations
    for (const m of matchesIn(code, /\\label\s*\{([^}]+)\}/)) {
      const key = m[1].trim();
      if (labels.has(key)) {
        add({
          rule: 'duplicate-label',
          line: n,
          title: `Duplicate label "${key}"`,
          explanation: `"${key}" is already defined on line ${labels.get(key)}. References go to whichever LaTeX sees last, so one of them points at the wrong place.`,
          source: 'Oberleaf',
        });
      } else {
        labels.set(key, n);
      }
    }
    for (const m of matchesIn(code, /\\(ref|eqref|pageref|autoref|cref|Cref|nameref)\s*\{([^}]+)\}/)) {
      for (const key of m[2].split(',')) refs.push({ key: key.trim(), line: n, col: m.index!, command: m[1] });
    }
    for (const m of matchesIn(code, /\\(cite[a-zA-Z]*|nocite|parencite|textcite|autocite)\s*(?:\[[^\]]*\]\s*){0,2}\{([^}]+)\}/)) {
      for (const key of m[2].split(',')) cites.push({ key: key.trim(), line: n, command: m[1] });
    }
    for (const m of matchesIn(code, /\\bibitem\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)) bibitems.add(m[1].trim());

    // Images
    if (context.projectFiles) {
      for (const m of matchesIn(code, /\\includegraphics\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/)) {
        const target = m[1].trim().replace(/\\/g, '/').replace(/^\.\//, '');
        const files = context.projectFiles.map((f) => f.replace(/\\/g, '/'));
        const lower = files.map((f) => f.toLowerCase());
        // The compiler puts every project folder on TeX's search path, so a
        // bare name resolves anywhere in the project.
        const hit = IMAGE_EXTENSIONS.some((ext) => {
          const want = (target + ext).toLowerCase();
          return lower.some((f) => f === want || f.endsWith(`/${want}`));
        });
        if (!hit) {
          const base = target.split('/').pop()!;
          const imageFiles = files.filter((f) => /\.(pdf|png|jpe?g|eps)$/i.test(f));
          const guess = closestMatch(base, imageFiles.map((f) => f.split('/').pop()!));
          const guessPath = guess ? imageFiles.find((f) => f.split('/').pop() === guess) : undefined;
          add({
            rule: 'missing-image',
            line: n,
            title: `Image "${target}" not in the project`,
            explanation: guessPath
              ? `No file named ${target} exists in the project. ${guessPath} is the closest match.`
              : `No file named ${target} (with or without .pdf, .png, .jpg or .eps) exists in the project. Upload it or fix the path.`,
            source: 'Oberleaf',
            fix: guessPath
              ? { label: `Use ${guessPath}`, find: raw, replace: raw.replace(`{${m[1]}}`, `{${guessPath}}`) }
              : undefined,
          });
        }
      }
    }
  });

  // \ref to a label that does not exist. Skipped for multi-file documents,
  // whose labels may live in files this check does not read.
  if (!isMultiFile) {
    const known = [...labels.keys()];
    const reported = new Set<string>();
    for (const r of refs) {
      if (labels.has(r.key) || reported.has(`${r.line}:${r.key}`)) continue;
      reported.add(`${r.line}:${r.key}`);
      const guess = closestMatch(r.key, known);
      const raw = lines[r.line - 1].raw;
      add({
        rule: 'undefined-reference',
        line: r.line,
        title: `Reference to undefined label "${r.key}"`,
        explanation: guess
          ? `There is no \\label{${r.key}}, so the reference prints as ??. Did you mean "${guess}"?`
          : `There is no \\label{${r.key}} in this document, so the reference prints as ??.`,
        source: 'Oberleaf',
        fix: guess ? { label: `Use ${guess}`, find: raw, replace: raw.replace(new RegExp(`(\\{[^}]*?)\\b${escapeRe(r.key)}\\b`), `$1${guess}`) } : undefined,
      });
    }
  }

  // \cite keys that no .bib entry or \bibitem defines. Only when there is a
  // bibliography to compare with: without one the compile reports it anyway.
  const bibKeys = new Set([...(context.bibKeys ?? []), ...bibitems]);
  if (bibKeys.size > 0) {
    const all = [...bibKeys];
    const reported = new Set<string>();
    for (const c of cites) {
      if (c.key === '*' || bibKeys.has(c.key) || reported.has(`${c.line}:${c.key}`)) continue;
      reported.add(`${c.line}:${c.key}`);
      const guess = closestMatch(c.key, all);
      const raw = lines[c.line - 1].raw;
      add({
        rule: 'undefined-citation',
        line: c.line,
        title: `Citation key "${c.key}" not in the bibliography`,
        explanation: guess
          ? `No bibliography entry has the key "${c.key}", so it prints as [?]. Did you mean "${guess}"?`
          : `No bibliography entry has the key "${c.key}", so it prints as [?]. Check the key in your .bib file.`,
        source: 'Oberleaf',
        fix: guess ? { label: `Use ${guess}`, find: raw, replace: raw.replace(new RegExp(`(\\{[^}]*?)\\b${escapeRe(c.key)}\\b`), `$1${guess}`) } : undefined,
      });
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Text mask of a single already-fixed line, for the second font pass
function analyzeFixed(line: string): string {
  return analyze(line)[0].text;
}
