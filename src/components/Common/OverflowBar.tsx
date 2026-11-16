import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal, Check } from 'lucide-react';

/**
 * A toolbar row that never clips its controls.
 *
 * Toolbars here used to hide overflow (or scroll with the scrollbar hidden),
 * so in a narrow panel the controls at the end were simply unreachable. This
 * row measures its items instead and degrades in two steps:
 *
 *   1. every item is asked to render compact (icon only, no label);
 *   2. the lowest-priority items move into a "More" menu.
 *
 * Widths come from two hidden copies of the row (full and compact), so the
 * decision never depends on what is currently shown and cannot oscillate.
 */

export interface OverflowMenuEntry {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  /** Shows a check mark, for toggles and radio-like choices */
  active?: boolean;
  disabled?: boolean;
  /** Right-aligned secondary text, e.g. a shortcut */
  hint?: string;
}

export interface OverflowItem {
  id: string;
  /** The control as it appears in the bar */
  render: (compact: boolean) => React.ReactNode;
  /** What the control becomes in the More menu. Omit for decoration. */
  menu?: OverflowMenuEntry[];
  /** Higher stays visible longer. Default 0. */
  priority?: number;
  /** A thin divider; hidden when the item after it is hidden */
  separator?: boolean;
  /** Takes the free space, pushing later items to the far end */
  spacer?: boolean;
}

interface OverflowBarProps {
  items: OverflowItem[];
  className?: string;
  /** Gap between items in px; must match the gap class in className */
  gap?: number;
  moreLabel?: string;
  /** Tailwind classes for the More button, to match the host toolbar */
  moreButtonClassName?: string;
  menuAlign?: 'left' | 'right';
}

const MORE_WIDTH = 30;

const DEFAULT_MORE_BUTTON =
  'p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-300 hover:text-scholarly dark:hover:text-scholarly-dark transition';

export const OverflowBar: React.FC<OverflowBarProps> = ({
  items,
  className = '',
  gap = 4,
  moreLabel = 'More',
  moreButtonClassName = DEFAULT_MORE_BUTTON,
  menuAlign = 'right',
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const compactRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [layout, setLayout] = useState<{ compact: boolean; hidden: Set<string> }>({
    compact: false,
    hidden: new Set(),
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const recompute = useCallback(() => {
    const root = rootRef.current;
    const full = fullRef.current;
    const compact = compactRef.current;
    if (!root || !full || !compact) return;
    const list = itemsRef.current;
    const available = root.clientWidth;
    if (available === 0) return;

    const widthsOf = (row: HTMLDivElement) =>
      Array.from(row.children).map((el) => Math.ceil((el as HTMLElement).getBoundingClientRect().width));
    const total = (widths: number[], hidden: Set<string>) => {
      let sum = 0;
      let count = 0;
      list.forEach((item, i) => {
        if (hidden.has(item.id)) return;
        sum += widths[i] ?? 0;
        count++;
      });
      return sum + Math.max(0, count - 1) * gap;
    };

    const none = new Set<string>();
    const fullWidths = widthsOf(full);
    let next: { compact: boolean; hidden: Set<string> };
    if (total(fullWidths, none) <= available) {
      next = { compact: false, hidden: none };
    } else {
      const compactWidths = widthsOf(compact);
      const hidden = new Set<string>();
      if (total(compactWidths, hidden) > available) {
        // Drop the lowest priority first; among equals, the last one first.
        const order = list
          .map((item, i) => ({ item, i }))
          .filter(({ item }) => !item.separator && !item.spacer && item.menu && item.menu.length > 0)
          .sort((a, b) => (a.item.priority ?? 0) - (b.item.priority ?? 0) || b.i - a.i);
        const hideOrphanSeparators = () => {
          list.forEach((item, i) => {
            if (!item.separator) return;
            // A separator with nothing visible on one side divides nothing.
            const visibleAfter = list.slice(i + 1).find((x) => !x.separator && !hidden.has(x.id));
            const visibleBefore = list.slice(0, i).reverse().find((x) => !x.separator && !hidden.has(x.id));
            const nextReal = list.slice(i + 1).find((x) => !x.separator);
            if (!visibleAfter || !visibleBefore || (nextReal && hidden.has(nextReal.id)) || visibleAfter.spacer || visibleBefore.spacer) {
              hidden.add(item.id);
            } else {
              hidden.delete(item.id);
            }
          });
        };
        for (const { item } of order) {
          hidden.add(item.id);
          hideOrphanSeparators();
          if (total(compactWidths, hidden) + gap + MORE_WIDTH <= available) break;
        }
      }
      next = { compact: true, hidden };
    }

    setLayout((prev) => {
      if (prev.compact === next.compact && prev.hidden.size === next.hidden.size && [...next.hidden].every((id) => prev.hidden.has(id))) {
        return prev;
      }
      return next;
    });
  }, [gap]);

  useLayoutEffect(() => {
    recompute();
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => recompute());
    observer.observe(root);
    if (fullRef.current) observer.observe(fullRef.current);
    if (compactRef.current) observer.observe(compactRef.current);
    // Web fonts change label widths after the first measurement.
    document.fonts?.ready.then(() => recompute()).catch(() => {});
    return () => observer.disconnect();
  }, [recompute]);

  const hiddenItems = items.filter((item) => layout.hidden.has(item.id) && item.menu && item.menu.length > 0);

  useEffect(() => {
    if (hiddenItems.length === 0 && menuOpen) setMenuOpen(false);
  }, [hiddenItems.length, menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || moreRef.current?.contains(target)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onScrollOrResize = () => setMenuOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [menuOpen]);

  const toggleMenu = () => {
    const rect = moreRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos(
        menuAlign === 'right'
          ? { top: rect.bottom + 4, right: Math.max(8, window.innerWidth - rect.right) }
          : { top: rect.bottom + 4, left: Math.max(8, rect.left) }
      );
    }
    setMenuOpen((open) => !open);
  };

  const measuringRow = (ref: React.RefObject<HTMLDivElement>, compact: boolean) => (
    <div
      ref={ref}
      aria-hidden="true"
      // inert keeps the copies out of the tab order and the accessibility tree
      {...({ inert: '' } as Record<string, string>)}
      className="absolute left-0 top-0 flex items-center invisible pointer-events-none h-0 overflow-hidden whitespace-nowrap"
      style={{ gap }}
    >
      {items.map((item) => (
        <div key={item.id} className="flex-shrink-0 flex items-center">
          {item.spacer ? null : item.render(compact)}
        </div>
      ))}
    </div>
  );

  return (
    <div ref={rootRef} className={`relative flex items-center min-w-0 ${className}`} style={{ gap }}>
      {measuringRow(fullRef, false)}
      {measuringRow(compactRef, true)}

      {items.map((item) => {
        if (layout.hidden.has(item.id)) return null;
        if (item.spacer) return <div key={item.id} className="flex-1 min-w-0" />;
        return (
          <div key={item.id} className="flex-shrink-0 flex items-center">
            {item.render(layout.compact)}
          </div>
        );
      })}

      {hiddenItems.length > 0 && (
        <button
          ref={moreRef}
          type="button"
          aria-label={moreLabel}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title={moreLabel}
          onClick={toggleMenu}
          className={`flex-shrink-0 ${moreButtonClassName}`}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </button>
      )}

      {menuOpen &&
        hiddenItems.length > 0 &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', ...menuPos }}
            className="z-[70] min-w-[190px] max-w-[280px] max-h-[70vh] overflow-y-auto rounded-lg bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder shadow-xl p-1 text-xs font-sans text-stone-700 dark:text-stone-200"
          >
            {hiddenItems.flatMap((item) =>
              (item.menu ?? []).map((entry, i) => (
                <button
                  key={`${item.id}-${i}`}
                  type="button"
                  role="menuitem"
                  disabled={entry.disabled}
                  onClick={() => {
                    setMenuOpen(false);
                    entry.onClick();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-left hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle disabled:opacity-50 transition"
                >
                  <span className="w-4 h-4 flex items-center justify-center flex-shrink-0 text-stone-500 dark:text-stone-400">
                    {entry.active ? <Check className="w-3.5 h-3.5 text-scholarly dark:text-scholarly-dark" /> : entry.icon}
                  </span>
                  <span className="flex-1 min-w-0 truncate">{entry.label}</span>
                  {entry.hint && <span className="flex-shrink-0 font-mono text-[10px] text-stone-400">{entry.hint}</span>}
                </button>
              ))
            )}
          </div>,
          document.body
        )}
    </div>
  );
};
