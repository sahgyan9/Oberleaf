// Points @monaco-editor/react at the installed monaco-editor package. Without
// this the wrapper downloads Monaco from cdn.jsdelivr.net (a different version,
// 0.55.1, on every cold cache: 1-2.5 s measured, and no editor at all offline),
// while y-monaco bundles the npm copy as well -- two Monacos in one page.
//
// Imported only by the lazily loaded Editor, so the project list never waits
// for Monaco.
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';

// LaTeX has no language service; the generic editor worker (diffing, word
// ranges, link detection) is the only one Monaco asks for.
(self as unknown as { MonacoEnvironment: { getWorker: () => Worker } }).MonacoEnvironment = {
  getWorker: () => new EditorWorker(),
};

loader.config({ monaco });
