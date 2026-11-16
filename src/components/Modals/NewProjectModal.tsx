import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, FolderPlus, FileArchive, Upload, Search, Files, Loader2 } from 'lucide-react';
import { readSetting, writeSetting } from '../../utils/storage';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, template: string) => void;
  /**
   * Resolves true when the import succeeded and the modal can close, or with
   * the documents to choose from when the zip has several.
   */
  onImport: (name: string, file: File, mainFile?: string) => Promise<boolean | { candidates: string[] }>;
}

interface TemplateInfo {
  id: string;
  title: string;
  description: string;
  category: string;
  tags: string[];
  files: string[];
  hasPreview: boolean;
}

interface TemplateCatalog {
  categories: { id: string; title: string }[];
  templates: TemplateInfo[];
}

// Shown until the catalog arrives, and kept if the server cannot be reached,
// so the dialog can always create a project.
const FALLBACK_CATALOG: TemplateCatalog = {
  categories: [{ id: 'basics', title: 'Start simple' }],
  templates: [
    {
      id: 'blank',
      title: 'Blank document',
      description: 'Title, one section and one equation. The shortest document that compiles.',
      category: 'basics',
      tags: [],
      files: ['main.tex'],
      hasPreview: false,
    },
  ],
};

const projectNameFromZip = (fileName: string) =>
  fileName
    .replace(/\.zip$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();

const describeFiles = (files: string[]): string => {
  if (files.length <= 1) return 'Creates main.tex';
  const others = files.filter((f) => f !== 'main.tex');
  const folders = Array.from(new Set(others.filter((f) => f.includes('/')).map((f) => f.split('/')[0] + '/')));
  const loose = others.filter((f) => !f.includes('/'));
  return `Creates ${files.length} files: main.tex, ${[...loose, ...folders].join(', ')}`;
};

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  onImport,
}) => {
  const [name, setName] = useState('');
  // The name follows the chosen template until the user types one.
  const [nameEdited, setNameEdited] = useState(false);
  const [catalog, setCatalog] = useState<TemplateCatalog>(FALLBACK_CATALOG);
  const [isLoadingCatalog, setIsLoadingCatalog] = useState(false);
  const [template, setTemplate] = useState<string>(() => readSetting('last-template') || 'article');
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [mainCandidates, setMainCandidates] = useState<string[] | null>(null);
  const [chosenMain, setChosenMain] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoadingCatalog(true);
    fetch('/api/templates')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: TemplateCatalog) => {
        if (cancelled || !Array.isArray(data?.templates) || data.templates.length === 0) return;
        setCatalog(data);
        setTemplate((current) => (data.templates.some((t) => t.id === current) ? current : data.templates[0].id));
      })
      .catch(() => {
        // Keep the fallback: a blank document can still be created.
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const selected = catalog.templates.find((t) => t.id === template) ?? catalog.templates[0];

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.templates.filter((t) => {
      if (q) {
        return [t.title, t.description, ...t.tags].some((s) => s.toLowerCase().includes(q));
      }
      return category === 'all' || t.category === category;
    });
  }, [catalog, category, query]);

  if (!isOpen) return null;

  const clearZip = () => {
    setZipFile(null);
    setMainCandidates(null);
    setChosenMain('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const reset = () => {
    setName('');
    setNameEdited(false);
    setQuery('');
    clearZip();
  };

  const effectiveName = name.trim() || (zipFile ? '' : selected?.title ?? '');

  const create = (templateId: string) => {
    const t = catalog.templates.find((x) => x.id === templateId) ?? selected;
    const finalName = name.trim() || t.title;
    writeSetting('last-template', t.id);
    onCreate(finalName, t.id);
    reset();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isImporting) return;
    if (zipFile) {
      if (!name.trim() || (mainCandidates && !chosenMain)) return;
      setIsImporting(true);
      try {
        const result = await onImport(name.trim(), zipFile, chosenMain || undefined);
        if (result === true) {
          reset();
          onClose();
        } else if (result && typeof result === 'object') {
          setMainCandidates(result.candidates);
          setChosenMain('');
        }
      } finally {
        setIsImporting(false);
      }
      return;
    }
    create(template);
  };

  const handleZipChosen = (file: File | undefined) => {
    if (!file) return;
    setZipFile(file);
    setMainCandidates(null);
    setChosenMain('');
    if (!nameEdited || !name.trim()) setName(projectNameFromZip(file.name));
  };

  const categoryButton = (id: string, title: string, count: number) => {
    const active = !query.trim() && category === id;
    return (
      <button
        key={id}
        type="button"
        onClick={() => {
          setCategory(id);
          setQuery('');
        }}
        className={`flex-shrink-0 flex items-center justify-between gap-3 w-auto sm:w-full text-left px-2.5 py-1.5 rounded-md text-xs transition whitespace-nowrap ${
          active
            ? 'bg-scholarly-subtle dark:bg-scholarly-darkSubtle text-scholarly dark:text-scholarly-dark font-semibold'
            : 'text-stone-700 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle'
        }`}
      >
        <span>{title}</span>
        <span className="text-[11px] font-mono text-stone-400 dark:text-stone-500">{count}</span>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 font-sans"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
        aria-label="New project"
        className="bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder w-full max-w-4xl rounded-xl shadow-2xl flex flex-col h-[min(680px,92vh)] overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
          <div className="flex items-center gap-2 text-stone-900 dark:text-stone-100 font-serif font-semibold text-base min-w-0">
            <FolderPlus className="w-4 h-4 flex-shrink-0 text-scholarly dark:text-scholarly-dark" />
            <span className="truncate">New Project</span>
          </div>
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative w-40 sm:w-56">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search templates"
                aria-label="Search templates"
                className="w-full bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder rounded-md pl-8 pr-2 py-1.5 text-xs text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:border-scholarly dark:focus:border-scholarly-dark outline-none"
              />
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 flex-shrink-0 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col sm:flex-row">
          {/* Categories */}
          <nav
            aria-label="Template categories"
            className="flex sm:flex-col gap-1 sm:w-44 flex-shrink-0 p-2 sm:p-3 border-b sm:border-b-0 sm:border-r border-surface-lightBorder dark:border-surface-darkBorder overflow-x-auto sm:overflow-y-auto [scrollbar-width:thin]"
          >
            {categoryButton('all', 'All templates', catalog.templates.length)}
            {catalog.categories.map((c) =>
              categoryButton(c.id, c.title, catalog.templates.filter((t) => t.category === c.id).length)
            )}
            <div className="hidden sm:block flex-1" />
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip,application/zip"
              className="hidden"
              onChange={(e) => handleZipChosen(e.target.files?.[0])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Import a project from a .zip. From Overleaf: Menu, Download, Source."
              className="flex-shrink-0 flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-dashed border-stone-300 dark:border-stone-700 text-xs text-stone-700 dark:text-stone-300 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Import .zip</span>
            </button>
          </nav>

          {/* Gallery, or the chosen zip */}
          <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-3 sm:p-4">
            {zipFile ? (
              <div className="max-w-md mx-auto space-y-3 pt-2">
                <div className="flex items-center justify-between gap-3 p-3 rounded-lg border border-scholarly dark:border-scholarly-dark bg-scholarly-subtle/40 dark:bg-scholarly-darkSubtle/40">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-md bg-stone-100 dark:bg-stone-800 flex-shrink-0">
                      <FileArchive className="w-5 h-5 text-scholarly dark:text-scholarly-dark" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">{zipFile.name}</h4>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                        {zipFile.size < 1024 * 1024
                          ? `${Math.max(1, Math.round(zipFile.size / 1024))} KB`
                          : `${(zipFile.size / (1024 * 1024)).toFixed(1)} MB`}
                        . Every file in the zip is imported.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={clearZip}
                    className="p-1 flex-shrink-0 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 rounded btn-tactile"
                    aria-label="Remove zip and choose a template instead"
                    title="Remove zip and choose a template instead"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {mainCandidates && (
                  <fieldset className="p-3 rounded-lg border border-surface-lightBorder dark:border-surface-darkBorder">
                    <legend className="px-1 text-xs font-medium text-stone-700 dark:text-stone-300">
                      This zip has several documents. Choose the one to compile:
                    </legend>
                    <div className="space-y-1.5">
                      {mainCandidates.map((c) => (
                        <label key={c} className="flex items-center gap-2 text-xs text-stone-900 dark:text-stone-100 cursor-pointer">
                          <input
                            type="radio"
                            name="main-document"
                            value={c}
                            checked={chosenMain === c}
                            onChange={() => setChosenMain(c)}
                            className="accent-scholarly"
                          />
                          <span className="font-mono break-all">{c}</span>
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
                      It becomes main.tex. The other documents are imported unchanged.
                    </p>
                  </fieldset>
                )}
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  The class, bibliography and figure files come along with the document. To export from Overleaf: Menu, Download, Source.
                </p>
              </div>
            ) : visible.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-xs text-stone-500 dark:text-stone-400 gap-2">
                <p>No template matches "{query}".</p>
                <button type="button" onClick={() => setQuery('')} className="text-scholarly dark:text-scholarly-dark font-medium hover:underline">
                  Show all templates
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {visible.map((t) => {
                  const active = t.id === template;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTemplate(t.id)}
                      onDoubleClick={() => create(t.id)}
                      aria-pressed={active}
                      title={`${t.title}. Double-click to create.`}
                      className={`group text-left rounded-lg border overflow-hidden transition focus:outline-none focus-visible:ring-2 focus-visible:ring-scholarly/50 ${
                        active
                          ? 'border-scholarly dark:border-scholarly-dark ring-1 ring-scholarly dark:ring-scholarly-dark'
                          : 'border-surface-lightBorder dark:border-surface-darkBorder hover:border-stone-400 dark:hover:border-stone-500'
                      }`}
                    >
                      <div className="aspect-[4/3] bg-stone-200 dark:bg-stone-800 overflow-hidden border-b border-surface-lightBorder dark:border-surface-darkBorder">
                        {t.hasPreview ? (
                          <img
                            src={`/api/templates/${t.id}/preview`}
                            alt=""
                            loading="lazy"
                            draggable={false}
                            className="w-full h-full object-cover object-top bg-white"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-white text-stone-300">
                            <Files className="w-8 h-8" />
                          </div>
                        )}
                      </div>
                      <div className="p-2.5">
                        <h4 className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">{t.title}</h4>
                        <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400 mt-0.5 line-clamp-2">{t.description}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer: name and create */}
        <div className="flex flex-col sm:flex-row sm:items-end gap-3 px-5 py-3 border-t border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0 bg-surface-lightSubtle/60 dark:bg-surface-darkSubtle/40">
          <div className="flex-1 min-w-0">
            <label htmlFor="new-project-name" className="block text-[11px] font-medium text-stone-600 dark:text-stone-400 mb-1">
              Project name
            </label>
            <input
              id="new-project-name"
              ref={nameInputRef}
              type="text"
              placeholder={zipFile ? 'Name for the imported project' : selected?.title}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameEdited(true);
              }}
              spellCheck={false}
              autoFocus
              className="w-full bg-surface-lightPanel dark:bg-surface-darkPanel border border-surface-lightBorder dark:border-surface-darkBorder rounded-md px-2.5 py-1.5 text-sm text-stone-900 dark:text-stone-100 placeholder:text-stone-400 focus:border-scholarly dark:focus:border-scholarly-dark outline-none"
            />
            <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400 truncate">
              {zipFile
                ? 'Imports every file in the zip.'
                : isLoadingCatalog && catalog === FALLBACK_CATALOG
                  ? 'Loading templates...'
                  : selected
                    ? `${selected.title}. ${describeFiles(selected.files)}.`
                    : ''}
            </p>
          </div>
          <div className="flex items-center justify-end gap-2 flex-shrink-0 sm:pb-[22px]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-medium transition btn-tactile"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isImporting || !effectiveName || (!!zipFile && !!mainCandidates && !chosenMain)}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover dark:hover:bg-scholarly-darkHover text-white text-xs font-medium shadow-xs transition btn-tactile disabled:opacity-60"
            >
              {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {zipFile ? (isImporting ? 'Importing' : 'Import Project') : 'Create Project'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
