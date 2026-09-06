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
  Activity,
  User,
  CheckSquare,
  Square,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  FolderOpen,
  RefreshCw,
} from 'lucide-react';
import { ProjectInfo } from '../TopBar/TopBar';
import { useTheme } from '../../context/ThemeContext';

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
}

export const ProjectsDashboard: React.FC<ProjectsDashboardProps> = ({
  projects,
  onSelectProject,
  onNewProject,
  onRefreshProjects,
  onOpenDoctor,
  isDoctorHealthy,
}) => {
  const { theme, toggleTheme } = useTheme();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [sortField, setSortField] = useState<'title' | 'updatedAt'>('updatedAt');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals & Menu State
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [deleteConfirmProject, setDeleteConfirmProject] = useState<ExtendedProjectInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCloning, setIsCloning] = useState<string | null>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = () => setIsUserMenuOpen(false);
    if (isUserMenuOpen) {
      window.addEventListener('click', handleClickOutside);
      return () => window.removeEventListener('click', handleClickOutside);
    }
  }, [isUserMenuOpen]);

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
      } else {
        alert('Could not duplicate project.');
      }
    } catch (err: any) {
      alert(`Error duplicating: ${err.message}`);
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
        alert(data.error || 'PDF has not been compiled yet for this project.');
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
      } else {
        alert('Failed to delete project.');
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
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
    <div className="min-h-screen bg-surface-light dark:bg-surface-dark text-stone-900 dark:text-stone-100 flex flex-col select-none font-sans transition-colors">
      {/* 1. Header: Brand Logo & System Controls */}
      <nav className="h-14 bg-surface-lightPanel dark:bg-surface-darkPanel border-b border-surface-lightBorder dark:border-surface-darkBorder px-4 md:px-8 flex items-center justify-between z-30 sticky top-0 transition-colors">
        {/* Left: Official Brand Logo & Name */}
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
            <span className="text-[10px] uppercase font-bold tracking-widest text-scholarly-green dark:text-scholarly-greenDark bg-scholarly-green/10 dark:bg-scholarly-greenDark/15 px-1.5 py-0.5 rounded border border-scholarly-green/25 dark:border-scholarly-greenDark/30">
              Local Engine
            </span>
          </div>
        </div>

        {/* Right: Refresh, TeX Engine Health, Theme Toggle, User Avatar */}
        <div className="flex items-center space-x-2.5">
          {/* Refresh Projects Button */}
          <button
            onClick={handleRefresh}
            title="Refresh projects list"
            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800 border border-transparent hover:border-surface-lightBorder dark:hover:border-surface-darkBorder transition btn-tactile"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-scholarly-green dark:text-scholarly-greenDark' : ''}`} />
          </button>

          {/* Dependency Doctor Status */}
          <button
            onClick={onOpenDoctor}
            title={isDoctorHealthy ? 'Engine Healthy (Local TeX)' : 'Check TeX Engine Status'}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-700 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white hover:bg-stone-200 dark:hover:bg-stone-800 transition btn-tactile"
          >
            <Activity
              className={`w-3.5 h-3.5 ${
                isDoctorHealthy === true
                  ? 'text-scholarly-green dark:text-scholarly-greenDark'
                  : isDoctorHealthy === false
                  ? 'text-amber-500'
                  : 'text-stone-400'
              }`}
            />
            <span className="hidden sm:inline">Engine</span>
          </button>

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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-8 py-6 space-y-5">
        {/* Local-First Performance Banner */}
        <div className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-xl p-4 flex items-center justify-between shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-scholarly-green/10 dark:bg-scholarly-greenDark/20 text-scholarly-green dark:text-scholarly-greenDark flex items-center justify-center flex-shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-semibold text-stone-900 dark:text-stone-100">
                Local-First Scholarly Environment
              </p>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Unlimited compilation compute time • Zero cloud timeouts • Automated Git checkpoints & instant SyncTeX jump
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center space-x-2">
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-600 dark:text-stone-400 border border-surface-lightBorder dark:border-surface-darkBorder">
              Offline Fast Engine
            </span>
          </div>
        </div>

        {/* Title: All projects */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-baseline space-x-3">
            <h1 className="text-2xl font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">All projects</h1>
            <span className="text-xs text-stone-500 dark:text-stone-400 font-mono">({filteredProjects.length})</span>
          </div>
        </div>

        {/* Filter & Action Bar: Search Input & New Project Button */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
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

          {/* New Project Button */}
          <div className="flex items-center space-x-2">
            <button
              onClick={onNewProject}
              className="px-4 py-2 rounded-lg bg-scholarly-green hover:bg-scholarly-greenDark active:scale-98 text-white text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition btn-tactile cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New project</span>
            </button>
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
        <div className="border border-surface-lightBorder dark:border-surface-darkBorder rounded-xl overflow-hidden bg-surface-lightPanel dark:bg-surface-darkPanel shadow-xs">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-surface-lightBorder dark:border-surface-darkBorder bg-surface-lightSubtle dark:bg-surface-darkSubtle text-xs font-semibold text-stone-600 dark:text-stone-400 select-none">
                <th className="py-3 px-4 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    title="Select All"
                    className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition flex items-center justify-center"
                  >
                    {selectedProjectIds.length === filteredProjects.length && filteredProjects.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-scholarly-green dark:text-scholarly-greenDark" />
                    ) : (
                      <Square className="w-4 h-4" />
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
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-stone-900 dark:hover:text-white transition"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Title</span>
                    {sortField === 'title' ? (
                      sortDirection === 'asc' ? (
                        <ArrowUp className="w-3 h-3 text-scholarly-green dark:text-scholarly-greenDark" />
                      ) : (
                        <ArrowDown className="w-3 h-3 text-scholarly-green dark:text-scholarly-greenDark" />
                      )
                    ) : (
                      <ArrowUpDown className="w-3 h-3 opacity-30" />
                    )}
                  </div>
                </th>
                <th className="py-3 px-4 font-semibold hidden sm:table-cell w-28">Owner</th>
                <th
                  onClick={() => {
                    if (sortField === 'updatedAt') {
                      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
                    } else {
                      setSortField('updatedAt');
                      setSortDirection('desc');
                    }
                  }}
                  className="py-3 px-4 font-semibold cursor-pointer hover:text-stone-900 dark:hover:text-white transition w-44 md:w-56"
                >
                  <div className="flex items-center space-x-1.5">
                    <span>Last modified</span>
                    {sortField === 'updatedAt' ? (
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
                <th className="py-3 px-4 font-semibold text-right pr-6 w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-lightBorder dark:divide-surface-darkBorder text-xs">
              {filteredProjects.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-400">
                    <FolderOpen className="w-8 h-8 mx-auto text-stone-400 dark:text-stone-600 mb-2" />
                    <p className="text-sm font-serif font-medium text-stone-700 dark:text-stone-300">No projects found</p>
                    <p className="text-xs text-stone-500 mt-1">
                      {searchQuery ? 'Try adjusting your search query' : 'Create a new project to get started'}
                    </p>
                    <button
                      onClick={onNewProject}
                      className="mt-3 px-3.5 py-1.5 rounded-lg bg-scholarly-green hover:bg-scholarly-greenDark text-white text-xs font-semibold transition cursor-pointer btn-tactile shadow-xs"
                    >
                      + Create Project
                    </button>
                  </td>
                </tr>
              ) : (
                filteredProjects.map((project) => {
                  const isSelected = selectedProjectIds.includes(project.id);
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
                      <td className="py-3 px-4 text-center" onClick={(e) => toggleSelectOne(project.id, e)}>
                        <button className="text-stone-400 group-hover:text-stone-600 dark:group-hover:text-stone-200 transition flex items-center justify-center">
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-scholarly-green dark:text-scholarly-greenDark" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Title */}
                      <td className="py-3 px-4 font-serif font-medium text-stone-900 dark:text-stone-100 group-hover:text-scholarly-green dark:group-hover:text-scholarly-greenDark transition">
                        <span className="truncate max-w-[220px] md:max-w-md block">{project.name}</span>
                      </td>

                      {/* Owner */}
                      <td className="py-3 px-4 text-stone-600 dark:text-stone-400 hidden sm:table-cell">
                        {project.owner || 'You'}
                      </td>

                      {/* Last Modified */}
                      <td className="py-3 px-4 text-stone-500 dark:text-stone-400 font-mono text-[11px] truncate">
                        {project.lastModifiedRelative || 'Recently by You'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right pr-6" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1 text-stone-400">
                          {/* Duplicate / Clone */}
                          <button
                            onClick={(e) => handleDuplicate(project.id, e)}
                            title="Duplicate project"
                            disabled={isCloning === project.id}
                            className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-800 hover:text-stone-800 dark:hover:text-stone-200 transition btn-tactile"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          {/* Download Zip */}
                          <button
                            onClick={(e) => handleDownloadZip(project.id, e)}
                            title="Download project as .zip"
                            className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-800 hover:text-stone-800 dark:hover:text-stone-200 transition btn-tactile"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* Download PDF */}
                          <button
                            onClick={(e) => handleDownloadPdf(project, e)}
                            title="Download compiled PDF"
                            className="p-1.5 rounded-lg hover:bg-stone-200 dark:hover:bg-stone-800 hover:text-stone-800 dark:hover:text-stone-200 transition btn-tactile"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteConfirmProject(project);
                            }}
                            title="Delete project"
                            className="p-1.5 rounded-lg hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400 transition btn-tactile"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
