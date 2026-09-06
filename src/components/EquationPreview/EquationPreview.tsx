import React, { useEffect, useRef, useState } from 'react';
import katex from 'katex';
import { Sigma, X } from 'lucide-react';

interface EquationPreviewProps {
  equation: string | null;
  position?: { top: number; left: number };
  displayMode?: boolean;
  onClose?: () => void;
}

export const EquationPreview: React.FC<EquationPreviewProps> = ({
  equation,
  position,
  displayMode = true,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hasParseError, setHasParseError] = useState<boolean>(false);

  useEffect(() => {
    if (!containerRef.current || !equation) {
      setHasParseError(false);
      return;
    }

    try {
      katex.render(equation, containerRef.current, {
        displayMode: displayMode,
        throwOnError: true,
        output: 'htmlAndMathml',
      });
      setHasParseError(false);
    } catch {
      // Incomplete typing or unsupported syntax handled gracefully
      setHasParseError(true);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    }
  }, [equation, displayMode]);

  if (!equation) return null;

  // Clamp position within viewport
  const safeTop = position ? Math.min(Math.max(position.top, 50), window.innerHeight - 150) : undefined;
  const safeLeft = position ? Math.min(Math.max(position.left, 20), window.innerWidth - 380) : undefined;

  return (
    <div
      style={
        safeTop !== undefined && safeLeft !== undefined
          ? { top: `${safeTop}px`, left: `${safeLeft}px` }
          : undefined
      }
      className="fixed z-40 bg-surface-lightPanel/98 dark:bg-surface-darkPanel/98 backdrop-blur-md border border-surface-lightBorder dark:border-surface-darkBorder shadow-lg rounded-lg p-3 max-w-md max-h-60 flex flex-col transition-all duration-100 ease-out font-sans"
    >
      <div className="flex items-center justify-between space-x-1.5 mb-1.5 text-[10px] uppercase font-sans tracking-wider text-scholarly dark:text-scholarly-dark font-medium select-none">
        <div className="flex items-center space-x-1.5">
          <Sigma className="w-3.5 h-3.5" />
          <span>Live Math Preview</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Dismiss Preview"
            className="p-0.5 rounded hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition btn-tactile"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="overflow-auto py-1 text-sm select-none">
        <div
          ref={containerRef}
          className={`text-stone-900 dark:text-stone-100 ${hasParseError ? 'hidden' : 'block'}`}
        />
        {hasParseError && (
          <div className="text-xs text-stone-400 italic py-1">
            Typing equation...
          </div>
        )}
      </div>
    </div>
  );
};
