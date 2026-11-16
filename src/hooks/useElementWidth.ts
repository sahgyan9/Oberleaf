import { useEffect, useState } from 'react';

/** The window's inner width in px, updated on resize. */
export function useWindowWidth(): number {
  const [width, setWidth] = useState<number>(() => window.innerWidth);

  useEffect(() => {
    const update = () => setWidth((prev) => (prev === window.innerWidth ? prev : window.innerWidth));
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return width;
}

/**
 * react-resizable-panels takes sizes as percentages of the group, so a fixed
 * percentage minimum lets a panel shrink below what its toolbar needs on a
 * small window. This converts a pixel floor into the percentage to pass,
 * capped so the minimums of all panels can never add up past 100.
 */
export function pxToPanelPercent(px: number, groupWidth: number, cap = 30): number {
  if (groupWidth <= 0) return cap;
  return Math.min(cap, Math.round((px / groupWidth) * 1000) / 10);
}
