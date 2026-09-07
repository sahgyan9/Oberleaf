import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Plus,
  Copy,
  Download,
  FileText,
  Trash2,
  X,
  Sun,
  Moon,
  User,
  CheckSquare,
  Square,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  FolderOpen,
  RefreshCw,
  MonitorUp,
  Check,
  Loader2,
  ArrowDownToLine,
  ChevronRight,
  MoreHorizontal,
  ArrowRight,
} from 'lucide-react';
import { ProjectInfo } from '../TopBar/TopBar';
import { useTheme } from '../../context/ThemeContext';
import { PdfDocumentIcon } from '../Icons/PdfDocumentIcon';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

if (typeof window !== 'undefined' && pdfjsLib && pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;
}

const thumbnailCache = new Map<string, string>();

interface ExtendedProjectInfo extends ProjectInfo {
  lastModifiedRelative?: string;
  owner?: string;
  isArchived?: boolean;
  hasPdf?: boolean;
}

interface ProjectsDashboardProps {
  projects: ExtendedProjectInfo[];
  onSelectProject: (projectId: string) => void;
  onNewProject: () => void;
  onRefreshProjects: () => Promise<void>;
  onOpenDoctor: () => void;
  isDoctorHealthy: boolean | null;
  hasUpdate?: boolean;
  onOpenUpdateModal?: () => void;
  onCheckForUpdates?: () => void;
  onShowToast?: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

const DocumentMiniaturePreview: React.FC<{ project: ExtendedProjectInfo }> = ({ project }) => {
  const isCv = useMemo(() => {
    const n = project.name.toLowerCase();
    return n.includes('cv') || n.includes('resume') || project.template === 'cv';
  }, [project.name, project.template]);

  const [thumbUrl, setThumbUrl] = useState<string | null>(() => {
    if (!project.hasPdf) return null;
    return thumbnailCache.get(`${project.id}:${project.updatedAt}`) || null;
  });
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    if (!project.hasPdf) {
      setThumbUrl(null);
      return;
    }

    const cacheKey = `${project.id}:${project.updatedAt}`;
    const cached = thumbnailCache.get(cacheKey);
    if (cached) {
      setThumbUrl(cached);
      return;
    }

    let isMounted = true;
    let loadingTask: any = null;

    try {
      loadingTask = pdfjsLib.getDocument(`/api/projects/${project.id}/pdf`);
      loadingTask.promise
        .then(async (doc: any) => {
          if (!isMounted) return;
          const page = await doc.getPage(1);
          if (!isMounted) return;

          const viewport = page.getViewport({ scale: 1 });
          // Scale to 224px width (high-res 2x for retina sharpness in 112px box)
          const targetWidth = 224;
          const scale = targetWidth / viewport.width;
          const scaledViewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = Math.floor(scaledViewport.width);
          canvas.height = Math.floor(scaledViewport.height);
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const renderTask = page.render({
            canvasContext: ctx,
            viewport: scaledViewport,
          });
          await renderTask.promise;
          if (!isMounted) return;

          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          thumbnailCache.set(cacheKey, dataUrl);
          setThumbUrl(dataUrl);
        })
        .catch(() => {
          if (isMounted) setLoadFailed(true);
        });
    } catch {
      if (isMounted) setLoadFailed(true);
    }

    return () => {
      isMounted = false;
      loadingTask?.destroy?.();
    };
  }, [project.id, project.updatedAt, project.hasPdf]);

  if (thumbUrl && !loadFailed) {
    return (
      <div className="w-[112px] h-[146px] bg-white rounded-[3px] shadow-sm border border-stone-200/90 dark:border-stone-700/70 overflow-hidden select-none pointer-events-none group-hover:scale-[1.03] transition-transform duration-200 relative">
        <img
          src={thumbUrl}
          alt={`${project.name} preview`}
          className="w-full h-full object-cover object-top filter contrast-[1.03]"
        />
        {/* Subtle inner paper shadow & border */}
        <div className="absolute inset-0 pointer-events-none border border-black/5 dark:border-black/20 rounded-[3px] shadow-[inset_0_0_6px_rgba(0,0,0,0.05)]" />
      </div>
    );
  }

  return (
    <div className="w-[112px] h-[146px] bg-white dark:bg-[#19191C] rounded-[3px] shadow-sm border border-stone-200/90 dark:border-stone-700/70 p-2.5 flex flex-col justify-between select-none pointer-events-none group-hover:scale-[1.03] transition-transform duration-200">
      {isCv ? (
        <div className="space-y-1.5">
          {/* Header name & title skeleton */}
          <div className="text-center pb-1 border-b border-stone-200 dark:border-stone-800">
            <div className="font-serif font-bold text-[8.5px] text-stone-900 dark:text-stone-200 tracking-tight leading-none truncate px-0.5">
              {project.name.replace(/[-_]/g, ' ')}
            </div>
            <div className="w-12 h-1 bg-stone-300 dark:bg-stone-700 mx-auto rounded-full mt-1" />
          </div>

          {/* Section 1: Education */}
          <div className="space-y-0.5">
            <div className="flex items-center space-x-1">
              <span className="text-[6px] font-serif uppercase tracking-widest font-bold text-scholarly dark:text-scholarly-dark">
                EDUCATION
              </span>
              <div className="h-[0.5px] bg-stone-200 dark:bg-stone-800 flex-1" />
            </div>
            <div className="w-16 h-1 bg-stone-200 dark:bg-stone-800 rounded-full" />
            <div className="w-20 h-0.5 bg-stone-100 dark:bg-stone-800/60 rounded-full" />
          </div>

          {/* Section 2: Experience */}
          <div className="space-y-0.5">
            <div className="flex items-center space-x-1">
              <span className="text-[6px] font-serif uppercase tracking-widest font-bold text-scholarly dark:text-scholarly-dark">
                EXPERIENCE
              </span>
              <div className="h-[0.5px] bg-stone-200 dark:bg-stone-800 flex-1" />
            </div>
            <div className="w-18 h-1 bg-stone-200 dark:bg-stone-800 rounded-full" />
            <div className="w-22 h-0.5 bg-stone-100 dark:bg-stone-800/60 rounded-full" />
            <div className="w-14 h-0.5 bg-stone-100 dark:bg-stone-800/60 rounded-full" />
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="text-center pb-1">
            <div className="font-serif font-bold text-[8.5px] text-stone-900 dark:text-stone-200 tracking-tight leading-none truncate px-0.5">
              {project.name.replace(/[-_]/g, ' ')}
            </div>
            <div className="w-10 h-0.5 bg-stone-300 dark:bg-stone-700 mx-auto rounded-full mt-1" />
          </div>

          {/* Abstract box */}
          <div className="p-1 bg-stone-50 dark:bg-stone-900/80 rounded border border-stone-200/60 dark:border-stone-800/60 space-y-0.5">
            <div className="w-8 h-0.5 bg-stone-300 dark:bg-stone-600 rounded-full mx-auto" />
            <div className="w-full h-0.5 bg-stone-200 dark:bg-stone-700 rounded-full" />
            <div className="w-16 h-0.5 bg-stone-200 dark:bg-stone-700 rounded-full" />
          </div>

          {/* Two-column text simulation */}
          <div className="grid grid-cols-2 gap-1 pt-0.5">
            <div className="space-y-0.5">
              <div className="w-full h-0.5 bg-stone-200 dark:bg-stone-800 rounded-full" />
              <div className="w-8 h-0.5 bg-stone-200 dark:bg-stone-800 rounded-full" />
              <div className="w-10 h-0.5 bg-stone-200 dark:bg-stone-800 rounded-full" />
            </div>
            <div className="space-y-0.5">
              <div className="w-full h-0.5 bg-stone-200 dark:bg-stone-800 rounded-full" />
              <div className="w-9 h-0.5 bg-stone-200 dark:bg-stone-800 rounded-full" />
              <div className="w-7 h-0.5 bg-stone-200 dark:bg-stone-800 rounded-full" />
            </div>
          </div>
        </div>
      )}

      {/* Folio footer */}
      <div className="pt-1 border-t border-stone-100 dark:border-stone-800/60 flex justify-between items-center text-[5.5px] text-stone-400 font-mono">
        <span>Oberleaf</span>
        <span>1</span>
      </div>
    </div>
  );
};

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({
  projects,
  onSelectProject,
  onNewProject,
  onRefreshProjects,
  onOpenDoctor,
  isDoctorHealthy,
  hasUpdate = false,
  onOpenUpdateModal,
  onCheckForUpdates,
  onShowToast,
}) => {
  const { theme, toggleTheme } = useTheme();

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const recentProjects = useMemo(() => {
    return [...projects]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 3);
  }, [projects]);

  const notify = (msg: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
    if (onShowToast) {
      onShowToast(msg, type);
    } else {
      console.log(`[${type}] ${msg}`);
    }
  };

  const handleRevealInExplorer = async (projectId?: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch('/api/system/reveal-in-explorer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        notify(`Opened in File Explorer: ${data.path}`, 'info');
      } else {
        notify(data.error || 'Failed to open File Explorer.', 'error');
      }
    } catch (err: any) {
      notify(`Could not connect to local server: ${err.message}`, 'error');
    }
  };

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<'title' | 'updatedAt'>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals & Menu State
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [activeActionMenuId, setActiveActionMenuId] = useState<string | null>(null);
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<ExtendedProjectInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCloning, setIsCloning] = useState<string | null>(null);
  const [isAddingShortcut, setIsAddingShortcut] = useState(false);
  const [shortcutMessage, setShortcutMessage] = useState<string | null>(null);
  const [hasShortcut, setHasShortcut] = useState<boolean | null>(() => {
    const cached = localStorage.getItem('oberleaf_has_shortcut');
    return cached !== null ? cached === 'true' : null;
  });

  // Query shortcut status on system to conditionally hide the navbar button
  useEffect(() => {
    let isMounted = true;
    const checkShortcut = async () => {
      try {
        const res = await fetch('/api/system/shortcut-status');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.success) {
            setHasShortcut(!!data.exists);
            localStorage.setItem('oberleaf_has_shortcut', data.exists ? 'true' : 'false');
          }
        }
      } catch {
        // Silently preserve cached state if offline or during reload
      }
    };
    checkShortcut();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleAddShortcut = async () => {
    setIsAddingShortcut(true);
    setShortcutMessage(null);
    try {
      const res = await fetch('/api/system/create-shortcut', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setShortcutMessage('Shortcut Added!');
        notify('Shortcut added to Desktop and Start Menu.', 'success');
        localStorage.setItem('oberleaf_has_shortcut', 'true');
        setTimeout(() => {
          setHasShortcut(true);
          setShortcutMessage(null);
        }, 2500);
      } else {
        notify(data.error || 'Failed to create shortcut.', 'error');
      }
    } catch (err: any) {
      notify(`Could not connect to local server: ${err.message}`, 'error');
    } finally {
      setIsAddingShortcut(false);
    }
  };

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = () => {
      setIsUserMenuOpen(false);
      setActiveActionMenuId(null);
    };
    if (isUserMenuOpen || activeActionMenuId) {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  }, [isUserMenuOpen, activeActionMenuId]);

  // Project Sorting & Filtering
  const filteredProjects = useMemo(() => {
    let result = [...projects];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          (p.owner && p.owner.toLowerCase().includes(q))
      );
    }

    result.sort((a, b) => {
      if (sortField === 'title') {
        const comp = a.name.localeCompare(b.name);
        return sortDirection === 'asc' ? comp : -comp;
      } else {
        const timeA = new Date(a.updatedAt).getTime();
        const timeB = new Date(b.updatedAt).getTime();
        return sortDirection === 'asc' ? timeA - timeB : timeB - timeA;
      }
    });

    return result;
  }, [projects, searchQuery, sortField, sortDirection]);

  // Toggle selection
  const toggleSelectAll = () => {
    if (selectedProjectIds.length === filteredProjects.length) {
      setSelectedProjectIds([]);
    } else {
      setSelectedProjectIds(filteredProjects.map((p) => p.id));
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Action Handlers
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshProjects();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleDuplicate = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      setIsCloning(projectId);
      const res = await fetch(`/api/projects/${projectId}/clone`, { method: 'POST' });
      if (res.ok) {
        await onRefreshProjects();
        notify('Project duplicated successfully.', 'success');
      } else {
        notify('Could not duplicate project.', 'error');
      }
    } catch (err: any) {
      notify(`Error duplicating: ${err.message}`, 'error');
    } finally {
      setIsCloning(null);
    }
  };

  const handleDownloadZip = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    window.location.href = `/api/projects/${projectId}/zip`;
  };

  const handleDownloadPdf = async (project: ExtendedProjectInfo, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/projects/${project.id}/download-pdf`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        notify(data.error || 'PDF has not been compiled yet for this project.', 'warning');
        return;
      }
      let filename = `${project.id}.pdf`;
      const disposition = res.headers.get('content-disposition');
      if (disposition) {
        const match = disposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1]);
        }
      }
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 2000);
    } catch {
      window.location.href = `/api/projects/${project.id}/download-pdf`;
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirmProject) return;
    try {
      setIsDeleting(true);
      const res = await fetch(`/api/projects/${deleteConfirmProject.id}`, { method: 'DELETE' });
      if (res.ok) {
        await onRefreshProjects();
        setSelectedProjectIds((prev) => prev.filter((id) => id !== deleteConfirmProject.id));
        setDeleteConfirmProject(null);
        notify('Project deleted successfully.', 'info');
      } else {
        notify('Failed to delete project.', 'error');
      }
    } catch (err: any) {
      notify(`Error: ${err.message}`, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${selectedProjectIds.length} selected project(s)?`)) return;
    for (const id of selectedProjectIds) {
      try {
        await fetch(`/api/projects/${id}`, { method: 'DELETE' });
      } catch {}
    }
    setSelectedProjectIds([]);
    await onRefreshProjects();
  };

  return (
    <div className="min-h-full bg-surface-light dark:bg-surface-dark text-stone-900 dark:text-stone-100 flex flex-col select-none font-sans transition-colors pb-16">
      {/* 1. Header: Brand Logo & System Controls */}
      <nav className="h-14 bg-surface-lightPanel dark:bg-surface-darkPanel border-b border-surface-lightBorder dark:border-surface-darkBorder px-4 md:px-8 flex items-center justify-between z-30 sticky top-0 transition-colors">
        {/* Left: Official Brand Wordmark */}
        <div className="flex items-center space-x-3 cursor-pointer" onClick={handleRefresh}>
          <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center bg-surface-lightSubtle dark:bg-surface-darkSubtle p-0.5 border border-surface-lightBorder dark:border-surface-darkBorder shadow-xs flex-shrink-0">
            <img
              src="/assets/icon.svg?v=4"
              alt="Oberleaf Logo"
              width={32}
              height={32}
              className="w-full h-full object-contain"
            />
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="font-serif font-semibold text-lg tracking-tight text-[#1C1917] dark:text-[#F5F5F4]">
              Ober<span className="text-scholarly dark:text-scholarly-dark italic font-normal">leaf</span>
            </span>
            <span className="text-[10px] font-mono tracking-wider text-stone-500 dark:text-stone-400 bg-surface-lightSubtle dark:bg-surface-darkSubtle px-2 py-0.5 rounded border border-surface-lightBorder dark:border-surface-darkBorder">
              LOCAL ENGINE
            </span>
          </div>
        </div>

        {/* Right: Ambient Engine Status, Explorer, Shortcut, Theme, Profile */}
        <div className="flex items-center space-x-2">
          {/* Ambient Engine Health Status */}
          <button
            onClick={onOpenDoctor}
            title={isDoctorHealthy ? 'Local TeX Engine Healthy' : 'Check TeX Engine Status'}
            className="hidden md:flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white transition btn-tactile"
          >
            <span
              className={`w-2 h-2 rounded-full ${
                isDoctorHealthy === true
                  ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                  : isDoctorHealthy === false
                  ? 'bg-amber-500'
                  : 'bg-stone-400'
              }`}
            />
            <span className="font-sans font-medium text-[11px]">
              {isDoctorHealthy === true ? 'Engine Ready' : isDoctorHealthy === false ? 'Engine Issues' : 'Engine Ready'}
            </span>
            <span className="text-stone-400 dark:text-stone-500 text-[10px]">· Offline</span>
            <span className="text-stone-400 dark:text-stone-500 text-[10px]">· Git ✓</span>
          </button>

          {/* Quick Reveal in Explorer */}
          <button
            onClick={() => handleRevealInExplorer()}
            title="Open Oberleaf projects root directory in Windows File Explorer"
            className="hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white transition btn-tactile cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
            <span className="text-[11px]">Explorer</span>
          </button>

          {/* Refresh Projects Button */}
          <button
            onClick={handleRefresh}
            title="Refresh projects list"
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800 border border-transparent hover:border-surface-lightBorder dark:border-surface-darkBorder transition btn-tactile"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-scholarly-green dark:text-scholarly-greenDark' : ''}`} />
          </button>

          {/* Add Desktop Shortcut Button - only visible if shortcut hasn't been added yet */}
          {(!hasShortcut || isAddingShortcut || shortcutMessage) && (
            <button
              onClick={handleAddShortcut}
              disabled={isAddingShortcut}
              title="Add Oberleaf shortcut to Desktop & Start Menu"
              className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition btn-tactile ${
                shortcutMessage
                  ? 'bg-scholarly-green/15 text-scholarly-green dark:text-scholarly-greenDark border-scholarly-green/30'
                  : 'bg-surface-lightSubtle dark:bg-surface-darkSubtle border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200 dark:hover:bg-stone-800'
              }`}
            >
              {isAddingShortcut ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-scholarly-green dark:text-scholarly-greenDark" />
              ) : shortcutMessage ? (
                <Check className="w-3.5 h-3.5 text-scholarly-green dark:text-scholarly-greenDark" />
              ) : (
                <MonitorUp className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
              )}
              <span className="hidden sm:inline text-[11px]">{shortcutMessage || 'Add Shortcut'}</span>
            </button>
          )}

          {/* Update Available Badge */}
          {hasUpdate && onOpenUpdateModal && (
            <button
              onClick={onOpenUpdateModal}
              title="A new Oberleaf update is available! Click to view details and install."
              className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-xs font-semibold animate-pulse hover:bg-emerald-500/25 transition btn-tactile cursor-pointer"
            >
              <ArrowDownToLine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline text-[11px]">Update</span>
            </button>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800 border border-surface-lightBorder dark:border-surface-darkBorder transition btn-tactile"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-scholarly-blue" />}
          </button>

          {/* User Profile Avatar */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsUserMenuOpen((prev) => !prev);
              }}
              className="w-8 h-8 rounded-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-center text-stone-600 dark:text-stone-300 hover:ring-2 hover:ring-scholarly-green/40 transition btn-tactile"
            >
              <User className="w-4 h-4" />
            </button>

            {isUserMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-2 w-52 rounded-xl bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder shadow-2xl p-2 text-xs text-stone-800 dark:text-stone-200 z-50 animate-in fade-in zoom-in-95 duration-100"
              >
                <div className="px-3 py-2 border-b border-surface-lightBorder dark:border-surface-darkBorder">
                  <div className="font-semibold text-stone-900 dark:text-stone-100 font-serif">Local Workspace</div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 font-mono">Offline-First TeX Engine</div>
                </div>
                <div className="py-1 space-y-0.5">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleAddShortcut();
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition flex items-center justify-between"
                  >
                    <span>{hasShortcut ? 'Recreate Desktop Shortcut' : 'Add Desktop Shortcut'}</span>
                    <MonitorUp className="w-3.5 h-3.5 text-stone-400" />
                  </button>
                  {onCheckForUpdates && (
                    <button
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        onCheckForUpdates();
                      }}
                      className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition flex items-center justify-between"
                    >
                      <span>Check for Updates</span>
                      {hasUpdate ? (
                        <span className="px-1.5 py-0.2 rounded bg-emerald-500 text-white text-[10px] font-bold">New</span>
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-stone-400" />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      onOpenDoctor();
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
                  >
                    Check TeX Doctor
                  </button>
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      handleRefresh();
                    }}
                    className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition"
                  >
                    Reload Projects
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* 2. Main Projects Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-7 space-y-6">
        {/* Workspace Hero Greeting & Quiet System Strip */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                {greeting}
              </h1>
              <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 font-sans mt-0.5">
                Your research workspace — a quiet place for serious documents.
              </p>
            </div>
          </div>

          {/* Compact System Status Strip (Replacing the bulky marketing banner) */}
          <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-xl px-4 py-3 flex items-center justify-between shadow-xs">
            <div className="flex items-center space-x-3">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] flex-shrink-0" />
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs">
                <span className="font-serif font-semibold text-stone-900 dark:text-stone-100">
                  Local TeX Engine
                </span>
                <span className="text-stone-300 dark:text-stone-600 hidden sm:inline">·</span>
                <span className="text-stone-600 dark:text-stone-400">
                  Offline ready
                </span>
                <span className="text-stone-300 dark:text-stone-600 hidden sm:inline">·</span>
                <span className="text-stone-600 dark:text-stone-400">
                  Zero cloud timeouts
                </span>
                <span className="text-stone-300 dark:text-stone-600 hidden sm:inline">·</span>
                <span className="text-stone-600 dark:text-stone-400">
                  Git checkpoints active
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleRevealInExplorer()}
                className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-300 border border-surface-lightBorder dark:border-surface-darkBorder text-xs font-medium transition cursor-pointer btn-tactile"
                title="Open Oberleaf projects folder in File Explorer"
              >
                <FolderOpen className="w-3.5 h-3.5 text-stone-500 dark:text-stone-400" />
                <span className="hidden sm:inline">Open Explorer</span>
                <ChevronRight className="w-3 h-3 text-stone-400" />
              </button>
            </div>
          </div>
        </div>

        {/* Recent Projects Shelf */}
        {recentProjects.length > 0 && (
          <section className="space-y-4 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-baseline space-x-2.5">
                <h2 className="text-xl font-serif font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                  Recent projects
                </h2>
                <span className="text-xs text-stone-400 dark:text-stone-500 font-mono">
                  {recentProjects.length} active
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={onNewProject}
                  className="px-3.5 py-1.5 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder hover:bg-stone-200/60 dark:hover:bg-stone-800 text-stone-700 dark:text-stone-200 text-xs font-semibold flex items-center space-x-1.5 transition btn-tactile cursor-pointer"
                  title="Create a new CV from the default template"
                >
                  <FileText className="w-3.5 h-3.5 text-scholarly-green dark:text-scholarly-greenDark" />
                  <span>New CV</span>
                </button>
                <button
                  onClick={onNewProject}
                  className="px-4 py-1.5 rounded-lg bg-scholarly-green hover:bg-scholarly-greenDark active:scale-98 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition btn-tactile cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>New project</span>
                </button>
              </div>
            </div>

            {/* Recent Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentProjects.map((project) => (
                <div
                  key={project.id}
                  onClick={() => onSelectProject(project.id)}
                  className="group bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder hover:border-scholarly-green/60 dark:hover:border-scholarly-greenDark/60 rounded-xl overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col justify-between btn-tactile"
                >
                  {/* Upper Preview Area: Tactile Paper Stage */}
                  <div className="h-44 bg-surface-lightSubtle dark:bg-surface-darkSubtle flex items-center justify-center p-3 relative overflow-hidden border-b border-surface-lightBorder/80 dark:border-surface-darkBorder/80 group-hover:bg-stone-200/40 dark:group-hover:bg-stone-800/40 transition-colors">
                    {/* Status Badge */}
                    <div className="absolute top-2.5 right-2.5 z-10">
                      {project.hasPdf ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-mono font-medium flex items-center space-x-1 shadow-2xs">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <span>PDF Ready</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-stone-200/70 dark:bg-stone-800 text-stone-600 dark:text-stone-400 border border-surface-lightBorder dark:border-surface-darkBorder text-[10px] font-mono">
                          LaTeX
                        </span>
                      )}
                    </div>

                    {/* Tactile Document Paper */}
                    <DocumentMiniaturePreview project={project} />
                  </div>

                  {/* Lower Card Details & Action */}
                  <div className="p-4 flex flex-col justify-between flex-1 space-y-3 bg-surface-lightPanel dark:bg-surface-darkPanel">
                    <div>
                      <h3 className="font-serif font-medium text-[15px] text-stone-900 dark:text-stone-100 group-hover:text-scholarly-green dark:group-hover:text-scholarly-greenDark transition-colors truncate">
                        {project.name}
                      </h3>
                      <p className="text-xs text-stone-500 dark:text-stone-400 font-mono mt-1">
                        {project.lastModifiedRelative || 'Recently updated'}
                      </p>
                    </div>

                    <div className="pt-2.5 border-t border-surface-lightBorder/70 dark:border-surface-darkBorder/70 flex items-center justify-between text-xs">
                      <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500 capitalize">
                        {project.template || 'document'}
                      </span>
                      <span className="font-semibold text-scholarly-green dark:text-scholarly-greenDark inline-flex items-center space-x-1 group-hover:translate-x-0.5 transition-transform">
                        <span>Open project</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* All Projects Section Header with Search Bar */}
        <div className="pt-4 border-t border-surface-lightBorder/80 dark:border-surface-darkBorder/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-baseline space-x-2.5">
              <h2 className="text-xl font-serif font-semibold text-stone-900 dark:text-stone-100 tracking-tight">
                All projects
              </h2>
              <span className="text-xs text-stone-400 dark:text-stone-500 font-mono">
                ({filteredProjects.length})
              </span>
            </div>

            {/* Search Box */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in all projects..."
                className="w-full pl-9 pr-8 py-2 rounded-lg bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 text-xs placeholder-stone-400 focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark transition"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Bulk Action Toolbar (when rows are selected) */}
        {selectedProjectIds.length > 0 && (
          <div className="p-3 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder flex items-center justify-between text-xs animate-in fade-in duration-150">
            <div className="flex items-center space-x-2 font-medium text-stone-700 dark:text-stone-300">
              <span className="w-2 h-2 rounded-full bg-scholarly-green dark:bg-scholarly-greenDark inline-block" />
              <span>
                {selectedProjectIds.length} {selectedProjectIds.length === 1 ? 'project' : 'projects'} selected
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleBulkDelete}
                className="px-3 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition flex items-center space-x-1 btn-tactile"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete Selected</span>
              </button>
              <button
                onClick={() => setSelectedProjectIds([])}
                className="px-2.5 py-1 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-white"
              >
                Deselect All
              </button>
            </div>
          </div>
        )}

        {/* 3. Projects Table */}
        <div className="border border-surface-lightBorder dark:border-surface-darkBorder rounded-xl overflow-x-auto bg-surface-lightPanel dark:bg-surface-darkPanel shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightSubtle dark:bg-surface-darkSubtle text-[13px] font-semibold text-stone-600 dark:text-stone-400 select-none">
                <th className="py-3.5 px-4 w-12 text-center">
                  <button
                    onClick={toggleSelectAll}
                    title="Select All"
                    className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition flex items-center justify-center mx-auto"
                  >
                    {selectedProjectIds.length === filteredProjects.length && filteredProjects.length > 0 ? (
                      <CheckSquare className="w-4.5 h-4.5 text-scholarly-green dark:text-scholarly-greenDark" />
                    ) : (
                      <Square className="w-4.5 h-4.5" />
                    )}
                  </button>
                </th>
                <th
                  onClick={() => {
                    if (sortField === 'title') {
                      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortField('title');
                      setSortDirection('asc');
                    }
                  }}
                  className="py-3.5 px-4 font-semibold cursor-pointer hover:text-stone-900 dark:hover:text-white transition"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Title</span>
                    {sortField === 'title' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3.5 h-3.5 text-scholarly-green dark:text-scholarly-greenDark" />
                      ) : (
                        <ArrowDown className="w-3.5 h-3.5 text-scholarly-green dark:text-scholarly-greenDark" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="py-3.5 px-4 font-semibold hidden sm:table-cell w-32">Owner</th>
                <th
                  onClick={() => {
                    if (sortField === 'updatedAt') {
                      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortField('updatedAt');
                      setSortDirection('desc');
                    }
                  }}
                  className="py-3.5 px-4 font-semibold cursor-pointer hover:text-stone-900 dark:hover:text-white transition w-48 md:w-60"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Last modified</span>
                    {sortField === 'updatedAt' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-4 h-4 text-scholarly-green dark:text-scholarly-greenDark" />
                      ) : (
                        <ArrowDown className="w-4 h-4 text-scholarly-green dark:text-scholarly-greenDark" />
                      )
                    ) : (
                      <ArrowUpDown className="w-4 h-4 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="py-3.5 px-4 font-semibold text-right pr-6 w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-lightBorder dark:divide-surface-darkBorder text-sm">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-14 text-center text-stone-400">
                    <FolderOpen className="w-10 h-10 mx-auto text-stone-400 dark:text-stone-600 mb-3" />
                    <p className="text-base font-serif font-medium text-stone-700 dark:text-stone-300">No projects yet</p>
                    <p className="text-xs text-stone-500 mt-1">
                      {searchQuery ? 'Try adjusting your search query' : 'Create your CV from the clean default template or start a new project'}
                    </p>
                    <div className="mt-4 flex items-center justify-center space-x-2">
                      <button
                        onClick={onNewProject}
                        className="px-4 py-2 rounded-lg bg-scholarly-green hover:bg-scholarly-greenDark text-white text-xs font-semibold transition cursor-pointer btn-tactile shadow-xs flex items-center space-x-1.5"
                      >
                        <FileText className="w-4 h-4" />
                        <span>Create New CV</span>
                      </button>
                      <button
                        onClick={onNewProject}
                        className="px-3.5 py-2 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle text-stone-700 dark:text-stone-300 text-xs font-medium transition cursor-pointer btn-tactile"
                      >
                        <span>New Project</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project, index) => {
                  const isSelected = selectedProjectIds.includes(project.id);
                  const isNearBottom = index >= filteredProjects.length - 2 && filteredProjects.length > 3;
                  return (
                    <tr
                      key={project.id}
                      onClick={() => onSelectProject(project.id)}
                      className={`group transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-scholarly-green/10 dark:bg-scholarly-greenDark/15'
                          : 'hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3.5 px-4 text-center" onClick={(e) => toggleSelectOne(project.id, e)}>
                        <button className="text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-200 transition flex items-center justify-center mx-auto">
                          {isSelected ? (
                            <CheckSquare className="w-4.5 h-4.5 text-scholarly-green dark:text-scholarly-greenDark" />
                          ) : (
                            <Square className="w-4.5 h-4.5" />
                          )}
                        </button>
                      </td>

                      {/* Title */}
                      <td className="py-3.5 px-4 font-serif font-medium text-[15px] text-stone-900 dark:text-stone-100 group-hover:text-scholarly-green dark:group-hover:text-scholarly-greenDark transition">
                        <span className="truncate max-w-[240px] md:max-w-md block">{project.name}</span>
                      </td>

                      {/* Owner */}
                      <td className="py-3.5 px-4 text-stone-600 dark:text-stone-300 text-xs hidden sm:table-cell">
                        {project.owner || 'You'}
                      </td>

                      {/* Last Modified */}
                      <td className="py-3.5 px-4 text-stone-500 dark:text-stone-400 font-mono text-xs truncate">
                        {project.lastModifiedRelative || 'Recently by You'}
                      </td>

                      {/* Actions Column with Hover Disclosure & Menu */}
                      <td className="py-3.5 px-4 text-right pr-6 relative" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-2">
                          {/* Quick "Open" action on hover */}
                          <button
                            onClick={() => onSelectProject(project.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 hidden md:inline-flex items-center space-x-1 text-xs font-semibold text-scholarly-green dark:text-scholarly-greenDark hover:underline cursor-pointer"
                          >
                            <span>Open</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>

                          {/* Unified ⋯ Action Menu */}
                          <div className="relative inline-block text-left">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveActionMenuId((prev) => (prev === project.id ? null : project.id));
                              }}
                              title="Project options"
                              className={`p-1.5 rounded-lg border transition btn-tactile cursor-pointer ${
                                activeActionMenuId === project.id
                                  ? 'bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-900 dark:text-white border-surface-lightBorder dark:border-surface-darkBorder'
                                  : 'text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-stone-200/60 dark:hover:bg-stone-800 border-transparent'
                              }`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>

                            {/* Dropdown Menu */}
                            {activeActionMenuId === project.id && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className={`absolute right-0 ${
                                  isNearBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'
                                } w-56 rounded-xl bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder shadow-2xl p-1.5 text-xs text-stone-800 dark:text-stone-200 z-50 animate-in fade-in zoom-in-95 duration-100 space-y-0.5 text-left`}
                              >
                                <button
                                  onClick={() => {
                                    setActiveActionMenuId(null);
                                    onSelectProject(project.id);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition flex items-center space-x-2.5 font-medium text-stone-900 dark:text-stone-100"
                                >
                                  <ArrowRight className="w-4 h-4 text-scholarly-green dark:text-scholarly-greenDark" />
                                  <span>Open project</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    setActiveActionMenuId(null);
                                    handleRevealInExplorer(project.id, e);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition flex items-center space-x-2.5"
                                >
                                  <FolderOpen className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                                  <span>Reveal in Explorer</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    setActiveActionMenuId(null);
                                    handleDuplicate(project.id, e);
                                  }}
                                  disabled={isCloning === project.id}
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition flex items-center space-x-2.5"
                                >
                                  <Copy className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                                  <span>{isCloning === project.id ? 'Duplicating...' : 'Duplicate project'}</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    setActiveActionMenuId(null);
                                    handleDownloadPdf(project, e);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition flex items-center space-x-2.5"
                                >
                                  <PdfDocumentIcon className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                                  <span>Download PDF</span>
                                </button>

                                <button
                                  onClick={(e) => {
                                    setActiveActionMenuId(null);
                                    handleDownloadZip(project.id, e);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition flex items-center space-x-2.5"
                                >
                                  <Download className="w-4 h-4 text-stone-500 dark:text-stone-400" />
                                  <span>Download source (.zip)</span>
                                </button>

                                <div className="h-[1px] bg-surface-lightBorder dark:bg-surface-darkBorder my-1" />

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveActionMenuId(null);
                                    setDeleteConfirmProject(project);
                                  }}
                                  className="w-full text-left px-3 py-2 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 dark:hover:bg-rose-500/20 transition flex items-center space-x-2.5"
                                >
                                  <Trash2 className="w-4 h-4" />
                                  <span>Delete project</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Delete Confirmation Modal */}
      {deleteConfirmProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-rose-500/30 rounded-xl shadow-2xl max-w-md w-full p-6 text-stone-900 dark:text-stone-100">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-rose-500/15 text-rose-500 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-serif font-semibold text-stone-900 dark:text-stone-100 text-base">Delete Project?</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">This action cannot be undone</p>
              </div>
            </div>

            <p className="text-xs text-stone-600 dark:text-stone-300 mb-6 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <span className="font-semibold text-stone-900 dark:text-stone-100">{deleteConfirmProject.name}</span> and all of its files and
              history?
            </p>

            <div className="flex justify-end space-x-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmProject(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 text-xs font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition flex items-center space-x-1.5 shadow-xs btn-tactile"
              >
                {isDeleting ? 'Deleting...' : 'Delete Project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
