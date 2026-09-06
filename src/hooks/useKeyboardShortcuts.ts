import { useEffect, useRef } from 'react';
import { ViewMode } from '../components/TopBar/TopBar';

export interface UseKeyboardShortcutsOptions {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  setPdfCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  setFileTreeCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  saveActiveFile: (content: string) => void;
  getLiveContent: () => string;
}

const TOGGLE_WINDOW_MS = 700;
const REPEAT_INTERVAL_MS = 350;

/**
 * Global application keyboard shortcuts hook:
 * - Ctrl+S / Cmd+S: Save file
 * - Ctrl+B / Cmd+B: Toggle file tree sidebar
 * - Ctrl+7 / Cmd+7: Full Code Mode
 * - Ctrl+8 / Cmd+8: Split Mode
 * - Ctrl+9 / Cmd+9: Full PDF Mode + Double/Triple/Continuous Toggle (PDF -> Split -> Code)
 * - Ctrl+Shift+1/2/3: Legacy backward-compatible view mode shortcuts
 */
export function useKeyboardShortcuts({
  viewMode,
  setViewMode,
  setPdfCollapsed,
  setFileTreeCollapsed,
  saveActiveFile,
  getLiveContent,
}: UseKeyboardShortcutsOptions) {
  const viewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const lastCtrl9TimeRef = useRef<number>(0);
  const ctrl9PressCountRef = useRef<number>(0);
  const lastRepeatTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = (e.ctrlKey || e.metaKey) && !e.altKey;

      // Ctrl+S / Cmd+S: Save
      if (isMod && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveActiveFile(getLiveContent());
        return;
      }

      // Ctrl+B: Toggle Sidebar
      if (isMod && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        setFileTreeCollapsed((prev) => !prev);
        return;
      }

      // Ctrl+7: Full Code Mode
      if (isMod && !e.shiftKey && (e.key === '7' || e.code === 'Digit7' || e.code === 'Numpad7')) {
        e.preventDefault();
        e.stopPropagation();
        setViewMode('code');
        ctrl9PressCountRef.current = 0;
        return;
      }

      // Ctrl+8: Split Mode
      if (isMod && !e.shiftKey && (e.key === '8' || e.code === 'Digit8' || e.code === 'Numpad8')) {
        e.preventDefault();
        e.stopPropagation();
        setViewMode('split');
        setPdfCollapsed(false);
        ctrl9PressCountRef.current = 0;
        return;
      }

      // Ctrl+9: Full PDF Mode + Double/Triple/Continuous Toggle (PDF -> Split -> Code)
      if (isMod && !e.shiftKey && (e.key === '9' || e.code === 'Digit9' || e.code === 'Numpad9')) {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();

        if (e.repeat) {
          // Key held down continuously: throttle steps
          if (now - lastRepeatTimeRef.current < REPEAT_INTERVAL_MS) {
            return;
          }
          lastRepeatTimeRef.current = now;
          lastCtrl9TimeRef.current = now;
          ctrl9PressCountRef.current = (ctrl9PressCountRef.current % 3) + 1;
        } else {
          // Manual key press
          const isWithinWindow = now - lastCtrl9TimeRef.current < TOGGLE_WINDOW_MS;
          lastCtrl9TimeRef.current = now;

          if (isWithinWindow) {
            // Consecutive press (double, triple, 4th...)
            ctrl9PressCountRef.current = (ctrl9PressCountRef.current % 3) + 1;
          } else {
            // Fresh press after pause:
            // If already in 'pdf' mode, advance to 'split' (count 2)
            // Otherwise, enter 'pdf' mode (count 1)
            ctrl9PressCountRef.current = viewModeRef.current === 'pdf' ? 2 : 1;
          }
        }

        const count = ctrl9PressCountRef.current;
        if (count === 1) {
          setViewMode('pdf');
          setPdfCollapsed(false);
        } else if (count === 2) {
          setViewMode('split');
          setPdfCollapsed(false);
        } else if (count === 3) {
          setViewMode('code');
        }
        return;
      }

      // View Mode Shortcuts (Ctrl+Shift+1/2/3 - Backward-compatible fallback)
      if (e.ctrlKey && e.shiftKey) {
        if (e.key === '!' || e.key === '1') {
          e.preventDefault();
          setViewMode('code');
          ctrl9PressCountRef.current = 0;
        } else if (e.key === '@' || e.key === '2') {
          e.preventDefault();
          setViewMode('split');
          setPdfCollapsed(false);
          ctrl9PressCountRef.current = 0;
        } else if (e.key === '#' || e.key === '3') {
          e.preventDefault();
          setViewMode('pdf');
          setPdfCollapsed(false);
          ctrl9PressCountRef.current = 1;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [getLiveContent, saveActiveFile, setFileTreeCollapsed, setPdfCollapsed, setViewMode]);
}
