import React, { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { X, Search, Omega, CornerDownLeft } from 'lucide-react';
import { CHEAT_SHEET, SHORTCUTS, SYMBOL_GROUPS, type SymbolEntry } from '../../utils/latexReference';
import { readSetting, writeSetting } from '../../utils/storage';

/**
 * Symbols, a first-document cheat sheet and the keyboard shortcuts, in a panel
 * that stays open beside the editor. Nobody remembers whether it is \epsilon
 * or \varepsilon; looking it up should not mean leaving the document.
 *
 * It is not a modal: the editor stays usable, so several symbols can be
 * inserted in a row.
 */

interface ReferencePanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Inserts a math symbol; the host wraps it in $...$ when the cursor is in text */
  onInsertSymbol: (command: string) => void;
  /** Inserts a snippet exactly as given */
  onInsertSnippet: (snippet: string) => void;
}

type Tab = 'symbols' | 'cheatsheet' | 'shortcuts';

const rendered = new Map<string, string>();
function renderSymbol(entry: SymbolEntry): string {
  const source = entry.display ?? entry.command;
  let html = rendered.get(source);
  if (html === undefined) {
    try {
      html = katex.renderToString(source, { throwOnError: true, displayMode: false, output: 'html' });
    } catch {
      html = '';
    }
    rendered.set(source, html);
  }
  return html;
}

export const ReferencePanel: React.FC<ReferencePanelProps> = ({ isOpen, onClose, onInsertSymbol, onInsertSnippet }) => {
  const [tab, setTab] = useState<Tab>(() => (readSetting('reference-tab') as Tab) || 'symbols');
  const [query, setQuery] = useState('');
  const [hovered, setHovered] = useState<SymbolEntry | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && tab === 'symbols') requestAnimationFrame(() => searchRef.current?.focus());
  }, [isOpen, tab]);

  useEffect(() => {
    writeSetting('reference-tab', tab);
  }, [tab]);

  const groups = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return SYMBOL_GROUPS;
    return SYMBOL_GROUPS.map((g) => ({
      ...g,
      symbols: g.symbols.filter((sym) => {
        const text = `${sym.command} ${sym.name}`.toLowerCase();
        return words.every((w) => text.includes(w));
      }),
    })).filter((g) => g.symbols.length > 0);
  }, [query]);

  if (!isOpen) return null;

  const tabButton = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`px-2.5 py-1 rounded font-medium transition whitespace-nowrap ${
        tab === id
          ? 'bg-white dark:bg-surface-darkPanel text-stone-900 dark:text-stone-100 shadow-sm'
          : 'text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200'
      }`}
    >
      {label}
    </button>
  );

  const firstMatch = groups[0]?.symbols[0];

  return (
    <aside
      aria-label="Symbols and LaTeX reference"
      className="fixed right-0 top-14 bottom-7 z-40 w-[340px] max-w-[92vw] flex flex-col bg-surface-lightPanel dark:bg-surface-darkPanel border-l border-surface-lightBorder dark:border-surface-darkBorder shadow-2xl font-sans text-xs animate-in slide-in-from-right duration-150"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div className="h-11 px-3 flex items-center justify-between gap-2 border-b border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0 font-serif font-semibold text-sm text-stone-900 dark:text-stone-100">
          <Omega className="w-4 h-4 flex-shrink-0 text-scholarly dark:text-scholarly-dark" />
          <span className="truncate">Reference</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close reference panel"
          title="Close (Esc)"
          className="p-1.5 flex-shrink-0 rounded text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="px-3 pt-2.5 flex-shrink-0">
        <div role="tablist" aria-label="Reference sections" className="inline-flex items-center bg-stone-200/60 dark:bg-stone-800 rounded-md p-0.5">
          {tabButton('symbols', 'Symbols')}
          {tabButton('cheatsheet', 'Cheat Sheet')}
          {tabButton('shortcuts', 'Shortcuts')}
        </div>
      </div>

      {tab === 'symbols' && (
        <>
          <div className="px-3 pt-2.5 flex-shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && firstMatch) {
                    e.preventDefault();
                    onInsertSymbol(firstMatch.command);
                  }
                }}
                placeholder="Search: integral, arrow, not equal"
                aria-label="Search symbols"
                className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md pl-8 pr-2 py-1.5 text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:border-scholarly dark:focus:border-scholarly-dark outline-none"
              />
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-3">
            {groups.length === 0 ? (
              <p className="py-6 text-center text-stone-500 dark:text-stone-400">
                No symbol matches "{query}". Try the plain name, such as "arrow" or "sum".
              </p>
            ) : (
              groups.map((g) => (
                <section key={g.id} aria-label={g.title}>
                  <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-stone-400 dark:text-stone-500">
                    {g.title}
                  </h3>
                  <div className="grid grid-cols-6 gap-1">
                    {g.symbols.map((sym) => {
                      const html = renderSymbol(sym);
                      return (
                        <button
                          key={sym.command}
                          type="button"
                          onClick={() => onInsertSymbol(sym.command)}
                          onMouseEnter={() => setHovered(sym)}
                          onFocus={() => setHovered(sym)}
                          onMouseLeave={() => setHovered((h) => (h === sym ? null : h))}
                          aria-label={`${sym.name}: ${sym.command}`}
                          title={sym.command}
                          className="h-10 flex items-center justify-center rounded-md border border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightSubtle/60 dark:bg-surface-darkSubtle/60 text-stone-900 dark:text-stone-100 hover:border-scholarly dark:hover:border-scholarly-dark hover:bg-scholarly-subtle dark:hover:bg-scholarly-darkSubtle transition overflow-hidden text-[13px]"
                        >
                          {html ? (
                            <span dangerouslySetInnerHTML={{ __html: html }} />
                          ) : (
                            <span className="font-mono text-[9px] truncate px-0.5">{sym.command}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>

          {/* What the pointed-at symbol is, and what clicking it does */}
          <div className="px-3 py-2 border-t border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0 min-h-[46px] text-[11px] text-stone-500 dark:text-stone-400">
            {hovered ? (
              <>
                <p className="font-mono text-stone-900 dark:text-stone-100 truncate">{hovered.command}</p>
                <p className="truncate">
                  {hovered.name}
                  {hovered.package ? `. Needs \\usepackage{${hovered.package}}.` : ''}
                </p>
              </>
            ) : (
              <p>Click a symbol to insert it at the cursor. Outside an equation it is wrapped in $...$ for you.</p>
            )}
          </div>
        </>
      )}

      {tab === 'cheatsheet' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5 space-y-4">
          <p className="text-[11px] text-stone-500 dark:text-stone-400">
            The constructs most documents are made of. Click one to insert it at the cursor.
          </p>
          {CHEAT_SHEET.map((group) => (
            <section key={group.title} aria-label={group.title}>
              <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.05em] text-stone-400 dark:text-stone-500">
                {group.title}
              </h3>
              <div className="space-y-1.5">
                {group.entries.map((entry) => (
                  <button
                    key={entry.task}
                    type="button"
                    onClick={() => onInsertSnippet(entry.code)}
                    title="Insert at the cursor"
                    className="group w-full text-left p-2 rounded-md border border-surface-lightBorder dark:border-surface-darkBorder hover:border-scholarly dark:hover:border-scholarly-dark transition"
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="font-medium text-stone-800 dark:text-stone-200">{entry.task}</span>
                      <CornerDownLeft className="w-3 h-3 flex-shrink-0 text-stone-300 dark:text-stone-600 group-hover:text-scholarly dark:group-hover:text-scholarly-dark" />
                    </span>
                    <pre className="mt-1 font-mono text-[11px] leading-relaxed text-scholarly dark:text-scholarly-dark whitespace-pre-wrap break-words">
                      {entry.code.trim() === '' ? '(blank line)' : entry.code}
                    </pre>
                    {entry.note && <span className="mt-1 block text-[11px] text-stone-500 dark:text-stone-400">{entry.note}</span>}
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {tab === 'shortcuts' && (
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-2.5">
          <dl className="divide-y divide-surface-lightBorder dark:divide-surface-darkBorder">
            {SHORTCUTS.map((sc) => (
              <div key={sc.keys} className="flex items-start justify-between gap-3 py-2">
                <dd className="text-stone-700 dark:text-stone-300">{sc.action}</dd>
                <dt className="flex-shrink-0 font-mono text-[11px] text-stone-500 dark:text-stone-400 text-right">{sc.keys}</dt>
              </div>
            ))}
          </dl>
        </div>
      )}
    </aside>
  );
};
