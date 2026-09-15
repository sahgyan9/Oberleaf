export interface SectionNode {
  id: string;
  command: string;
  isStarred: boolean;
  level: number;
  rawTitle: string;
  title: string;
  startLine: number;
  endLine: number;
  children: SectionNode[];
  parentId: string | null;
}

export interface OutlineResult {
  flat: SectionNode[];
  tree: SectionNode[];
}

export const SECTION_LEVELS: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
};

export function cleanLatexTitle(raw: string): string {
  let title = raw;
  // Unwrap common text styling macros while preserving their content
  for (let i = 0; i < 3; i++) {
    title = title.replace(
      /\\(?:textbf|textit|emph|underline|texttt|textsf|textsc|text|mathversion)\s*\{([^{}]*)\}/g,
      '$1'
    );
  }
  // Strip citations, labels, and cross-references from the displayed title
  title = title.replace(/\\(?:label|cite|citep|citet|ref|pageref|eqref)\s*(?:\[[^\]]*\])?\s*\{[^{}]*\}/g, '');
  title = title.replace(/\\\\/g, ' ');
  // Unescape standard LaTeX special characters
  title = title.replace(/\\([%$&#_{}])/g, '$1');
  // Strip inline math delimiters
  title = title.replace(/\$([^$]+)\$/g, '$1');
  title = title.replace(/\s+/g, ' ').trim();
  return title || 'Untitled Section';
}

function stripComments(line: string): string {
  let inEscape = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\') {
      inEscape = !inEscape;
    } else {
      if (ch === '%' && !inEscape) {
        return line.slice(0, i);
      }
      inEscape = false;
    }
  }
  return line;
}

export function parseLatexOutline(content: string): OutlineResult {
  const lines = content.split('\n');
  const headings: SectionNode[] = [];
  const terminators: { line: number }[] = [];

  const headingPattern =
    /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(?:\[[^\]]*\])?\s*\{/;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx];
    const cleanLine = stripComments(rawLine);

    // Keep track of explicit document boundaries
    if (/\\(?:end\{document\}|appendix|bibliography|printbibliography)/.test(cleanLine)) {
      terminators.push({ line: lineIdx + 1 });
    }

    const match = cleanLine.match(headingPattern);
    if (!match) continue;

    const command = match[1];
    const isStarred = match[2] === '*';
    const level = SECTION_LEVELS[command] ?? 2;

    const matchIdx = cleanLine.indexOf(match[0]);
    const braceStartIdx = matchIdx + match[0].length - 1;

    let braceDepth = 0;
    let titleContent = '';
    let currLineIdx = lineIdx;
    let currCharIdx = braceStartIdx;
    let foundClose = false;

    // Handle multiline titles and nested curly braces
    while (currLineIdx < lines.length) {
      const activeLine = currLineIdx === lineIdx ? cleanLine : stripComments(lines[currLineIdx]);
      for (let c = currCharIdx; c < activeLine.length; c++) {
        const char = activeLine[c];
        if (char === '{' && (c === 0 || activeLine[c - 1] !== '\\')) {
          braceDepth++;
          if (braceDepth > 1) titleContent += char;
        } else if (char === '}' && (c === 0 || activeLine[c - 1] !== '\\')) {
          braceDepth--;
          if (braceDepth === 0) {
            foundClose = true;
            break;
          } else {
            titleContent += char;
          }
        } else if (braceDepth > 0) {
          titleContent += char;
        }
      }

      if (foundClose) break;
      titleContent += '\n';
      currLineIdx++;
      currCharIdx = 0;
    }

    const startLine = lineIdx + 1;
    const rawTitle = titleContent.trim();
    const displayTitle = cleanLatexTitle(rawTitle);

    headings.push({
      id: `sec-${startLine}`,
      command,
      isStarred,
      level,
      rawTitle,
      title: displayTitle,
      startLine,
      endLine: lines.length,
      children: [],
      parentId: null,
    });
  }

  // Calculate endLine boundaries
  for (let i = 0; i < headings.length; i++) {
    const current = headings[i];
    let endLine = lines.length;

    // A section ends immediately before the next heading of equal or higher hierarchy
    for (let j = i + 1; j < headings.length; j++) {
      if (headings[j].level <= current.level) {
        endLine = headings[j].startLine - 1;
        break;
      }
    }

    // A section also ends before document terminators
    for (const term of terminators) {
      if (term.line > current.startLine && term.line - 1 < endLine) {
        endLine = term.line - 1;
      }
    }

    current.endLine = Math.max(current.startLine, endLine);
  }

  // Build hierarchical outline tree
  const root: SectionNode[] = [];
  const stack: SectionNode[] = [];

  for (const node of headings) {
    while (stack.length > 0 && stack[stack.length - 1].level >= node.level) {
      stack.pop();
    }

    if (stack.length === 0) {
      node.parentId = null;
      root.push(node);
    } else {
      const parent = stack[stack.length - 1];
      node.parentId = parent.id;
      parent.children.push(node);
    }

    stack.push(node);
  }

  return { flat: headings, tree: root };
}

export interface SectionMoveResult {
  newContent: string;
  sourceRange: { startLine: number; endLine: number };
  insertLine: number;
}

export function computeSectionMove(
  content: string,
  sourceId: string,
  targetId: string,
  position: 'before' | 'after'
): SectionMoveResult | null {
  const { flat } = parseLatexOutline(content);
  const sourceNode = flat.find((n) => n.id === sourceId);
  const targetNode = flat.find((n) => n.id === targetId);

  if (!sourceNode || !targetNode) {
    return null;
  }

  if (sourceId === targetId) {
    return null;
  }

  // Cannot move a section into its own child subsection
  if (targetNode.startLine >= sourceNode.startLine && targetNode.endLine <= sourceNode.endLine) {
    return null;
  }

  const lines = content.split('\n');
  const count = sourceNode.endLine - sourceNode.startLine + 1;

  let targetLine: number;
  if (position === 'before') {
    targetLine = targetNode.startLine;
  } else {
    targetLine = targetNode.endLine + 1;
  }

  // Protect preamble: ensure target is not before \begin{document}
  for (let i = 0; i < lines.length; i++) {
    if (/\\begin\{document\}/.test(stripComments(lines[i]))) {
      const beginDocLine = i + 1;
      if (targetLine <= beginDocLine) {
        targetLine = beginDocLine + 1;
      }
      break;
    }
  }

  // Protect document end: ensure target is not after \end{document}
  for (let i = 0; i < lines.length; i++) {
    if (/\\end\{document\}/.test(stripComments(lines[i]))) {
      const endDocLine = i + 1;
      if (targetLine > endDocLine) {
        targetLine = endDocLine;
      }
      break;
    }
  }

  // Dropping into the same position is a no-op
  if (targetLine >= sourceNode.startLine && targetLine <= sourceNode.endLine + 1) {
    return null;
  }

  const chunk = lines.splice(sourceNode.startLine - 1, count);

  let insertIndex: number;
  if (targetLine < sourceNode.startLine) {
    insertIndex = targetLine - 1;
  } else {
    insertIndex = targetLine - 1 - count;
  }

  lines.splice(insertIndex, 0, ...chunk);
  const newContent = lines.join('\n');

  return {
    newContent,
    sourceRange: { startLine: sourceNode.startLine, endLine: sourceNode.endLine },
    insertLine: targetLine < sourceNode.startLine ? targetLine : targetLine - count,
  };
}
