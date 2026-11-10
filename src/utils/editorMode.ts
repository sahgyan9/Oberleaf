import { useSyncExternalStore } from 'react';
import { readSetting, writeSetting } from './storage';

/**
 * Which rendering the source editor uses. Both modes edit the same text
 * buffer; Visual only changes how recognised LaTeX is displayed.
 */
export type EditorMode = 'code' | 'visual';

const SETTING_KEY = 'editor-mode';
const listeners = new Set<() => void>();

let current: EditorMode = readSetting(SETTING_KEY) === 'visual' ? 'visual' : 'code';

export function getEditorMode(): EditorMode {
  return current;
}

export function setEditorMode(mode: EditorMode): void {
  if (mode === current) return;
  current = mode;
  writeSetting(SETTING_KEY, mode);
  listeners.forEach((listener) => listener());
}

export function subscribeEditorMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useEditorMode(): EditorMode {
  return useSyncExternalStore(subscribeEditorMode, getEditorMode, getEditorMode);
}
