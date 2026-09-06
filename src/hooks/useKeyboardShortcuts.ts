import { useEffect, useRef } from 'react';
import { ViewMode } from '../components/TopBar/TopBar';

export interface UseKeyboardShortcutsOptions {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  setPdfCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  setFileTreeCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  saveActiveFile: (content: string) => void;
  getLiveContent: () => string;
  onToggleFitWidth?: () => void;
  onToggleFullscreen?: () => void;
  isZenMode?: boolean;
  onExitZenMode?: () => void;
  onBold?: () => void;
  onItalic?: () => void;
}

const TOGGLE_WINDOW_MS = 700;
const REPEAT_INTERVAL_MS = 350;

/**
 * Global application keyboard shortcuts hook:
 * - Ctrl+S / Cmd+S: Save file
 * - Ctrl+B / Cmd+B: Bold text in editor (\textbf) / Toggle sidebar outside editor
 * - Ctrl+I / Cmd+I: Italic text in editor (\textit)
 * - Ctrl+7 / Cmd+7: Full Code Mode
 * - Ctrl+8 / Cmd+8: Split Mode
 * - Ctrl+9 / Cmd+9: Full PDF Mode + Double/Triple/Continuous Toggle (PDF -> Split -> Code)
 * - Ctrl+Shift+1/2/3: Legacy backward-compatible view mode shortcuts
 * - F: Fit to Width (Full PDF Mode)
 * - F11 or Ctrl+Shift+F: Full Screen Zen Mode (Collapsible Header on hover)
 * - Esc: Exit Zen Mode
 */
export function useKeyboardShortcuts({
  viewMode,
  setViewMode,
  setPdfCollapsed,
  setFileTreeCollapsed,
  saveActiveFile,
  getLiveContent,
  onToggleFitWidth,
  onToggleFullscreen,
  isZenMode = false,
  onExitZenMode,
  onBold,
  onItalic,
}: UseKeyboardShortcutsOptions) {
  const viewModeRef = useRef<ViewMode>(viewMode);
  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  const onToggleFitWidthRef = useRef(onToggleFitWidth);
  useEffect(() => {
    onToggleFitWidthRef.current = onToggleFitWidth;
  }, [onToggleFitWidth]);

  const onToggleFullscreenRef = useRef(onToggleFullscreen);
  useEffect(() => {
    onToggleFullscreenRef.current = onToggleFullscreen;
  }, [onToggleFullscreen]);

  const isZenModeRef = useRef(isZenMode);
  useEffect(() => {
    isZenModeRef.current = isZenMode;
  }, [isZenMode]);

  const onExitZenModeRef = useRef(onExitZenMode);
  useEffect(() => {
    onExitZenModeRef.current = onExitZenMode;
  }, [onExitZenMode]);

  const onBoldRef = useRef(onBold);
  useEffect(() => {
    onBoldRef.current = onBold;
  }, [onBold]);

  const onItalicRef = useRef(onItalic);
  useEffect(() => {
    onItalicRef.current = onItalic;
  }, [onItalic]);

  const lastCtrl9TimeRef = useRef<number>(0);
  const ctrl9PressCountRef = useRef<number>(0);
  const lastRepeatTimeRef = useRef<number>(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMod = (e.ctrlKey || e.metaKey) && !e.altKey;

      const target = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      const isEditorOrInput = Boolean(
        (target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            Boolean(target.closest('.monaco-editor')))) ||
        (activeEl &&
          (activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.isContentEditable ||
            Boolean(activeEl.closest('.monaco-editor'))))
      );

      // Ctrl+S / Cmd+S: Save
      if (isMod && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        saveActiveFile(getLiveContent());
        return;
      }

      // Ctrl+B / Cmd+B: Bold text in editor, or toggle sidebar outside editor
      if (isMod && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        e.stopPropagation();
        if (isEditorOrInput) {
          onBoldRef.current?.();
        } else {
          setFileTreeCollapsed((prev) => !prev);
        }
        return;
      }

      // Ctrl+I / Cmd+I: Italic text in editor
      if (isMod && !e.shiftKey && (e.key === 'i' || e.key === 'I')) {
        if (isEditorOrInput) {
          e.preventDefault();
          e.stopPropagation();
          onItalicRef.current?.();
          return;
        }
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

      // F / f: Fit to Width (Full PDF Mode only)
      if (
        viewModeRef.current === 'pdf' &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')
      ) {
        if (!isEditorOrInput) {
          e.preventDefault();
          e.stopPropagation();
          onToggleFitWidthRef.current?.();
          return;
        }
      }

      // F11: Full Screen Zen Mode Toggle
      if (e.key === 'F11') {
        e.preventDefault();
        e.stopPropagation();
        onToggleFullscreenRef.current?.();
        return;
      }

      // Ctrl+Shift+F / Cmd+Shift+F: Full Screen Zen Mode Toggle
      if (isMod && e.shiftKey && (e.key === 'F' || e.key === 'f' || e.code === 'KeyF')) {
        e.preventDefault();
        e.stopPropagation();
        onToggleFullscreenRef.current?.();
        return;
      }

      // Escape: Exit Zen Mode if active
      if (e.key === 'Escape' && isZenModeRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onExitZenModeRef.current?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [getLiveContent, saveActiveFile, setFileTreeCollapsed, setPdfCollapsed, setViewMode]);
}
