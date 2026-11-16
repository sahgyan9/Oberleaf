import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Search, FileText, Hash, CornerDownLeft, FolderOpen, Terminal } from 'lucide-react';

/**
 * One box for getting anywhere: a file in the project, a heading in the open
 * document, another project, or any action the toolbars offer. Opened with
 * Ctrl+K. It exists because a long thesis has dozens of files and headings,
 * and because toolbar buttons fold away on a narrow window.
 */

export interface PaletteItem {
  id: string;
  group: 'Commands' | 'Files' | 'Headings' | 'Projects';
  label: string;
  /** Secondary text: a path, a shortcut, a heading level */
  detail?: string;
  /** Extra words to match that are not shown */
  keywords?: string;
  shortcut?: string;
  run: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  items: PaletteItem[];
}

const GROUP_ORDER: PaletteItem['group'][] = ['Commands', 'Files', 'Headings', 'Projects'];
const GROUP_ICON: Record<PaletteItem['group'], React.ReactNode> = {
  Commands: <Terminal className="w-3.5 h-3.5" />,
  Files: <FileText className="w-3.5 h-3.5" />,
  Headings: <Hash className="w-3.5 h-3.5" />,
  Projects: <FolderOpen className="w-3.5 h-3.5" />,
};
const MAX_PER_GROUP = 8;

/**
 * Scores how well the query matches the text; null when it does not.
 * Every query word must appear, either as a substring or as letters in order
 * ("ltr" finds "literature-review"). Earlier and tighter matches score higher.
 */
export function matchScore(query: string, text: string): number | null {
  const haystack = text.toLowerCase();
  let total = 0;
  for (const word of query.toLowerCase().split(/\s+/).filter(Boolean)) {
    const at = haystack.indexOf(word);
    if (at !== -1) {
      const atWordStart = at === 0 || /[\s/\-_.:]/.test(haystack[at - 1]);
      total += 100 - Math.min(at, 40) + (atWordStart ? 30 : 0);
      continue;
    }
    let pos = 0;
    let gaps = 0;
    for (const ch of word) {
      const found = haystack.indexOf(ch, pos);
      if (found === -1) return null;
      gaps += found - pos;
      pos = found + 1;
    }
    total += Math.max(1, 40 - gaps);
  }
  return total;
}

// The dialog is mounted only while open, so every opening starts with an
// empty query and the first result selected. (Kept mounted, it reopened with
// the previous search still in the box.)
export const CommandPalette: React.FC<CommandPaletteProps> = (props) =>
  props.isOpen ? <PaletteDialog {...props} /> : null;

const PaletteDialog: React.FC<CommandPaletteProps> = ({ onClose, items }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus in the same frame the dialog appears (the input also has
  // autoFocus). Waiting a frame let the first keystrokes of someone typing
  // straight after Ctrl+K land in the document instead.
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) {
      // With nothing typed, show what is most useful to start from.
      return GROUP_ORDER.filter((g) => g !== 'Projects').flatMap((group) =>
        items.filter((i) => i.group === group).slice(0, group === 'Commands' ? 6 : 5)
      );
    }
    const groups = GROUP_ORDER.map((group) => {
      const scored = items
        .filter((i) => i.group === group)
        // A match in the name outranks one in the path or the hidden keywords.
        .map((item) => {
          const inLabel = matchScore(q, item.label);
          const anywhere = matchScore(q, `${item.label} ${item.detail ?? ''} ${item.keywords ?? ''}`);
          return { item, score: inLabel !== null ? inLabel + 50 : anywhere };
        })
        .filter((x): x is { item: PaletteItem; score: number } => x.score !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, MAX_PER_GROUP);
      return { scored, best: scored[0]?.score ?? -1 };
    });
    // The group holding the best match comes first: typing a file name should
    // not leave the file below eight loosely matching commands.
    return groups
      .filter((g) => g.scored.length > 0)
      .sort((a, b) => b.best - a.best)
      .flatMap((g) => g.scored.map((x) => x.item));
  }, [items, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const run = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    item.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(results[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  let lastGroup: string | null = null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 px-3 pt-[12vh] font-sans"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search files, headings and commands"
        className="w-full max-w-xl rounded-xl bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2.5 px-4 border-b border-surface-lightBorder dark:border-surface-darkBorder">
          <Search className="w-4 h-4 flex-shrink-0 text-stone-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Go to a file or heading, or run a command"
            aria-label="Search files, headings and commands"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            spellCheck={false}
            autoComplete="off"
            autoFocus
            className="flex-1 min-w-0 py-3 bg-transparent text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 outline-none"
          />
          <kbd className="flex-shrink-0 px-1.5 py-0.5 rounded border border-surface-lightBorder dark:border-surface-darkBorder font-mono text-[10px] text-stone-400">
            Esc
          </kbd>
        </div>

        <div ref={listRef} id="command-palette-list" role="listbox" className="max-h-[52vh] overflow-y-auto p-1.5">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-stone-500 dark:text-stone-400">Nothing matches "{query}".</p>
          ) : (
            results.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              const isActive = i === active;
              return (
                <React.Fragment key={item.id}>
                  {header && (
                    <div className="px-2.5 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.05em] text-stone-400 dark:text-stone-500">
                      {header}
                    </div>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive}
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(item)}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-left text-xs transition-colors ${
                      isActive
                        ? 'bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-stone-900 dark:text-stone-100'
                        : 'text-stone-700 dark:text-stone-300'
                    }`}
                  >
                    <span className={`flex-shrink-0 ${isActive ? 'text-scholarly dark:text-scholarly-dark' : 'text-stone-400'}`}>
                      {GROUP_ICON[item.group]}
                    </span>
                    <span className="truncate">{item.label}</span>
                    {item.detail && <span className="truncate text-[11px] text-stone-400 dark:text-stone-500 font-mono">{item.detail}</span>}
                    <span className="flex-1" />
                    {item.shortcut && (
                      <kbd className="flex-shrink-0 font-mono text-[10px] text-stone-400 dark:text-stone-500">{item.shortcut}</kbd>
                    )}
                    {isActive && <CornerDownLeft className="w-3 h-3 flex-shrink-0 text-stone-400" />}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
