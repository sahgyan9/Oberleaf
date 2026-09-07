import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, ImperativePanelHandle } from 'react-resizable-panels';
import { TopBar, ViewMode, ProjectInfo } from './components/TopBar/TopBar';
import { StatusBar } from './components/StatusBar/StatusBar';
import { FileTree, FileEntry } from './components/FileTree/FileTree';
import { EditorToolbar } from './components/EditorToolbar/EditorToolbar';
import { Editor } from './components/Editor/Editor';
import { PDFViewer, CompileErrorItem, SyncTexTarget, PDFViewerHandle, SuggestedFix } from './components/PDFViewer/PDFViewer';
import { EquationPreview } from './components/EquationPreview/EquationPreview';
import { InsertImageModal } from './components/Modals/InsertImageModal';
import { InsertTableModal } from './components/Modals/InsertTableModal';
import { NewProjectModal } from './components/Modals/NewProjectModal';
import { UploadProgressModal, UploadFileItem } from './components/Modals/UploadProgressModal';
import { NewItemModal } from './components/Modals/NewItemModal';
import { DependencyDoctor, DependencyItem } from './components/DependencyDoctor/DependencyDoctor';
import { HistoryDrawer } from './components/History/HistoryDrawer';
import { GitSyncModal } from './components/GitSync/GitSyncModal';
import { CommentsDrawer, CommentThread } from './components/Comments/CommentsDrawer';
import { CollabModal } from './components/Collaboration/CollabModal';
import { CollabSessionConfig, broadcastRemoteCompile, leaveCollabSession } from './utils/yjsCollab';
import { InsertCitationModal, CitationItem } from './components/Modals/InsertCitationModal';
import { ProjectContext } from './utils/latexCompletions';
import { PanelLeftOpen, FolderClosed, ChevronRight, Loader2 } from 'lucide-react';
import { ProjectsDashboard } from './components/Dashboard/ProjectsDashboard';
import { UpdateModal, UpdateInfo } from './components/Update/UpdateModal';
import { extractLatexTitle, getLatexPdfFilename } from './utils/latexTitle';
import { useToast, ToastContainer } from './components/Toast/Toast';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import {
  DetectedMissingPackage,
  scanMissingPackages,
  injectPackagesIntoPreamble,
  wrapMathEnvironment,
} from './utils/latexPackages';
import {
  wrapOrToggleFormatting,
  wrapOrToggleSelection,
  BOLD_FORMAT,
  ITALIC_FORMAT,
} from './utils/editorFormatting';

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
    const urlParams = new URLSearchParams(window.location.search);
    const queryProj = urlParams.get('project');
    if (queryProj) return queryProj;
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
  const [isFullscreen, setIsFullscreen] = useState<boolean>(() => !!document.fullscreenElement);
  const [isZenMode, setIsZenMode] = useState<boolean>(false);
  const [isTopBarHovered, setIsTopBarHovered] = useState<boolean>(false);
  const hoverTimeoutRef = useRef<any>(null);
  const hoverDwellRef = useRef<any>(null);

  // Compiler State
  const [isCompiling, setIsCompiling] = useState<boolean>(false);
  const [compileStatus, setCompileStatus] = useState<'idle' | 'compiling' | 'success' | 'failed'>('idle');
  const [compileDuration, setCompileDuration] = useState<number | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [lastValidPdfUrl, setLastValidPdfUrl] = useState<string | null>(null);
  const [compileErrors, setCompileErrors] = useState<CompileErrorItem[]>([]);
  // 1-Click Quick-Fix & Auto-Remedy State
  const lastPreFixContentRef = useRef<string | null>(null);
  const [canUndoFix, setCanUndoFix] = useState<boolean>(false);
  const [detectedMissingPackages, setDetectedMissingPackages] = useState<DetectedMissingPackage[]>([]);

  // Live KaTeX Math State
  const [liveEquation, setLiveEquation] = useState<string | null>(null);
  const [liveEquationPos, setLiveEquationPos] = useState<{ top: number; left: number } | undefined>(undefined);
  const [liveEquationDisplay, setLiveEquationDisplay] = useState<boolean>(true);
  const [isLiveMathEnabled, setIsLiveMathEnabled] = useState<boolean>(() => {
    return localStorage.getItem('overleaf-copy:live-math-enabled') !== 'false';
  });
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number }>({ line: 1, column: 1 });

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

  // Git Remote Sync & Push/Pull State
  const [isGitSyncModalOpen, setIsGitSyncModalOpen] = useState<boolean>(false);
  const [gitSyncStatus, setGitSyncStatus] = useState<{ ahead: number; behind: number; remoteUrl: string | null } | null>(null);

  // Review Comments State
  const [isCommentsDrawerOpen, setIsCommentsDrawerOpen] = useState<boolean>(false);
  const [comments, setComments] = useState<CommentThread[]>([]);
  const [openCommentsCount, setOpenCommentsCount] = useState<number>(0);
  const [commentCursorLine, setCommentCursorLine] = useState<number>(1);
  const [commentSelectedText, setCommentSelectedText] = useState<string>('');

  // Real-Time Peer-to-Peer Collaboration State
  const [isCollabModalOpen, setIsCollabModalOpen] = useState<boolean>(false);
  const [collabSession, setCollabSession] = useState<CollabSessionConfig | null>(null);
  const [collabPeersCount, setCollabPeersCount] = useState<number>(0);

  // In-App Software Update State (Approaches 1 + 3)
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState<boolean>(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);

  const handleCheckForUpdates = useCallback(async (force = false, openModal = false) => {
    setIsCheckingUpdate(true);
    try {
      const res = await fetch(`/api/system/check-update${force ? '?force=true' : ''}`);
      if (res.ok) {
        const data: UpdateInfo = await res.json();
        setUpdateInfo(data);
        if (data.hasUpdate || openModal) {
          setIsUpdateModalOpen(true);
        }
      }
    } catch (err) {
      console.warn('[Oberleaf] Failed to check for software updates:', err);
    } finally {
      setIsCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      handleCheckForUpdates(false, false);
    }, 2500);
    return () => clearTimeout(timer);
  }, [handleCheckForUpdates]);

  // Phase 3: Citations State
  const [citations, setCitations] = useState<CitationItem[]>([]);
  const [isCitationModalOpen, setIsCitationModalOpen] = useState<boolean>(false);

  // Phase 3: SyncTeX Bi-directional State
  const [synctexTarget, setSynctexTarget] = useState<SyncTexTarget | null>(null);
  const [isJumpingToPdf, setIsJumpingToPdf] = useState<boolean>(false);
  const [isSyncingBackward, setIsSyncingBackward] = useState<boolean>(false);
  const [highlightLine, setHighlightLine] = useState<{ line: number; timestamp: number } | null>(null);
  const [isResizing, setIsResizing] = useState<boolean>(false);

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

        // Check if URL query parameter or hash specifies an existing project
        const urlParams = new URLSearchParams(window.location.search);
        const queryProjId = urlParams.get('project');
        if (queryProjId) {
          const match = data.find((p) => p.id === queryProjId);
          if (match) {
            setProjectId(match.id);
            setProjectName(match.name);
            return;
          }
        }

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
      console.warn('[Oberleaf] Network error loading /api/projects:', err);
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
    // Touch on backend to record access time
    fetch(`/api/projects/${id}/touch`, { method: 'POST' }).catch(() => {});

    // Optimistically update timestamp in local state so Recents updates immediately
    const nowIso = new Date().toISOString();
    setProjects((prev) =>
      prev.map((p) =>
        p.id === id
          ? { ...p, updatedAt: nowIso, lastModifiedRelative: 'Just now by You' }
          : p
      )
    );

    const match = projects.find((p) => p.id === id);
    if (match) {
      setProjectName(match.name);
      if (match.hasPdf) {
        const initialPdf = `/api/projects/${id}/pdf?t=${Date.now()}`;
        setPdfUrl(initialPdf);
        setLastValidPdfUrl(initialPdf);
        setCompileStatus('idle');
      } else {
        setPdfUrl(null);
        setLastValidPdfUrl(null);
      }
    } else {
      setPdfUrl(null);
      setLastValidPdfUrl(null);
    }

    setProjectId(id);
    localStorage.setItem('overleaf-copy:active-project-id', id);
    window.location.hash = `#/project/${id}`;
    setCurrentView('editor');
  }, [projects]);

  // Return from editor back to projects dashboard
  const handleBackToProjects = useCallback(() => {
    loadProjects();
    setCurrentView('dashboard');
    window.location.hash = '#/projects';
  }, [loadProjects]);

  // Sync view state with browser URL hash
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/project/')) {
        const id = hash.replace('#/project/', '').trim();
        if (id) {
          fetch(`/api/projects/${id}/touch`, { method: 'POST' }).catch(() => {});
          setProjectId(id);
          const match = projects.find((p) => p.id === id);
          if (match) {
            setProjectName(match.name);
            if (match.hasPdf) {
              const initialPdf = `/api/projects/${id}/pdf?t=${Date.now()}`;
              setPdfUrl(initialPdf);
              setLastValidPdfUrl(initialPdf);
              setCompileStatus('idle');
            }
          }
          setCurrentView('editor');
        }
      } else {
        loadProjects();
        setCurrentView('dashboard');
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [projects, loadProjects]);

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

  // Fetch Git Sync Status
  const fetchGitSyncStatus = useCallback(async (pId: string) => {
    if (!pId) return;
    try {
      const res = await fetch(`/api/projects/${pId}/git/status`);
      if (res.ok) {
        const data = await res.json();
        setGitSyncStatus({
          ahead: data.ahead || 0,
          behind: data.behind || 0,
          remoteUrl: data.remoteUrl || null,
        });
      }
    } catch {}
  }, []);

  // Fetch Review Comments
  const fetchComments = useCallback(async (pId: string) => {
    if (!pId) return;
    try {
      const res = await fetch(`/api/projects/${pId}/comments`);
      if (res.ok) {
        const data: CommentThread[] = await res.json();
        setComments(data);
        setOpenCommentsCount(data.filter((t) => t.status === 'open').length);
      }
    } catch {}
  }, []);

  const handleCleanBuild = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/clean`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        addToast(data.message || 'Build cache cleared', 'success');
      } else {
        addToast(data.error || 'Failed to clean build cache', 'error');
      }
    } catch (e: any) {
      addToast(`Clean error: ${e.message}`, 'error');
    }
  }, [projectId, addToast]);

  // When active project changes, reload files, citations, git status, comments, main.tex, and existing PDF preview
  useEffect(() => {
    if (!projectId) return;
    localStorage.setItem('overleaf-copy:active-project-id', projectId);
    loadProjectFiles(projectId);
    loadCitations(projectId);
    fetchGitSyncStatus(projectId);
    fetchComments(projectId);
    setActiveFilePath('main.tex');
    loadFileContent(projectId, 'main.tex');

    // Auto-detect existing compiled PDF so the user doesn't have to recompile
    let isMounted = true;
    fetch(`/api/projects/${projectId}/pdf`, { method: 'HEAD' })
      .then((res) => {
        if (!isMounted) return;
        if (res.ok) {
          const freshPdf = `/api/projects/${projectId}/pdf?t=${Date.now()}`;
          setPdfUrl(freshPdf);
          setLastValidPdfUrl(freshPdf);
          setCompileStatus('idle');
        } else {
          setPdfUrl(null);
          setLastValidPdfUrl(null);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPdfUrl(null);
          setLastValidPdfUrl(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [projectId, loadProjectFiles, loadCitations, loadFileContent, fetchGitSyncStatus, fetchComments]);

  // Check for ?room= URL parameter for instant peer joining
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room && !collabSession) {
      const authorName = localStorage.getItem('oberleaf_author_name') || 'Peer Collaborator';
      setCollabSession({
        room,
        name: authorName,
        color: '#15D8B3',
        filePath: activeFilePath,
        onPeersChange: (count) => setCollabPeersCount(count),
        onRemoteCompile: (timestamp) => {
          if (projectId) {
            const freshUrl = `/api/projects/${projectId}/pdf?t=${timestamp}`;
            setPdfUrl(freshUrl);
            setLastValidPdfUrl(freshUrl);
            addToast('Document recompiled by collaborator. Preview updated.', 'info');
          }
        },
      });
      addToast(`Joined live collaboration session: ${room}`, 'success');
    }
  }, [addToast, collabSession, activeFilePath, projectId]);

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
    setDetectedMissingPackages([]);

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

        if (errors.length > 0) {
          setDetectedMissingPackages(result.detectedMissingPackages || scanMissingPackages(getLiveContent()));
        } else {
          setDetectedMissingPackages([]);
        }

        if (errors.length === 0 && lastPreFixContentRef.current) {
          addToast('Compilation succeeded with 0 errors.', 'success');
          setCanUndoFix(false);
          lastPreFixContentRef.current = null;
        }

        if (result.pdfUrl) {
          const freshPdfUrl = `${result.pdfUrl}&t=${Date.now()}`;
          setPdfUrl(freshPdfUrl);
          setLastValidPdfUrl(freshPdfUrl);
          broadcastRemoteCompile(Date.now());
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

  // 1-Click Intelligent Quick-Fix Handler
  const handleApplyFix = async (fix: SuggestedFix) => {
    if (fix.type === 'add_preamble') {
      const currentLiveContent = getLiveContent();

      // Check if package is already declared in preamble
      const pkgRegex = new RegExp(`\\\\usepackage(?:\\[.*?\\])?\\{${fix.packageName}\\}`, 'i');
      if (pkgRegex.test(currentLiveContent)) {
        addToast(`\\usepackage{${fix.packageName}} is already in your document preamble!`, 'warning');
        return;
      }

      // Record snapshot for 1-click rollback
      lastPreFixContentRef.current = currentLiveContent;
      setCanUndoFix(true);

      let updatedContent = currentLiveContent;
      const docClassMatch = updatedContent.match(/(\\documentclass(?:\[.*?\])?\{.*?\})/);
      const usePackageMatches = [...updatedContent.matchAll(/\\usepackage(?:\[.*?\])?\{.*?\}/g)];

      if (fix.packageName === 'hyperref') {
        // hyperref should be placed towards the end of the package block before \begin{document}
        const beginDocMatch = updatedContent.match(/\\begin\{document\}/);
        if (beginDocMatch && beginDocMatch.index !== undefined) {
          const insertPos = beginDocMatch.index;
          updatedContent = updatedContent.slice(0, insertPos) + `${fix.codeSnippet}\n\n` + updatedContent.slice(insertPos);
        } else if (usePackageMatches.length > 0) {
          const lastPkg = usePackageMatches[usePackageMatches.length - 1];
          const insertPos = lastPkg.index! + lastPkg[0].length;
          updatedContent = updatedContent.slice(0, insertPos) + `\n${fix.codeSnippet}` + updatedContent.slice(insertPos);
        } else if (docClassMatch && docClassMatch.index !== undefined) {
          const insertPos = docClassMatch.index + docClassMatch[0].length;
          updatedContent = updatedContent.slice(0, insertPos) + `\n\n${fix.codeSnippet}` + updatedContent.slice(insertPos);
        } else {
          updatedContent = `${fix.codeSnippet}\n${updatedContent}`;
        }
      } else {
        // Standard package: append after the last \usepackage or after \documentclass
        if (usePackageMatches.length > 0) {
          const lastPkg = usePackageMatches[usePackageMatches.length - 1];
          const insertPos = lastPkg.index! + lastPkg[0].length;
          updatedContent = updatedContent.slice(0, insertPos) + `\n${fix.codeSnippet}` + updatedContent.slice(insertPos);
        } else if (docClassMatch && docClassMatch.index !== undefined) {
          const insertPos = docClassMatch.index + docClassMatch[0].length;
          updatedContent = updatedContent.slice(0, insertPos) + `\n\n${fix.codeSnippet}` + updatedContent.slice(insertPos);
        } else {
          updatedContent = `${fix.codeSnippet}\n${updatedContent}`;
        }
      }

      // Update Monaco editor buffer and React state
      if (monacoEditorRef.current) {
        monacoEditorRef.current.setValue(updatedContent);
      }
      setEditorContent(updatedContent);
      await saveActiveFile(updatedContent);

      addToast(`Added ${fix.codeSnippet} to preamble. Recompiling...`, 'info');

      // Trigger recompile
      setTimeout(() => {
        handleCompile();
      }, 50);
    } else if (fix.type === 'install_package') {
      addToast(`Installing '${fix.packageName}' package via TeX distribution...`, 'info');
      try {
        const res = await fetch(`/api/projects/${projectId}/packages/install`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packageName: fix.packageName }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          addToast(`${data.message} Recompiling...`, 'success');
          setTimeout(() => {
            handleCompile();
          }, 100);
        } else {
          addToast(`Failed to install package: ${data.error || 'Unknown error'}`, 'error');
        }
      } catch (err: any) {
        addToast(`Install request failed: ${err.message}`, 'error');
      }
    } else if (fix.type === 'wrap_math_mode') {
      const currentLiveContent = getLiveContent();
      lastPreFixContentRef.current = currentLiveContent;
      setCanUndoFix(true);

      const envName = fix.targetEnvironment || 'bmatrix';
      const updatedContent = wrapMathEnvironment(currentLiveContent, fix.line || 0, envName);

      if (updatedContent !== currentLiveContent) {
        if (monacoEditorRef.current) {
          monacoEditorRef.current.setValue(updatedContent);
        }
        setEditorContent(updatedContent);
        await saveActiveFile(updatedContent);

        addToast(`Wrapped \\begin{${envName}} in display math mode (\\[ ... \\]). Recompiling...`, 'info');
        setTimeout(() => {
          handleCompile();
        }, 50);
      } else {
        addToast(`Could not locate \\begin{${envName}} around line ${fix.line || 1} to wrap.`, 'warning');
      }
    } else if (fix.type === 'replace_line') {
      // replace_line: find the target line by its text (with whitespace tolerance
      // and CRLF resilience) then replace or remove it.
      const currentLiveContent = getLiveContent();
      lastPreFixContentRef.current = currentLiveContent;
      setCanUndoFix(true);

      const lines = currentLiveContent.split('\n');
      const hintIdx = (fix.line ?? 1) - 1; // 0-based hint from server

      // Search within ±4 lines of hint for text match (ignoring \r and outer whitespace)
      let targetIdx = -1;
      if (fix.find !== undefined) {
        const cleanFind = fix.find.replace(/\r$/, '').trim();
        const searchStart = Math.max(0, hintIdx - 4);
        const searchEnd = Math.min(lines.length - 1, hintIdx + 4);
        for (let i = searchStart; i <= searchEnd; i++) {
          if (lines[i].replace(/\r$/, '').trim() === cleanFind) {
            targetIdx = i;
            break;
          }
        }
        // Fallback: search across entire document
        if (targetIdx < 0) {
          targetIdx = lines.findIndex((l) => l.replace(/\r$/, '').trim() === cleanFind);
        }
        // Fallback: use hinted line directly
        if (targetIdx < 0 && hintIdx >= 0 && hintIdx < lines.length) {
          targetIdx = hintIdx;
        }
      } else {
        targetIdx = hintIdx;
      }

      if (targetIdx >= 0 && targetIdx < lines.length) {
        const replacement = fix.replace ?? '';
        if (replacement === '') {
          // Delete the line entirely
          lines.splice(targetIdx, 1);
        } else {
          // Preserve original indentation if replacement has no leading indentation
          const origIndent = lines[targetIdx].match(/^(\s*)/)?.[1] || '';
          const repIndent = replacement.match(/^(\s*)/)?.[1] || '';
          const finalRep =
            repIndent === '' && origIndent !== ''
              ? origIndent + replacement.trimStart()
              : replacement;
          lines[targetIdx] = finalRep;
        }
        const updatedContent = lines.join('\n');
        if (monacoEditorRef.current) {
          monacoEditorRef.current.setValue(updatedContent);
          const targetLineNum = Math.min(lines.length, targetIdx + 1);
          monacoEditorRef.current.revealLineInCenter(targetLineNum);
          monacoEditorRef.current.setPosition({ lineNumber: targetLineNum, column: 1 });
        }
        setEditorContent(updatedContent);
        await saveActiveFile(updatedContent);
        addToast(`Applied fix on line ${(fix.line ?? targetIdx + 1)}. Recompiling…`, 'info');
        setTimeout(() => { handleCompile(); }, 50);
      } else {
        addToast('Could not locate the target line to fix. Please fix it manually.', 'warning');
      }
    }
  };

  // 1-Click Proactive Batch Fix: Injects all detected missing packages into preamble
  const handleApplyBatchFix = async (pkgs: DetectedMissingPackage[]) => {
    if (!pkgs || pkgs.length === 0) return;

    const currentLiveContent = getLiveContent();
    lastPreFixContentRef.current = currentLiveContent;
    setCanUndoFix(true);

    const updatedContent = injectPackagesIntoPreamble(currentLiveContent, pkgs);

    if (monacoEditorRef.current) {
      monacoEditorRef.current.setValue(updatedContent);
    }
    setEditorContent(updatedContent);
    await saveActiveFile(updatedContent);

    const names = pkgs.map((p) => `\\usepackage{${p.packageName}}`).join(', ');
    addToast(`Added ${names} to preamble. Recompiling...`, 'info');

    setTimeout(() => {
      handleCompile();
    }, 50);
  };

  // 1-Click Rollback Handler
  const handleUndoFix = async () => {
    if (!lastPreFixContentRef.current) return;
    const reverted = lastPreFixContentRef.current;
    lastPreFixContentRef.current = null;
    setCanUndoFix(false);

    if (monacoEditorRef.current) {
      monacoEditorRef.current.setValue(reverted);
    }
    setEditorContent(reverted);
    await saveActiveFile(reverted);

    addToast('Reverted previous automatic change. Recompiling...', 'info');
    setTimeout(() => {
      handleCompile();
    }, 50);
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

  const handleBold = useCallback(() => {
    const editor = monacoEditorRef.current;
    if (editor) {
      wrapOrToggleFormatting(editor, BOLD_FORMAT);
    }
  }, []);

  const handleItalic = useCallback(() => {
    const editor = monacoEditorRef.current;
    if (editor) {
      wrapOrToggleFormatting(editor, ITALIC_FORMAT);
    }
  }, []);

  // Wrap or toggle the current selection in a LaTeX command with smart unwrapping and undo support
  const handleWrapSelection = useCallback((prefix: string, suffix: string, placeholder: string) => {
    const editor = monacoEditorRef.current;
    if (!editor) {
      setEditorContent((prev) => `${prev}\n${prefix}${placeholder}${suffix}`);
      return;
    }
    wrapOrToggleSelection(editor, prefix, suffix, placeholder);
  }, []);

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
  const handleRevealInExplorer = useCallback(async (filePath?: string) => {
    try {
      const res = await fetch('/api/system/reveal-in-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: projectId || undefined,
          filePath: filePath || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        addToast(`Opened in File Explorer: ${data.path}`, 'info');
      } else {
        addToast(data.error || 'Failed to open File Explorer.', 'error');
      }
    } catch (err: any) {
      addToast(`Explorer connection error: ${err.message}`, 'error');
    }
  }, [projectId, addToast]);

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

  // Fullscreen & Zen Mode Handlers
  const handleToggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
        setIsZenMode(true);
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
        setIsZenMode(false);
      }
    } catch {
      // In case native fullscreen is restricted by browser security policies,
      // still toggle Zen mode for maximum in-window writing canvas
      setIsZenMode((prev) => !prev);
    }
  }, []);

  const handleExitZenMode = useCallback(async () => {
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
    setIsZenMode(false);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (active) {
        setIsZenMode(true);
      } else {
        setIsZenMode(false);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const handleTopBarMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (hoverDwellRef.current) {
      clearTimeout(hoverDwellRef.current);
      hoverDwellRef.current = null;
    }
    setIsTopBarHovered(true);
  }, []);

  const handleSensorMouseEnter = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (!hoverDwellRef.current) {
      hoverDwellRef.current = setTimeout(() => {
        setIsTopBarHovered(true);
        hoverDwellRef.current = null;
      }, 100);
    }
  }, []);

  const handleSensorMouseLeave = useCallback(() => {
    if (hoverDwellRef.current) {
      clearTimeout(hoverDwellRef.current);
      hoverDwellRef.current = null;
    }
  }, []);

  const handleTopBarMouseLeave = useCallback(() => {
    if (hoverDwellRef.current) {
      clearTimeout(hoverDwellRef.current);
      hoverDwellRef.current = null;
    }
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    hoverTimeoutRef.current = setTimeout(() => {
      setIsTopBarHovered(false);
    }, 250);
  }, []);

  // Global Keyboard Shortcuts
  useKeyboardShortcuts({
    viewMode,
    setViewMode: handleViewModeChange,
    setPdfCollapsed,
    setFileTreeCollapsed,
    saveActiveFile,
    getLiveContent,
    onToggleFitWidth: () => {
      if (currentView === 'editor' && !pdfCollapsed) {
        pdfViewerRef.current?.toggleFitWidth?.();
      }
    },
    onToggleFullscreen: handleToggleFullscreen,
    isZenMode,
    onExitZenMode: handleExitZenMode,
    onBold: handleBold,
    onItalic: handleItalic,
  });

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-surface-light dark:bg-surface-dark text-slate-900 dark:text-white">
      {currentView === 'dashboard' ? (
        <div className="h-full w-full overflow-y-auto">
          <ProjectsDashboard
            projects={projects}
            onSelectProject={handleOpenProject}
            onNewProject={() => setIsNewProjectModalOpen(true)}
            onRefreshProjects={loadProjects}
            onOpenDoctor={() => setIsDoctorOpen(true)}
            isDoctorHealthy={isDoctorHealthy}
            hasUpdate={!!updateInfo?.hasUpdate}
            onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
            onCheckForUpdates={() => handleCheckForUpdates(true, true)}
            onShowToast={addToast}
          />
        </div>
      ) : (
        <div className="flex flex-col h-full w-full overflow-hidden relative">
          {/* Top Header Bar */}
          {isZenMode ? (
            <div
              className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
              onMouseEnter={handleTopBarMouseEnter}
              onMouseLeave={handleTopBarMouseLeave}
            >
              {/* Top hover sensor zone (slim 4px strip at the absolute top ceiling) */}
              <div
                className="h-1 w-full absolute top-0 left-0 pointer-events-auto cursor-pointer"
                onMouseEnter={handleSensorMouseEnter}
                onMouseLeave={handleSensorMouseLeave}
              />

              {/* Sliding TopBar Container */}
              <div
                className={`transform transition-transform duration-200 ease-out shadow-lg pointer-events-auto ${
                  isTopBarHovered ? 'translate-y-0' : '-translate-y-full'
                }`}
              >
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
                  isFullscreen={isFullscreen || isZenMode}
                  onToggleFullscreen={handleToggleFullscreen}
                  onOpenSyncModal={() => setIsGitSyncModalOpen(true)}
                  gitSyncStatus={gitSyncStatus}
                  onOpenComments={() => setIsCommentsDrawerOpen(true)}
                  openCommentsCount={openCommentsCount}
                  onOpenCollab={() => setIsCollabModalOpen(true)}
                  isCollabActive={!!collabSession}
                  collabPeersCount={collabPeersCount}
                  onCleanBuild={handleCleanBuild}
                  hasUpdate={!!updateInfo?.hasUpdate}
                  onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
                  onCheckForUpdates={() => handleCheckForUpdates(true, true)}
                  onShowToast={addToast}
                />
              </div>
            </div>
          ) : (
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
              isFullscreen={isFullscreen}
              onToggleFullscreen={handleToggleFullscreen}
              onOpenSyncModal={() => setIsGitSyncModalOpen(true)}
              gitSyncStatus={gitSyncStatus}
              onOpenComments={() => setIsCommentsDrawerOpen(true)}
              openCommentsCount={openCommentsCount}
              onOpenCollab={() => setIsCollabModalOpen(true)}
              isCollabActive={!!collabSession}
              collabPeersCount={collabPeersCount}
              onCleanBuild={handleCleanBuild}
              hasUpdate={!!updateInfo?.hasUpdate}
              onOpenUpdateModal={() => setIsUpdateModalOpen(true)}
              onCheckForUpdates={() => handleCheckForUpdates(true, true)}
              onShowToast={addToast}
            />
          )}

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

        {/* Full-screen transparent overlay during panel dragging to prevent Monaco/PDF text selection and dropped mouse events */}
        {isResizing && (
          <div className="fixed inset-0 z-50 cursor-col-resize select-none pointer-events-auto bg-transparent" />
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
                collapsible={false}
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
                  onRevealInExplorer={handleRevealInExplorer}
                  onShowToast={addToast}
                />
              </Panel>

              {/* Resize Handle between FileTree and Editor */}
              <PanelResizeHandle
                hitAreaMargins={{ coarse: 20, fine: 12 }}
                onDragging={setIsResizing}
                className="w-1.5 hover:w-2 bg-stone-200/50 dark:bg-stone-800/50 hover:bg-scholarly/40 dark:hover:bg-scholarly-dark/40 active:bg-scholarly dark:active:bg-scholarly-dark transition-all cursor-col-resize z-20 relative group before:content-[''] before:absolute before:inset-y-0 before:-left-2.5 before:-right-2.5 before:z-30"
              >
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
              minSize={20}
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
                    } else {
                      setLiveEquation(eq);
                      setLiveEquationPos(pos);
                      setLiveEquationDisplay(isDisplay ?? true);
                    }
                  }}
                  editorRefOut={monacoEditorRef}
                  getProjectContext={getProjectContext}
                  onJumpToPdf={handleJumpToPdf}
                  highlightLine={highlightLine}
                  commentLines={comments
                    .filter((c) => c.file === activeFilePath && c.status === 'open')
                    .map((c) => c.line)}
                  onOpenCommentAtCursor={(line, selectedText) => {
                    setCommentCursorLine(line);
                    setCommentSelectedText(selectedText);
                    setIsCommentsDrawerOpen(true);
                  }}
                  collabSession={collabSession ? { ...collabSession, filePath: activeFilePath } : null}
                  onCursorChange={setCursorPosition}
                />
              </div>
            </Panel>
          )}

          {/* Resize Handle between Editor and PDF with Overleaf-style SyncTeX divider pill */}
          {viewMode === 'split' && !pdfCollapsed && (
            <PanelResizeHandle
              hitAreaMargins={{ coarse: 24, fine: 14 }}
              onDragging={setIsResizing}
              className="w-1.5 hover:w-2 bg-stone-200/50 dark:bg-stone-800/50 hover:bg-scholarly/40 dark:hover:bg-scholarly-dark/40 active:bg-scholarly dark:active:bg-scholarly-dark transition-all cursor-col-resize z-20 relative group before:content-[''] before:absolute before:inset-y-0 before:-left-2.5 before:-right-2.5 before:z-30"
            >
              {/* Overleaf-Style Divider Control Pill */}
              <div className="absolute top-1/2 -translate-y-1/2 -left-3.5 z-40 flex flex-col items-center select-none">
                <div className="flex flex-col items-center bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-full shadow-md py-1 px-0.5 space-y-1 transition-all group-hover:border-scholarly dark:group-hover:border-scholarly-dark group-hover:shadow-lg">
                  {/* Jump to PDF button (SyncTeX Forward) */}
                  <button
                    type="button"
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJumpToPdf();
                    }}
                    title="Jump to Cursor in PDF (SyncTeX: Ctrl+Alt+J)"
                    className="w-6 h-6 rounded-full flex items-center justify-center text-stone-500 hover:text-scholarly dark:hover:text-scholarly-dark hover:bg-scholarly/10 dark:hover:bg-scholarly-dark/15 transition btn-tactile"
                  >
                    {isJumpingToPdf ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-scholarly dark:text-scholarly-dark" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-stone-600 dark:text-stone-300 group-hover:text-scholarly dark:group-hover:text-scholarly-dark" />
                    )}
                  </button>

                  {/* Tactile Grab Indicator */}
                  <div className="w-1 h-3 rounded-full bg-stone-300 dark:bg-stone-600 group-hover:bg-scholarly dark:group-hover:bg-scholarly-dark transition-colors" />
                </div>
              </div>
            </PanelResizeHandle>
          )}

          {/* Panel 3: PDF Viewer */}
          {viewMode !== 'code' && !pdfCollapsed && (
            <Panel
              ref={pdfPanelRef}
              id="pdf-panel"
              order={3}
              defaultSize={viewMode === 'pdf' ? 100 : 40}
              minSize={18}
              collapsible={false}
              className="h-full overflow-hidden"
            >
              <PDFViewer
                ref={pdfViewerRef}
                pdfUrl={pdfUrl}
                lastValidPdfUrl={lastValidPdfUrl}
                compileDuration={compileDuration}
                compileStatus={compileStatus}
                compileErrors={compileErrors}
                onApplyFix={handleApplyFix}
                onUndoFix={handleUndoFix}
                canUndoFix={canUndoFix}
                detectedMissingPackages={detectedMissingPackages}
                onApplyBatchFix={handleApplyBatchFix}
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

      {/* Runtime Observability & File Explorer Status Bar */}
      <StatusBar
        projectId={projectId}
        projectName={projectName}
        activeFilePath={activeFilePath}
        isCompiling={isCompiling}
        compileDuration={compileDuration}
        cursorLine={cursorPosition.line}
        cursorColumn={cursorPosition.column}
        isDoctorHealthy={isDoctorHealthy}
        onOpenDoctor={() => setIsDoctorOpen(true)}
        onShowToast={addToast}
      />
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
        onOpenSyncModal={() => setIsGitSyncModalOpen(true)}
        onShowToast={addToast}
      />

      {/* Git Remote Sync Modal */}
      <GitSyncModal
        isOpen={isGitSyncModalOpen}
        onClose={() => setIsGitSyncModalOpen(false)}
        projectId={projectId}
        onSyncSuccess={() => fetchGitSyncStatus(projectId)}
      />

      {/* Review Comments Drawer */}
      <CommentsDrawer
        isOpen={isCommentsDrawerOpen}
        onClose={() => setIsCommentsDrawerOpen(false)}
        projectId={projectId}
        activeFilePath={activeFilePath}
        cursorLine={commentCursorLine}
        selectedText={commentSelectedText}
        onJumpToLine={(file, line) => {
          if (file !== activeFilePath) {
            handleSelectFile(file);
          }
          setHighlightLine({ line, timestamp: Date.now() });
        }}
        onCommentsUpdated={(count) => {
          setOpenCommentsCount(count);
          fetchComments(projectId);
        }}
      />

      {/* Real-Time Peer-to-Peer Collaboration Modal */}
      <CollabModal
        isOpen={isCollabModalOpen}
        onClose={() => setIsCollabModalOpen(false)}
        projectId={projectId}
        projectName={projectName}
        roomCode={collabSession?.room || ''}
        isCollabActive={!!collabSession}
        onStartCollab={(room, name, color) => {
          setCollabSession({
            room,
            name,
            color,
            filePath: activeFilePath,
            onPeersChange: (count) => setCollabPeersCount(count),
            onRemoteCompile: (timestamp) => {
              if (projectId) {
                const freshUrl = `/api/projects/${projectId}/pdf?t=${timestamp}`;
                setPdfUrl(freshUrl);
                setLastValidPdfUrl(freshUrl);
                addToast('Document recompiled by collaborator. Preview updated.', 'info');
              }
            },
          });
          setIsCollabModalOpen(false);
          addToast(`Live collaboration started in room: ${room}`, 'success');
        }}
        onStopCollab={() => {
          leaveCollabSession();
          setCollabSession(null);
          setCollabPeersCount(0);
          setIsCollabModalOpen(false);
          addToast('Left live collaboration session.', 'info');
        }}
        connectedPeersCount={collabPeersCount}
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

      {/* Software Update Modal (Approaches 1 + 3) */}
      <UpdateModal
        isOpen={isUpdateModalOpen}
        onClose={() => setIsUpdateModalOpen(false)}
        updateInfo={updateInfo}
        onCheckAgain={() => handleCheckForUpdates(true, true)}
        isChecking={isCheckingUpdate}
      />

      {/* Toast Notifications (replaces window.alert) */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
};
