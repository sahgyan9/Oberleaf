// The editor (Monaco, ~3 MB), the history diff view (also Monaco) and the PDF
// viewer (pdf.js) load on first use, so the project list does not wait for
// them. Each keeps its original props and ref types; callers only change where
// they import from.
import React, { Suspense, lazy } from 'react';
import type { PDFViewerHandle } from '../PDFViewer/PDFViewer';

const EditorImpl = lazy(() => import('../Editor/Editor').then((m) => ({ default: m.Editor })));
// monacoSetup must run before @monaco-editor/react first initialises, or the
// wrapper falls back to downloading Monaco from its CDN.
const DiffEditorImpl = lazy(() =>
  import('../../utils/monacoSetup')
    .then(() => import('@monaco-editor/react'))
    .then((m) => ({ default: m.DiffEditor }))
);
const PDFViewerImpl = lazy(() => import('../PDFViewer/PDFViewer').then((m) => ({ default: m.PDFViewer })));

type EditorProps = React.ComponentProps<typeof import('../Editor/Editor').Editor>;
type DiffEditorProps = import('@monaco-editor/react').DiffEditorProps;
type PDFViewerProps = React.ComponentPropsWithoutRef<typeof import('../PDFViewer/PDFViewer').PDFViewer>;

const PanelPlaceholder: React.FC<{ label: string }> = ({ label }) => (
  <div className="h-full w-full flex items-center justify-center bg-surface-lightPanel dark:bg-surface-darkPanel text-xs text-stone-400 dark:text-stone-500 select-none">
    {label}
  </div>
);

export const Editor: React.FC<EditorProps> = (props) => (
  <Suspense fallback={<PanelPlaceholder label="Loading editor" />}>
    <EditorImpl {...props} />
  </Suspense>
);

export const DiffEditor: React.FC<DiffEditorProps> = (props) => (
  <Suspense fallback={<PanelPlaceholder label="Loading diff view" />}>
    <DiffEditorImpl {...props} />
  </Suspense>
);

export const PDFViewer = React.forwardRef<PDFViewerHandle, PDFViewerProps>((props, ref) => (
  <Suspense fallback={<PanelPlaceholder label="Loading PDF viewer" />}>
    <PDFViewerImpl ref={ref} {...props} />
  </Suspense>
));
PDFViewer.displayName = 'PDFViewer';
