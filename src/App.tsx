import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import { TopBar, ViewMode, ProjectInfo } from './components/TopBar/TopBar';
import { FileTree, FileEntry } from './components/FileTree/FileTree';
import { EditorToolbar } from './components/EditorToolbar/EditorToolbar';
import { Editor } from './components/Editor/Editor';
import { PDFViewer, CompileErrorItem, SyncTexTarget, PDFViewerHandle } from './components/PDFViewer/PDFViewer';
import { EquationPreview } from './components/EquationPreview/EquationPreview';
import { InsertImageModal } from './components/Modals/InsertImageModal';
import { InsertTableModal } from './components/Modals/InsertTableModal';
import { NewProjectModal } from './components/Modals/NewProjectModal';
import { UploadProgressModal, UploadFileItem } from './components/Modals/UploadProgressModal';
import { NewItemModal } from './components/Modals/NewItemModal';
import { DependencyDoctor, DependencyItem } from './components/DependencyDoctor/DependencyDoctor';
import { HistoryDrawer } from './components/History/HistoryDrawer';
import { InsertCitationModal, CitationItem } from './components/Modals/InsertCitationModal';
import { ProjectContext } from './utils/latexCompletions';
import { PanelLeftOpen, FolderClosed } from 'lucide-react';
import { ProjectsDashboard } from './components/Dashboard/ProjectsDashboard';
import { extractLatexTitle, getLatexPdfFilename } from './utils/latexTitle';
import { useToast, ToastContainer } from './components/Toast/Toast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';

const DEFAULT_STARTER_DOCUMENT = [
  '\\documentclass{article}',
  '\\usepackage{amsmath,amssymb}',
  '\\usepackage{graphicx}',
  '\\usepackage{hyperref}',
  '',
  '\\title{\\textbf{Scholarly Atelier: Local \\LaTeX{} Workspace}}',
  '\\author{Local Academic Researcher}',
  '\\date{\\today}',
  '',
  '\\begin{document}',
  '',
  '\\maketitle',
  '',
  '\\begin{abstract}',
  'Welcome to your local-first Overleaf alternative. Designed for university students and academic researchers who need unlimited compute time, instant local compilation, live KaTeX equation previews, and Git version history without cloud timeout constraints.',
  '\\end{abstract}',
  '',
  '\\section{Local Compilation \\& Speed}',
  'Unlike cloud services with strict compile quotas, your documents compile locally using your machine\'s native \\LaTeX{} engine.',
  '',
  '\\begin{itemize}',
  '    \\item \\textbf{Recompile}: Press \\texttt{Ctrl+Enter} (or \\texttt{Cmd+Enter}) anytime to build your PDF.',
  '    \\item \\textbf{Live Math}: Type equations like $E = mc^2$ or $\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}$ to see instant parchment previews.',
  '    \\item \\textbf{SyncTeX}: Jump from code to PDF with one click, or \\texttt{Ctrl+Click} in the PDF to jump back to your code.',
  '    \\item \\textbf{Checkpoints}: Access automated Git snapshots with visual diffs anytime.',
  '\\end{itemize}',
  '',
  '\\section{Mathematical Formulation}',
  'Gaussian distribution probability density function:',
  '\\begin{equation}',
  '    f(x) = \\frac{1}{\\sigma \\sqrt{2\\pi}} \\exp\\left( -\\frac{1}{2}\\left(\\frac{x - \\mu}{\\sigma}\\right)^2 \\right)',
  '\\end{equation}',
  '',
  '\\section{Error Diagnostics}',
  'If a syntax error occurs during compilation, the Diagnostic Assistant provides plain-language explanations and a \\textbf{``Copy Prompt for AI\'\'} button to solve complex macro issues instantly.',
  '',
  '\\end{document}',
  '',
].join('\n');

export const App: React.FC = () => {
  // Toast notification system (replaces window.alert)
  const { toasts, addToast, removeToast } = useToast();

  // Navigation View State ('dashboard' vs 'editor')
  const [currentView, setCurrentView] = useState<'dashboard' | 'editor'>(() => {
    return window.location.hash.startsWith('#/project/') ? 'editor' : 'dashboard';
  });

  // Projects State
  const [projects, setProjects] = useState<ProjectInfo[]>(() => {
    try {
      const cached = localStorage.getItem('overleaf-copy:cached-projects');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    // Return empty array — server is the source of truth; loadProjects() fills this on mount.
    return [];
  });
  const [projectId, setProjectId] = useState<string>(() => {
    return localStorage.getItem('overleaf-copy:active-project-id') || '';
  });
  const [projectName, setProjectName] = useState<string>('');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string>('main.tex');
  const [editorContent, setEditorContent] = useState<string>(() => {
    return localStorage.getItem('overleaf-copy:last-content') || DEFAULT_STARTER_DOCUMENT;
  });
  const [docTitle, setDocTitle] = useState<string | null>(() => {
    const initial = localStorage.getItem('overleaf-copy:last-content') || DEFAULT_STARTER_DOCUMENT;
    return extractLatexTitle(initial);
  });
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');

  // View & UI State
  const [viewMode, setViewMode] = useState<ViewMode>('split');
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('overleaf-copy:filetree-collapsed') === 'true';
  });
  const [pdfCollapsed, setPdfCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('overleaf-copy:pdf-collapsed') === 'true';
  });

  // Compiler State
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [compileStatus, setCompileStatus] = useState<'idle' | 'compiling' | 'success' | 'failed'>('idle');
  const [compileDuration, setCompileDuration] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [lastValidPdfUrl, setLastValidPdfUrl] = useState<string | null>(null);
  const [compileErrors, setCompileErrors] = useState<CompileErrorItem[]>([]);

  // Live KaTeX Math State
  const [liveEquation, setLiveEquation] = useState<string | null>(null);
  const [liveEquationPos, setLiveEquationPos] = useState<{ top: number; left: number } | undefined>(undefined);
  const [liveEquationDisplay, setLiveEquationDisplay] = useState<boolean>(true);
  const [isLiveMathEnabled, setIsLiveMathEnabled] = useState<boolean>(() => {
    return localStorage.getItem('overleaf-copy:live-math-enabled') !== 'false';
  });

  // Modals State
  const [isImageModalOpen, setIsImageModalOpen] = useState<boolean>(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState<boolean>(false);
  const [isNewProjectModalOpen, setIsNewProjectModalOpen] = useState<boolean>(false);
  const [isDoctorOpen, setIsDoctorOpen] = useState<boolean>(false);
  const [uploadQueue, setUploadQueue] = useState<UploadFileItem[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  // NewItemModal state (replaces window.prompt for new file/folder)
  const [newItemModal, setNewItemModal] = useState<{ mode: 'file' | 'folder'; parentFolder: string } | null>(null);

  // Phase 3: History & Checkpoints State
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);

  // Phase 3: Citations State
  const [citations, setCitations] = useState<CitationItem[]>([]);
  const [isCitationModalOpen, setIsCitationModalOpen] = useState<boolean>(false);

  // Phase 3: SyncTeX Bi-directional State
  const [synctexTarget, setSynctexTarget] = useState<SyncTexTarget | null>(null);
  const [isJumpingToPdf, setIsJumpingToPdf] = useState<boolean>(false);
  const [isSyncingBackward, setIsSyncingBackward] = useState<boolean>(false);
  const [highlightLine, setHighlightLine] = useState<{ line: number; timestamp: number } | null>(null);

  // Dependency Doctor State
  const [doctorDeps, setDoctorDeps] = useState<DependencyItem[]>([]);
  const [isDoctorHealthy, setIsDoctorHealthy] = useState<boolean | null>(null);
  const [isRefreshingDoctor, setIsRefreshingDoctor] = useState<boolean>(false);

  // Refs
  const monacoEditorRef = useRef<any>(null);
  const pdfViewerRef = useRef<PDFViewerHandle>(null);
  const fileTreePanelRef = useRef<ImperativePanelHandle>(null);
  const pdfPanelRef = useRef<ImperativePanelHandle>(null);
  const autoSaveTimerRef = useRef<any>(null);

  // Fetch Dependency Doctor Report on Mount
  const checkDependencies = useCallback(async () => {
    setIsRefreshingDoctor(true);
    try {
      const res = await fetch('/api/doctor');
      if (res.ok) {
        const data = await res.json();
        setDoctorDeps(data.dependencies);
        setIsDoctorHealthy(data.allHealthy);
        if (!data.allHealthy) {
          setIsDoctorOpen(true);
        }
      }
    } catch {
      setIsDoctorHealthy(false);
    } finally {
      setIsRefreshingDoctor(false);
    }
  }, []);

  useEffect(() => {
    checkDependencies();
  }, [checkDependencies]);

  // Load Projects List
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      if (!res.ok) {
        throw new Error(`Server returned status ${res.status}`);
      }
      const data: ProjectInfo[] = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setProjects(data);
        localStorage.setItem('overleaf-copy:cached-projects', JSON.stringify(data));

        // Check if URL hash specifies an existing project
        const hash = window.location.hash;
        if (hash.startsWith('#/project/')) {
          const hashId = hash.replace('#/project/', '').trim();
          const match = data.find((p) => p.id === hashId);
          if (match) {
            setProjectId(match.id);
            setProjectName(match.name);
            return;
          }
        }

        // Determine which project to load in background
        const savedId = localStorage.getItem('overleaf-copy:active-project-id');
        const match = data.find((p) => p.id === savedId) || data[0];
        if (match) {
          setProjectId(match.id);
          setProjectName(match.name);
        }
      }
    } catch (err) {
      console.warn('[Overleaf Copy] Network error loading /api/projects:', err);
      // Try local storage cache
      try {
        const cached = localStorage.getItem('overleaf-copy:cached-projects');
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setProjects(parsed);
            return;
          }
        }
      } catch {}
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Open project from dashboard into editor
  const handleOpenProject = useCallback((id: string) => {
    setProjectId(id);
    const match = projects.find((p) => p.id === id);
    if (match) setProjectName(match.name);
    localStorage.setItem('overleaf-copy:active-project-id', id);
    window.location.hash = `#/project/${id}`;
    setCurrentView('editor');
  }, [projects]);

  // Return from editor back to projects dashboard
  const handleBackToProjects = useCallback(() => {
    setCurrentView('dashboard');
    window.location.hash = '#/projects';
  }, []);

  // Sync view state with browser URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/project/')) {
        const id = hash.replace('#/project/', '').trim();
        if (id) {
          setProjectId(id);
          const match = projects.find((p) => p.id === id);
          if (match) setProjectName(match.name);
          setCurrentView('editor');
        }
      } else {
        setCurrentView('dashboard');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [projects]);

  // Load Project Files
  const loadProjectFiles = useCallback(async (pId: string) => {
    try {
      const res = await fetch(`/api/projects/${pId}/files`);
      if (res.ok) {
        const data: FileEntry[] = await res.json();
        setFiles(data);
      }
    } catch {
      setFiles([
        { name: 'main.tex', path: 'main.tex', relativePath: 'main.tex', type: 'file', extension: '.tex' },
        { name: 'figures', path: 'figures', relativePath: 'figures', type: 'directory', children: [] },
      ]);
    }
  }, []);

  // Load File Content into Editor
  const loadFileContent = useCallback(async (pId: string, relPath: string) => {
    try {
      const res = await fetch(`/api/projects/${pId}/file?path=${encodeURIComponent(relPath)}`);
      if (res.ok) {
        const content = await res.text();
        const finalContent = content || (relPath === 'main.tex' ? DEFAULT_STARTER_DOCUMENT : '');
        setEditorContent(finalContent);
        setSaveStatus('saved');
        localStorage.setItem('overleaf-copy:last-content', finalContent);
        if (relPath === 'main.tex') {
          const parsedTitle = extractLatexTitle(finalContent);
          setDocTitle(parsedTitle);
        }
      } else if (relPath === 'main.tex') {
        setEditorContent((prev) => prev || DEFAULT_STARTER_DOCUMENT);
      }
    } catch {
      if (relPath === 'main.tex') {
        setEditorContent((prev) => prev || DEFAULT_STARTER_DOCUMENT);
      }
    }
  }, []);

  // Load Citations
  const loadCitations = useCallback(async (pId: string) => {
    try {
      const res = await fetch(`/api/projects/${pId}/citations`);
      if (res.ok) {
        const data: CitationItem[] = await res.json();
        setCitations(data);
      }
    } catch {
      setCitations([]);
    }
  }, []);

  // When active project changes, reload files, citations, and main.tex
  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem('overleaf-copy:active-project-id', projectId);
    loadProjectFiles(projectId);
    loadCitations(projectId);
    setActiveFilePath('main.tex');
    loadFileContent(projectId, 'main.tex');
  }, [projectId, loadProjectFiles, loadCitations, loadFileContent]);

  // SyncTeX Forward (Cursor Position / Visible Line -> PDF Page & Coordinates)
  const handleJumpToPdf = useCallback(
    async (targetMode?: ViewMode) => {
      if (!monacoEditorRef.current || isJumpingToPdf) return;
      const editor = monacoEditorRef.current;
      const position = editor.getPosition();
      const visibleRanges = editor.getVisibleRanges?.();
      const visibleStart = visibleRanges?.[0]?.startLineNumber;
      const visibleEnd = visibleRanges?.[0]?.endLineNumber;

      let line = 1;
      if (
        position &&
        visibleStart &&
        visibleEnd &&
        position.lineNumber >= visibleStart &&
        position.lineNumber <= visibleEnd
      ) {
        line = position.lineNumber;
      } else if (visibleStart && visibleEnd) {
        line = Math.round((visibleStart + visibleEnd) / 2);
      } else if (position) {
        line = position.lineNumber;
      }

      setIsJumpingToPdf(true);
      try {
        const res = await fetch(
          `/api/projects/${projectId}/synctex/forward?file=${encodeURIComponent(
            activeFilePath
          )}&line=${line}`
        );
        if (res.ok) {
          const result = await res.json();
          if (result.page) {
            setSynctexTarget({
              page: result.page,
              x: result.x,
              y: result.y,
              line: result.line,
              file: result.file,
              timestamp: Date.now(),
            });

            // Reveal PDF panel if hidden or in code mode (unless target mode was explicitly specified)
            if (targetMode) {
              setViewMode(targetMode);
            } else if (viewMode === 'code') {
              setViewMode('split');
            }
            if (pdfCollapsed) {
              setPdfCollapsed(false);
            }
          }
        }
      } catch {
        // SyncTeX not compiled or ready
      } finally {
        setIsJumpingToPdf(false);
      }
    },
    [projectId, activeFilePath, isJumpingToPdf, viewMode, pdfCollapsed]
  );

  // Consume SyncTeX forward target once PDFViewer has processed the navigation
  const handleSyncTexHandled = useCallback(() => {
    setSynctexTarget(null);
  }, []);

  // SyncTeX Backward (PDF Click / Selection -> Source File & Line)
  const handleSyncTexBackward = useCallback(
    async (page: number, x: number, y: number, text?: string) => {
      if (isSyncingBackward) return;
      setIsSyncingBackward(true);
      try {
        const queryParams = new URLSearchParams({
          page: page.toString(),
          x: x.toString(),
          y: y.toString(),
        });
        if (text && text.trim().length > 0) {
          queryParams.set('text', text.trim());
        }

        const res = await fetch(
          `/api/projects/${projectId}/synctex/backward?${queryParams.toString()}`
        );
        if (res.ok) {
          const result = await res.json();
          if (result.file && result.line) {
            // If in PDF mode only, switch to split view so the user can see their code
            if (viewMode === 'pdf') {
              setViewMode('split');
            }

            if (result.file !== activeFilePath) {
              handleSelectFile(result.file);
            }

            // Trigger Monaco editor scroll and glowing line pulse
            setHighlightLine({ line: result.line, timestamp: Date.now() });
          }
        }
      } catch {
        // ignore
      } finally {
        setIsSyncingBackward(false);
      }
    },
    [projectId, activeFilePath, isSyncingBackward, viewMode]
  );

  // Dynamic context for Monaco completions (\cite, \label, \includegraphics)
  const getProjectContext = useCallback((): ProjectContext => {
    return {
      citations,
      files,
    };
  }, [citations, files]);

  // Revert Success Handler
  const handleRevertSuccess = useCallback(async () => {
    await loadProjectFiles(projectId);
    await loadFileContent(projectId, activeFilePath);
    await loadCitations(projectId);
  }, [projectId, activeFilePath, loadProjectFiles, loadFileContent, loadCitations]);

  // Persist sidebar collapsed states
  useEffect(() => {
    localStorage.setItem('overleaf-copy:filetree-collapsed', fileTreeCollapsed.toString());
    if (fileTreePanelRef.current) {
      if (fileTreeCollapsed) {
        fileTreePanelRef.current.collapse();
      } else {
        fileTreePanelRef.current.expand();
      }
    }
  }, [fileTreeCollapsed]);

  useEffect(() => {
    localStorage.setItem('overleaf-copy:pdf-collapsed', pdfCollapsed.toString());
    if (pdfPanelRef.current) {
      if (pdfCollapsed) {
        pdfPanelRef.current.collapse();
      } else {
        pdfPanelRef.current.expand();
      }
    }
  }, [pdfCollapsed]);

  // Save File Content to Server
  const saveActiveFile = useCallback(async (contentToSave: string, filePathToSave = activeFilePath) => {
    // Only save text files (.tex, .bib, .txt, .sty, .cls)
    const ext = '.' + filePathToSave.split('.').pop()?.toLowerCase();
    const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf'];
    if (binaryExts.includes(ext)) return;

    setSaveStatus('saving');
    try {
      const res = await fetch(`/api/projects/${projectId}/file?path=${encodeURIComponent(filePathToSave)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: contentToSave }),
      });
      if (res.ok) {
        setSaveStatus('saved');
      } else {
        setSaveStatus('unsaved');
      }
    } catch {
      setSaveStatus('unsaved');
    }
  }, [projectId, activeFilePath]);

  // The Monaco model is the source of truth for what the user actually sees.
  // React state can trail it by a render, so anything that persists to disk
  // reads the live buffer first and only falls back to state.
  const getLiveContent = useCallback((): string => {
    const live = monacoEditorRef.current?.getValue?.();
    return typeof live === 'string' ? live : editorContent;
  }, [editorContent]);

  // Debounced auto-save on editor change (800ms)
  const handleEditorChange = useCallback((newVal: string) => {
    setEditorContent(newVal);
    setSaveStatus('unsaved');

    if (activeFilePath === 'main.tex') {
      const parsed = extractLatexTitle(newVal);
      if (parsed) {
        setDocTitle(parsed);
      }
    }

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      saveActiveFile(newVal);
    }, 800);
  }, [activeFilePath, saveActiveFile]);

  // Compile Handler
  const handleCompile = async () => {
    if (isCompiling) return;
    setIsCompiling(true);
    setCompileStatus('compiling');
    setCompileErrors([]);

    try {
      // Flush any pending save first, using the editor's live buffer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      const contentToCompile = getLiveContent();
      await saveActiveFile(contentToCompile);

      const res = await fetch(`/api/projects/${projectId}/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mainFile: 'main.tex', engine: 'pdflatex' }),
      });

      if (res.ok) {
        const result = await res.json();
        setCompileDuration(result.durationMs);

        // A PDF that was produced is always worth showing, even when the log
        // still carries errors -- the diagnostics panel reports those
        // alongside the updated preview rather than hiding the output.
        const errors = result.errors || [];
        setCompileErrors(errors);

        if (result.pdfUrl) {
          const freshPdfUrl = `${result.pdfUrl}&t=${Date.now()}`;
          setPdfUrl(freshPdfUrl);
          setLastValidPdfUrl(freshPdfUrl);
        }
        if (result.documentTitle) {
          setDocTitle(result.documentTitle);
        }
        setCompileStatus(errors.length > 0 ? 'failed' : 'success');
      } else {
        setCompileStatus('failed');
        setCompileErrors([
          {
            file: 'main.tex',
            line: 1,
            message: 'Compile failed to reach server.',
            friendlyExplanation: 'Ensure the local server daemon is running with npm start.',
          },
        ]);
      }
    } catch {
      setCompileStatus('failed');
      setCompileErrors([
        {
          file: 'main.tex',
          line: 1,
          message: 'Local server connection error.',
          friendlyExplanation: 'Start the server daemon on port 3001 using: npm run server.',
        },
      ]);
    } finally {
      setIsCompiling(false);
    }
  };

  // Insert snippet helper into Monaco editor
  const handleInsertSnippet = (snippet: string, preambleAddition?: string) => {
    // Read the live Monaco buffer — editorContent state can lag by up to 800 ms
    // (the auto-save debounce) so preamble-duplicate checks must use the live value.
    let updatedContent = getLiveContent();

    // If preamble package is needed (e.g. \usepackage{graphicx}) and missing
    if (preambleAddition && !updatedContent.includes(preambleAddition.trim())) {
      if (updatedContent.includes('\\documentclass')) {
        updatedContent = updatedContent.replace(
          /(\\documentclass(?:\[.*?\])?\{.*?\})/,
          `$1\n${preambleAddition}`
        );
      } else {
        updatedContent = preambleAddition + '\n' + updatedContent;
      }
      setEditorContent(updatedContent);
      saveActiveFile(updatedContent);
    }

    if (monacoEditorRef.current) {
      const editor = monacoEditorRef.current;
      const selection = editor.getSelection();
      editor.executeEdits('insert-snippet', [
        {
          range: selection,
          text: snippet,
          forceMoveMarkers: true,
        },
      ]);
      editor.focus();
    } else {
      setEditorContent((prev) => prev + '\n' + snippet);
    }
  };

  // Wrap the current selection in a LaTeX command rather than replacing it.
  // Selecting a word and clicking Bold used to overwrite it with the literal
  // snippet "\textbf{text}", destroying what the user had selected.
  const handleWrapSelection = (prefix: string, suffix: string, placeholder: string) => {
    const editor = monacoEditorRef.current;
    if (!editor) {
      setEditorContent((prev) => `${prev}\n${prefix}${placeholder}${suffix}`);
      return;
    }

    const selection = editor.getSelection();
    const model = editor.getModel();
    const selected = selection && model ? model.getValueInRange(selection) : '';
    const inner = selected && selected.length > 0 ? selected : placeholder;

    editor.executeEdits('wrap-selection', [
      { range: selection, text: `${prefix}${inner}${suffix}`, forceMoveMarkers: true },
    ]);

    // With no selection, leave the placeholder highlighted so it can be typed over
    if (!selected && selection) {
      const start = selection.getStartPosition();
      editor.setSelection({
        startLineNumber: start.lineNumber,
        startColumn: start.column + prefix.length,
        endLineNumber: start.lineNumber,
        endColumn: start.column + prefix.length + inner.length,
      });
    }
    editor.focus();
  };

  // Multi-File Upload Pipeline
  const handleUploadFiles = (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;

    const newItems: UploadFileItem[] = selectedFiles.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      name: file.name,
      size: file.size,
      status: 'waiting',
    }));

    setUploadQueue(newItems);
    setIsUploadModalOpen(true);

    // Process files sequentially or parallel
    newItems.forEach(async (item) => {
      setUploadQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading' } : q))
      );

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch(`/api/projects/${projectId}/upload`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: item.name,
              base64Data: reader.result,
            }),
          });

          if (res.ok) {
            const data = await res.json();
            setUploadQueue((prev) =>
              prev.map((q) =>
                q.id === item.id
                  ? { ...q, status: 'imported', relativePath: data.relativePath }
                  : q
              )
            );
            loadProjectFiles(projectId);
          } else {
            const err = await res.json();
            setUploadQueue((prev) =>
              prev.map((q) =>
                q.id === item.id ? { ...q, status: 'failed', error: err.error || 'Failed' } : q
              )
            );
          }
        } catch (err: any) {
          setUploadQueue((prev) =>
            prev.map((q) =>
              q.id === item.id ? { ...q, status: 'failed', error: err.message || 'Network error' } : q
            )
          );
        }
      };

      reader.onerror = () => {
        setUploadQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, status: 'failed', error: 'Failed to read file' } : q
          )
        );
      };

      reader.readAsDataURL(item.file);
    });
  };

  // File Tree Actions
  const handleSelectFile = useCallback((relPath: string) => {
    const ext = '.' + relPath.split('.').pop()?.toLowerCase();
    const textExts = ['.tex', '.bib', '.txt', '.sty', '.cls', '.md'];

    if (textExts.includes(ext)) {
      if (saveStatus === 'unsaved') {
        saveActiveFile(getLiveContent());
      }
      setActiveFilePath(relPath);
      loadFileContent(projectId, relPath);
    } else if (['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(ext)) {
      // If user clicked an image, open Insert Image modal
      setIsImageModalOpen(true);
    }
  }, [saveStatus, saveActiveFile, getLiveContent, projectId, loadFileContent]);

  const handleRenameItem = async (oldPath: string, newName: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/rename`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (activeFilePath === oldPath) {
          setActiveFilePath(data.newRelativePath);
        }
        loadProjectFiles(projectId);
      } else {
        const err = await res.json();
        addToast(`Rename failed: ${err.error}`, 'error');
      }
    } catch (e: any) {
      addToast(`Rename error: ${e.message}`, 'error');
    }
  };

  const handleDeleteItem = async (pathToDelete: string) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/file?path=${encodeURIComponent(pathToDelete)}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        if (activeFilePath === pathToDelete) {
          setActiveFilePath('main.tex');
          loadFileContent(projectId, 'main.tex');
        }
        loadProjectFiles(projectId);
      } else {
        const err = await res.json();
        addToast(`Delete failed: ${err.error}`, 'error');
      }
    } catch (e: any) {
      addToast(`Delete error: ${e.message}`, 'error');
    }
  };

  const handleDuplicateItem = async (path: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filePath: path }),
      });
      if (res.ok) {
        loadProjectFiles(projectId);
      }
    } catch (e: any) {
      addToast(`Duplicate error: ${e.message}`, 'error');
    }
  };

  // Open the NewItemModal for creating files or folders
  const handleNewFile = (parentFolder = '') => {
    setNewItemModal({ mode: 'file', parentFolder });
  };

  const handleNewFolder = (parentFolder = '') => {
    setNewItemModal({ mode: 'folder', parentFolder });
  };

  // Called by NewItemModal after the user types a name and confirms
  const handleCreateNewItem = async (itemName: string) => {
    if (!newItemModal) return;
    const { mode, parentFolder } = newItemModal;
    const targetPath = parentFolder ? `${parentFolder}/${itemName}` : itemName;
    try {
      const res = await fetch(`/api/projects/${projectId}/create-file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath, type: mode === 'folder' ? 'directory' : 'file' }),
      });
      if (res.ok) {
        loadProjectFiles(projectId);
        if (mode === 'file') handleSelectFile(targetPath);
        addToast(
          mode === 'file' ? `File "${itemName}" created.` : `Folder "${itemName}" created.`,
          'success'
        );
      } else {
        const err = await res.json();
        addToast(`Failed: ${err.error}`, 'error');
      }
    } catch (e: any) {
      addToast(`Error: ${e.message}`, 'error');
    }
  };

  // Coordinated View Mode Transitions:
  // 1. When switching from full PDF mode into Split or Code mode,
  //    automatically sync Monaco editor to the section visible in the PDF.
  // 2. When switching from full Code mode into PDF or Split mode,
  //    automatically sync PDF preview to the cursor / visible section in the Code editor.
  const handleViewModeChange = useCallback(
    (newMode: ViewMode) => {
      const oldMode = viewMode;
      if (oldMode === newMode) return;

      if (oldMode === 'pdf' && (newMode === 'split' || newMode === 'code')) {
        const syncTarget = pdfViewerRef.current?.getVisibleSyncTarget();
        if (syncTarget) {
          handleSyncTexBackward(syncTarget.page, syncTarget.x, syncTarget.y, syncTarget.text);
        }
      }

      if (oldMode === 'code' && (newMode === 'pdf' || newMode === 'split')) {
        handleJumpToPdf(newMode);
      }

      setViewMode(newMode);
    },
    [viewMode, handleSyncTexBackward, handleJumpToPdf]
  );

  // Global Keyboard Shortcuts
  useKeyboardShortcuts({
    viewMode,
    setViewMode: handleViewModeChange,
    setPdfCollapsed,
    setFileTreeCollapsed,
    saveActiveFile,
    getLiveContent,
  });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface-light dark:bg-surface-dark text-slate-900 dark:text-white">
      {currentView === 'dashboard' ? (
        <ProjectsDashboard
          projects={projects}
          onSelectProject={handleOpenProject}
          onNewProject={() => setIsNewProjectModalOpen(true)}
          onRefreshProjects={loadProjects}
          onOpenDoctor={() => setIsDoctorOpen(true)}
          isDoctorHealthy={isDoctorHealthy}
        />
      ) : (
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Top Header Bar */}
          <TopBar
            projectName={projectName}
            projectId={projectId}
            projects={projects}
            onSelectProject={handleOpenProject}
            onNewProject={() => setIsNewProjectModalOpen(true)}
            onBackToProjects={handleBackToProjects}
            onCompile={handleCompile}
            isCompiling={isCompiling}
            compileDuration={compileDuration}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            onOpenHistory={() => setIsHistoryOpen(true)}
            onOpenDoctor={() => setIsDoctorOpen(true)}
            isDoctorHealthy={isDoctorHealthy}
            activeFilePath={activeFilePath}
            saveStatus={saveStatus}
          />

          {/* Main Workspace Body: Resizable 3-Panel Layout */}
          <div className="flex-1 flex overflow-hidden relative">
        {/* Collapsed Sidebar Rail (when collapsed) */}
        {fileTreeCollapsed && (
          <div className="w-10 h-full border-r border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel flex flex-col items-center py-3 space-y-3 z-10 flex-shrink-0 select-none transition-colors">
            <button
              onClick={() => setFileTreeCollapsed(false)}
              title="Expand Files Sidebar (Ctrl+B)"
              className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 text-stone-500 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
            <div className="text-stone-400 p-1">
              <FolderClosed className="w-4 h-4" />
            </div>
          </div>
        )}

        <PanelGroup
          direction="horizontal"
          autoSaveId="overleaf-copy-layout-v3"
          className="flex-1 h-full"
        >
          {/* Panel 1: File Tree Sidebar */}
          {!fileTreeCollapsed && (
            <>
              <Panel
                ref={fileTreePanelRef}
                id="file-tree-panel"
                order={1}
                defaultSize={18}
                minSize={12}
                maxSize={35}
                collapsible={true}
                onCollapse={() => setFileTreeCollapsed(true)}
                onExpand={() => setFileTreeCollapsed(false)}
                className="h-full"
              >
                <FileTree
                  files={files}
                  selectedFilePath={activeFilePath}
                  onSelectFile={handleSelectFile}
                  onUploadFiles={handleUploadFiles}
                  onNewFile={handleNewFile}
                  onNewFolder={handleNewFolder}
                  onRenameItem={handleRenameItem}
                  onDeleteItem={handleDeleteItem}
                  onDuplicateItem={handleDuplicateItem}
                  onToggleCollapse={() => setFileTreeCollapsed(true)}
                />
              </Panel>

              {/* Resize Handle between FileTree and Editor */}
              <PanelResizeHandle className="w-1.5 hover:bg-scholarly/40 dark:hover:bg-scholarly-dark/40 active:bg-scholarly dark:active:bg-scholarly-dark transition-colors cursor-col-resize z-20 relative group">
                <div className="w-0.5 h-6 bg-stone-300 dark:bg-stone-700 group-hover:bg-scholarly dark:group-hover:bg-scholarly-dark mx-auto rounded-full mt-[45vh]" />
              </PanelResizeHandle>
            </>
          )}

          {/* Panel 2: Editor */}
          {viewMode !== 'pdf' && (
            <Panel
              id="editor-panel"
              order={2}
              defaultSize={viewMode === 'code' || pdfCollapsed ? 82 : 42}
              minSize={25}
              className="h-full flex flex-col overflow-hidden"
            >
              <EditorToolbar
                onInsertSnippet={handleInsertSnippet}
                onWrapSelection={handleWrapSelection}
                onOpenImageModal={() => setIsImageModalOpen(true)}
                onOpenTableModal={() => setIsTableModalOpen(true)}
                onOpenCitationModal={() => setIsCitationModalOpen(true)}
                onJumpToPdf={handleJumpToPdf}
                isJumpingToPdf={isJumpingToPdf}
                isLiveMathEnabled={isLiveMathEnabled}
                onToggleLiveMath={() => {
                  setIsLiveMathEnabled((prev) => {
                    const next = !prev;
                    localStorage.setItem('overleaf-copy:live-math-enabled', next.toString());
                    if (!next) {
                      setLiveEquation(null);
                    }
                    return next;
                  });
                }}
              />
              <div className="flex-1 relative overflow-hidden">
                <Editor
                  content={editorContent}
                  onChange={handleEditorChange}
                  onCompile={handleCompile}
                  onEquationChange={(eq, pos, isDisplay) => {
                    if (!isLiveMathEnabled) {
                      setLiveEquation(null);
                      return;
                    }
                    setLiveEquation(eq);
                    setLiveEquationPos(pos);
                    setLiveEquationDisplay(isDisplay ?? true);
                  }}
                  editorRefOut={monacoEditorRef}
                  getProjectContext={getProjectContext}
                  onJumpToPdf={handleJumpToPdf}
                  highlightLine={highlightLine}
                />
              </div>
            </Panel>
          )}

          {/* Resize Handle between Editor and PDF */}
          {viewMode === 'split' && !pdfCollapsed && (
            <PanelResizeHandle className="w-1.5 hover:bg-scholarly/40 dark:hover:bg-scholarly-dark/40 active:bg-scholarly dark:active:bg-scholarly-dark transition-colors cursor-col-resize z-20 relative group">
              <div className="w-0.5 h-6 bg-stone-300 dark:bg-stone-700 group-hover:bg-scholarly dark:group-hover:bg-scholarly-dark mx-auto rounded-full mt-[45vh]" />
            </PanelResizeHandle>
          )}

          {/* Panel 3: PDF Viewer */}
          {viewMode !== 'code' && !pdfCollapsed && (
            <Panel
              ref={pdfPanelRef}
              id="pdf-panel"
              order={3}
              defaultSize={viewMode === 'pdf' ? 100 : 40}
              minSize={20}
              collapsible={true}
              onCollapse={() => setPdfCollapsed(true)}
              onExpand={() => setPdfCollapsed(false)}
              className="h-full overflow-hidden"
            >
              <PDFViewer
                ref={pdfViewerRef}
                pdfUrl={pdfUrl}
                lastValidPdfUrl={lastValidPdfUrl}
                compileDuration={compileDuration}
                compileStatus={compileStatus}
                compileErrors={compileErrors}
                onSelectErrorLine={(line) => {
                  if (monacoEditorRef.current) {
                    monacoEditorRef.current.revealLineInCenter(line);
                    monacoEditorRef.current.setPosition({ lineNumber: line, column: 1 });
                    monacoEditorRef.current.focus();
                  }
                }}
                onToggleCollapse={() => setPdfCollapsed(true)}
                synctexTarget={synctexTarget}
                onSyncTexHandled={handleSyncTexHandled}
                onSyncTexBackward={handleSyncTexBackward}
                isSyncingBackward={isSyncingBackward}
                downloadFileName={
                  docTitle
                    ? `${docTitle}.pdf`
                    : getLatexPdfFilename(editorContent, projectName)
                }
              />
            </Panel>
          )}
        </PanelGroup>

        {/* Collapsed PDF Rail (when collapsed in split mode) */}
        {viewMode === 'split' && pdfCollapsed && (
          <div className="w-10 h-full border-l border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightPanel dark:bg-surface-darkPanel flex flex-col items-center py-3 space-y-3 z-10 flex-shrink-0 select-none transition-colors">
            <button
              onClick={() => setPdfCollapsed(false)}
              title="Expand PDF Preview"
              className="p-1.5 rounded hover:bg-stone-200/80 dark:hover:bg-stone-800 text-stone-500 hover:text-scholarly dark:hover:text-scholarly-dark transition btn-tactile"
            >
              <PanelLeftOpen className="w-4 h-4 rotate-180" />
            </button>
          </div>
        )}
      </div>
    </div>
  )}

      {/* Live KaTeX Equation Tooltip */}
      {isLiveMathEnabled && (
        <EquationPreview
          equation={liveEquation}
          position={liveEquationPos}
          displayMode={liveEquationDisplay}
          onClose={() => setLiveEquation(null)}
        />
      )}

      {/* Insert Image Modal */}
      <InsertImageModal
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        files={files}
        projectId={projectId}
        editorContent={editorContent}
        onInsert={handleInsertSnippet}
        onUploadFiles={handleUploadFiles}
      />

      {/* Insert Table Modal */}
      <InsertTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        onInsert={handleInsertSnippet}
      />

      {/* New Project Modal */}
      <NewProjectModal
        isOpen={isNewProjectModalOpen}
        onClose={() => setIsNewProjectModalOpen(false)}
        onCreate={async (name, template) => {
          try {
            const res = await fetch('/api/projects', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name, template }),
            });
            if (res.ok) {
              const newProj = await res.json();
              await loadProjects();
              handleOpenProject(newProj.id);
              setIsNewProjectModalOpen(false);
            }
          } catch (e: any) {
            addToast(`Could not create project: ${e.message}`, 'error');
          }
        }}
      />

      {/* Upload Progress Modal for Multi-File Import */}
      <UploadProgressModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        files={uploadQueue}
        onCancelItem={(id) => {
          setUploadQueue((prev) =>
            prev.map((q) => (q.id === id ? { ...q, status: 'cancelled' } : q))
          );
        }}
        onCancelAll={() => {
          setUploadQueue((prev) =>
            prev.map((q) => (q.status === 'waiting' ? { ...q, status: 'cancelled' } : q))
          );
        }}
      />

      {/* Dependency Doctor Modal */}
      <DependencyDoctor
        isOpen={isDoctorOpen}
        onClose={() => setIsDoctorOpen(false)}
        dependencies={doctorDeps}
        allHealthy={isDoctorHealthy ?? false}
        onRefresh={checkDependencies}
        isRefreshing={isRefreshingDoctor}
      />

      {/* Version History & Checkpoints Drawer */}
      <HistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        projectId={projectId}
        activeFilePath={activeFilePath}
        onRevertSuccess={handleRevertSuccess}
      />

      {/* Insert Citation Modal */}
      <InsertCitationModal
        isOpen={isCitationModalOpen}
        onClose={() => setIsCitationModalOpen(false)}
        projectId={projectId}
        onInsert={handleInsertSnippet}
        onCitationAdded={() => loadCitations(projectId)}
      />

      {/* New File / Folder Modal (replaces window.prompt) */}
      <NewItemModal
        isOpen={newItemModal !== null}
        mode={newItemModal?.mode ?? 'file'}
        parentFolder={newItemModal?.parentFolder}
        onConfirm={handleCreateNewItem}
        onClose={() => setNewItemModal(null)}
      />

      {/* Toast Notifications (replaces window.alert) */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
