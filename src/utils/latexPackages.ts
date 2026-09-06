export interface DetectedMissingPackage {
  packageName: string;
  codeSnippet: string;
  label: string;
  description: string;
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
    pattern: /\\begin\{(align\*?|gather\*?|multline\*?|bmatrix|pmatrix|vmatrix|Vmatrix|Bmatrix|aligned|gathered)\}/,
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

export function injectPackagesIntoPreamble(content: string, packages: DetectedMissingPackage[]): string {
  if (packages.length === 0) return content;

  let updatedContent = content;

  const toAdd = packages.filter(
    (pkg) => !new RegExp(`\\\\usepackage(?:\\[.*?\\])?\\{${pkg.packageName}\\}`, 'i').test(updatedContent)
  );

  if (toAdd.length === 0) return content;

  const standardPackages = toAdd.filter((p) => p.packageName !== 'hyperref');
  const hasHyperref = toAdd.some((p) => p.packageName === 'hyperref');

  if (standardPackages.length > 0) {
    const standardSnippet = standardPackages.map((p) => p.codeSnippet).join('\n');
    const usePackageMatches = [...updatedContent.matchAll(/\\usepackage(?:\[.*?\])?\{.*?\}/g)];
    const docClassMatch = updatedContent.match(/(\\documentclass(?:\[.*?\])?\{.*?\})/);

    if (usePackageMatches.length > 0) {
      const lastPkg = usePackageMatches[usePackageMatches.length - 1];
      const insertPos = lastPkg.index! + lastPkg[0].length;
      updatedContent = updatedContent.slice(0, insertPos) + `\n${standardSnippet}` + updatedContent.slice(insertPos);
    } else if (docClassMatch && docClassMatch.index !== undefined) {
      const insertPos = docClassMatch.index + docClassMatch[0].length;
      updatedContent = updatedContent.slice(0, insertPos) + `\n\n${standardSnippet}` + updatedContent.slice(insertPos);
    } else {
      updatedContent = `${standardSnippet}\n${updatedContent}`;
    }
  }

  if (hasHyperref) {
    const hyperrefSnippet = '\\usepackage{hyperref}';
    const beginDocMatch = updatedContent.match(/\\begin\{document\}/);
    if (beginDocMatch && beginDocMatch.index !== undefined) {
      const insertPos = beginDocMatch.index;
      updatedContent = updatedContent.slice(0, insertPos) + `${hyperrefSnippet}\n\n` + updatedContent.slice(insertPos);
    } else {
      updatedContent = `${updatedContent}\n${hyperrefSnippet}`;
    }
  }

  return updatedContent;
}

export function wrapMathEnvironment(content: string, line: number, envName: string = 'bmatrix'): string {
  const lines = content.split('\n');
  const targetLineIdx = line > 0 ? line - 1 : 0;

  let startIdx = -1;
  const searchOffsets = [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5];
  for (const offset of searchOffsets) {
    const idx = targetLineIdx + offset;
    if (idx >= 0 && idx < lines.length) {
      if (lines[idx].includes(`\\begin{${envName}}`)) {
        startIdx = idx;
        break;
      }
    }
  }

  if (startIdx === -1) {
    startIdx = lines.findIndex((l) => l.includes(`\\begin{${envName}}`));
  }

  if (startIdx === -1) return content;

  let endIdx = -1;
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].includes(`\\end{${envName}}`)) {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) return content;

  const indent = lines[startIdx].match(/^\s*/)?.[0] || '';
  const prevLine = startIdx > 0 ? lines[startIdx - 1].trim() : '';
  const nextLine = endIdx < lines.length - 1 ? lines[endIdx + 1].trim() : '';

  if (prevLine === '\\[' && nextLine === '\\]') {
    return content;
  }

  lines.splice(endIdx + 1, 0, `${indent}\\]`);
  lines.splice(startIdx, 0, `${indent}\\[`);

  return lines.join('\n');
}
