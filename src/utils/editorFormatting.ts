export interface FormattingConfig {
  prefix: string;
  suffix: string;
  placeholder?: string;
  alternatePrefixes?: string[];
}

export const BOLD_FORMAT: FormattingConfig = {
  prefix: '\\textbf{',
  suffix: '}',
  placeholder: 'text',
  alternatePrefixes: ['\\mathbf{', '\\bm{'],
};

export const ITALIC_FORMAT: FormattingConfig = {
  prefix: '\\textit{',
  suffix: '}',
  placeholder: 'text',
  alternatePrefixes: ['\\mathit{', '\\emph{'],
};

/**
 * Wraps or toggles wrapping of selected code/text in Monaco editor.
 * 
 * Supports:
 * 1. Self-unwrap: If selection starts with prefix (or alternate) and ends with suffix (e.g. `\textbf{foo}` -> `foo`).
 * 2. Surrounding-unwrap: If selection is surrounded by prefix and suffix (e.g. `\textbf{|foo|}` -> `foo`, or `\textbf{|}` -> empty).
 * 3. Wrap: If text is selected and not wrapped, wraps it (e.g. `foo` -> `\textbf{foo}`) and keeps the inner content selected.
 * 4. Empty cursor: Inserts `prefix + placeholder + suffix` and selects placeholder (or positions cursor inside).
 * 
 * Uses Monaco pushUndoStop() so Ctrl+Z / Ctrl+Y cleanly undoes/redoes formatting in a single step.
 */
export function wrapOrToggleFormatting(
  editor: any,
  config: FormattingConfig
): void {
  if (!editor) return;

  const model = editor.getModel();
  const selection = editor.getSelection();
  if (!model || !selection) return;

  const prefix = config.prefix;
  const suffix = config.suffix;
  const placeholder = config.placeholder ?? 'text';
  const allPrefixes = [prefix, ...(config.alternatePrefixes || [])];

  const fullText: string = model.getValue();
  const startPos = selection.getStartPosition();
  const endPos = selection.getEndPosition();
  const startOffset = model.getOffsetAt(startPos);
  const endOffset = model.getOffsetAt(endPos);
  const selectedText: string = model.getValueInRange(selection);

  editor.pushUndoStop();

  // Case 1: The selection itself starts with prefix (or alternate) and ends with suffix (e.g. "\textbf{text}")
  for (const p of allPrefixes) {
    if (
      selectedText.length >= p.length + suffix.length &&
      selectedText.startsWith(p) &&
      selectedText.endsWith(suffix)
    ) {
      const innerText = selectedText.slice(p.length, selectedText.length - suffix.length);
      editor.executeEdits('unwrap-formatting-self', [
        {
          range: selection,
          text: innerText,
          forceMoveMarkers: true,
        },
      ]);
      const newStartPos = model.getPositionAt(startOffset);
      const newEndPos = model.getPositionAt(startOffset + innerText.length);
      editor.setSelection({
        startLineNumber: newStartPos.lineNumber,
        startColumn: newStartPos.column,
        endLineNumber: newEndPos.lineNumber,
        endColumn: newEndPos.column,
      });
      editor.pushUndoStop();
      editor.focus();
      return;
    }
  }

  // Case 2: The selection is surrounded by prefix and suffix in the document
  // e.g. text is "\textbf{text}" and user selected "text", or empty cursor between "\textbf{}"
  for (const p of allPrefixes) {
    if (startOffset >= p.length && endOffset + suffix.length <= fullText.length) {
      const textBefore = fullText.slice(startOffset - p.length, startOffset);
      const textAfter = fullText.slice(endOffset, endOffset + suffix.length);

      if (textBefore === p && textAfter === suffix) {
        const outerStartPos = model.getPositionAt(startOffset - p.length);
        const outerEndPos = model.getPositionAt(endOffset + suffix.length);
        const outerRange = {
          startLineNumber: outerStartPos.lineNumber,
          startColumn: outerStartPos.column,
          endLineNumber: outerEndPos.lineNumber,
          endColumn: outerEndPos.column,
        };

        editor.executeEdits('unwrap-formatting-surrounding', [
          {
            range: outerRange,
            text: selectedText,
            forceMoveMarkers: true,
          },
        ]);

        const newStartPos = model.getPositionAt(startOffset - p.length);
        const newEndPos = model.getPositionAt(startOffset - p.length + selectedText.length);
        editor.setSelection({
          startLineNumber: newStartPos.lineNumber,
          startColumn: newStartPos.column,
          endLineNumber: newEndPos.lineNumber,
          endColumn: newEndPos.column,
        });
        editor.pushUndoStop();
        editor.focus();
        return;
      }
    }
  }

  // Case 3: Selection is not empty -> wrap it
  if (selectedText.length > 0) {
    const wrappedText = `${prefix}${selectedText}${suffix}`;
    editor.executeEdits('wrap-formatting', [
      {
        range: selection,
        text: wrappedText,
        forceMoveMarkers: true,
      },
    ]);

    // Keep the wrapped content selected so user can see it or toggle it off immediately
    const newStartPos = model.getPositionAt(startOffset + prefix.length);
    const newEndPos = model.getPositionAt(startOffset + prefix.length + selectedText.length);
    editor.setSelection({
      startLineNumber: newStartPos.lineNumber,
      startColumn: newStartPos.column,
      endLineNumber: newEndPos.lineNumber,
      endColumn: newEndPos.column,
    });
    editor.pushUndoStop();
    editor.focus();
    return;
  }

  // Case 4: No selection (empty cursor) -> insert prefix + placeholder + suffix
  const insertText = `${prefix}${placeholder}${suffix}`;
  editor.executeEdits('insert-formatting', [
    {
      range: selection,
      text: insertText,
      forceMoveMarkers: true,
    },
  ]);

  if (placeholder.length > 0) {
    // Select placeholder so immediate typing overwrites it
    const newStartPos = model.getPositionAt(startOffset + prefix.length);
    const newEndPos = model.getPositionAt(startOffset + prefix.length + placeholder.length);
    editor.setSelection({
      startLineNumber: newStartPos.lineNumber,
      startColumn: newStartPos.column,
      endLineNumber: newEndPos.lineNumber,
      endColumn: newEndPos.column,
    });
  } else {
    // Position cursor inside braces
    const cursorInsidePos = model.getPositionAt(startOffset + prefix.length);
    editor.setPosition(cursorInsidePos);
  }

  editor.pushUndoStop();
  editor.focus();
}

/**
 * Universal wrapper for toolbar buttons and external callers.
 */
export function wrapOrToggleSelection(
  editor: any,
  prefix: string,
  suffix: string,
  placeholder: string = 'text'
): void {
  if (prefix === BOLD_FORMAT.prefix) {
    wrapOrToggleFormatting(editor, BOLD_FORMAT);
  } else if (prefix === ITALIC_FORMAT.prefix) {
    wrapOrToggleFormatting(editor, ITALIC_FORMAT);
  } else {
    wrapOrToggleFormatting(editor, { prefix, suffix, placeholder });
  }
}
