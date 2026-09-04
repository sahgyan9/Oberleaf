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
      // Incomplete typing or unsupported syntax handled gracefully without huge red text
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
      className="fixed z-40 bg-surface-lightPanel/95 dark:bg-surface-darkPanel/95 backdrop-blur-md border border-brand-cyan/40 shadow-xl shadow-brand-mint/10 rounded-lg p-3 max-w-md max-h-60 flex flex-col transition-all duration-100 ease-out"
    >
      <div className="flex items-center justify-between space-x-1.5 mb-1.5 text-[10px] uppercase font-mono tracking-wider text-brand-mint select-none">
        <div className="flex items-center space-x-1.5">
          <Sigma className="w-3.5 h-3.5 text-brand-mint" />
          <span>Live Math Preview</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            title="Dismiss Preview"
            className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="overflow-auto py-1 text-sm select-none">
        <div
          ref={containerRef}
          className={`text-slate-900 dark:text-slate-100 ${hasParseError ? 'hidden' : 'block'}`}
        />
        {hasParseError && (
          <div className="text-xs text-slate-400 italic py-1">
            Typing formula...
          </div>
        )}
      </div>
    </div>
  );
};
