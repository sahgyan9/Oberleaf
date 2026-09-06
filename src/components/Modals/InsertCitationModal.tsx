import React, { useState, useEffect, useCallback } from 'react';
import {
  Quote,
  Search,
  Plus,
  X,
  BookOpen,
  Copy,
  Check,
  CheckCircle2,
  FileText,
  Loader2,
  Bookmark,
} from 'lucide-react';

export interface CitationItem {
  key: string;
  type: string;
  title: string;
  author: string;
  year: string;
  journal?: string;
  booktitle?: string;
  publisher?: string;
  volume?: string;
  pages?: string;
  raw?: string;
  bibFile?: string;
}

export interface InsertCitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  onInsert: (snippet: string) => void;
  onCitationAdded?: () => void;
}

export const InsertCitationModal: React.FC<InsertCitationModalProps> = ({
  isOpen,
  onClose,
  projectId,
  onInsert,
  onCitationAdded,
}) => {
  const [activeTab, setActiveTab] = useState<'browse' | 'add'>('browse');
  const [citations, setCitations] = useState<CitationItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Add Reference State
  const [addMode, setAddMode] = useState<'raw' | 'fields'>('raw');
  const [rawBibtex, setRawBibtex] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Structured fields state
  const [formType, setFormType] = useState<string>('article');
  const [formKey, setFormKey] = useState<string>('');
  const [formTitle, setFormTitle] = useState<string>('');
  const [formAuthor, setFormAuthor] = useState<string>('');
  const [formYear, setFormYear] = useState<string>(new Date().getFullYear().toString());
  const [formJournal, setFormJournal] = useState<string>('');
  const [formVolume, setFormVolume] = useState<string>('');
  const [formPages, setFormPages] = useState<string>('');

  // Load Citations from Project
  const loadCitations = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/citations`);
      if (res.ok) {
        const data: CitationItem[] = await res.json();
        setCitations(data);
      }
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen) {
      loadCitations();
      setSaveError(null);
      setSaveSuccess(null);
    }
  }, [isOpen, loadCitations]);

  // Handle Copy Key to Clipboard
  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Handle Add Citation
  const handleSaveCitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    let bibtexToSubmit = '';
    if (addMode === 'raw') {
      if (!rawBibtex.trim()) {
        setSaveError('Please enter valid BibTeX markup.');
        return;
      }
      bibtexToSubmit = rawBibtex.trim();
    } else {
      if (!formKey.trim() || !formTitle.trim()) {
        setSaveError('Citation Key and Title are required.');
        return;
      }
      bibtexToSubmit = `@${formType}{${formKey.trim()},
  title = {${formTitle.trim()}},
  author = {${formAuthor.trim()}},
  year = {${formYear.trim()}},
  ${formJournal ? `journal = {${formJournal.trim()}},` : ''}
  ${formVolume ? `volume = {${formVolume.trim()}},` : ''}
  ${formPages ? `pages = {${formPages.trim()}},` : ''}
}`;
    }

    setIsSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/citations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawBibtex: bibtexToSubmit }),
      });

      if (res.ok) {
        const data = await res.json();
        setSaveSuccess(`Added citation "${data.key}"!`);
        setRawBibtex('');
        setFormKey('');
        setFormTitle('');
        setFormAuthor('');
        setFormJournal('');
        await loadCitations();
        onCitationAdded?.();
        setTimeout(() => {
          setActiveTab('browse');
          setSaveSuccess(null);
        }, 1200);
      } else {
        const err = await res.json();
        setSaveError(err.error || 'Failed to parse and add citation.');
      }
    } catch (err: any) {
      setSaveError(err.message || 'Network error.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const filteredCitations = citations.filter((c) => {
    const q = searchQuery.toLowerCase();
    return (
      c.key.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.year.includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-2xl bg-surface-lightPanel dark:bg-surface-darkPanel border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="h-14 px-5 border-b border-surface-lightSubtle dark:border-surface-darkSubtle flex items-center justify-between bg-surface-light dark:bg-surface-dark flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-citation-subtle/80 dark:bg-citation-darkSubtle/40 border border-citation/20 flex items-center justify-center text-citation dark:text-citation-dark">
              <Quote className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-serif font-semibold text-stone-900 dark:text-stone-100 flex items-center space-x-2">
                <span>Citation & Bibliography Manager</span>
                <span className="text-[10px] font-sans font-medium px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-300 border border-surface-lightBorder dark:border-surface-darkBorder">
                  BibTeX
                </span>
              </h2>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                Browse project references, insert \cite commands, or add new papers
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 hover:bg-surface-lightSubtle dark:hover:bg-surface-darkSubtle transition btn-tactile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-surface-lightBorder dark:border-surface-darkBorder px-5 bg-surface-lightSubtle dark:bg-surface-darkSubtle text-xs flex-shrink-0">
          <button
            onClick={() => setActiveTab('browse')}
            className={`py-2.5 px-3 font-medium transition border-b-2 flex items-center space-x-1.5 btn-tactile ${
              activeTab === 'browse'
                ? 'border-scholarly dark:border-scholarly-dark text-scholarly dark:text-scholarly-dark font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Browse Citations ({citations.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('add')}
            className={`py-2.5 px-3 font-medium transition border-b-2 flex items-center space-x-1.5 btn-tactile ${
              activeTab === 'add'
                ? 'border-scholarly dark:border-scholarly-dark text-scholarly dark:text-scholarly-dark font-semibold'
                : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-stone-100'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Reference</span>
          </button>
        </div>

        {/* Tab 1: Browse Citations */}
        {activeTab === 'browse' && (
          <div className="flex-1 flex flex-col overflow-hidden p-5 space-y-4">
            {/* Search Input */}
            <div className="relative flex-shrink-0">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search citations by title, author, key, or year..."
                className="w-full pl-10 pr-4 py-2 rounded-lg text-xs bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark text-stone-900 dark:text-stone-100 placeholder:text-stone-400 transition"
              />
            </div>

            {/* Citations List */}
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {isLoading ? (
                <div className="h-40 flex items-center justify-center space-x-2 text-xs text-stone-400">
                  <Loader2 className="w-4 h-4 animate-spin text-scholarly-green dark:text-scholarly-greenDark" />
                  <span>Loading bibliography references...</span>
                </div>
              ) : filteredCitations.length === 0 ? (
                <div className="h-48 flex flex-col items-center justify-center text-stone-400 text-center p-6 space-y-2 border border-dashed border-surface-lightBorder dark:border-surface-darkBorder rounded-xl">
                  <Bookmark className="w-8 h-8 opacity-40 text-stone-500" />
                  <p className="text-xs font-medium text-stone-700 dark:text-stone-300">
                    {citations.length === 0
                      ? 'No citations in this project yet.'
                      : 'No citations match your search.'}
                  </p>
                  <p className="text-[11px] text-stone-400 max-w-sm">
                    Switch to the <span className="text-scholarly-green dark:text-scholarly-greenDark font-semibold">Add Reference</span> tab
                    to paste BibTeX markup from Google Scholar or arXiv.
                  </p>
                </div>
              ) : (
                filteredCitations.map((item) => (
                  <div
                    key={item.key}
                    className="p-3.5 rounded-xl bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder hover:border-scholarly-green/40 dark:hover:border-scholarly-greenDark/40 transition space-y-2 group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-scholarly-blue/10 dark:bg-scholarly-blue/20 text-scholarly-blue font-semibold">
                          {item.key}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400 uppercase font-semibold">
                          {item.type || 'article'}
                        </span>
                        {item.year && (
                          <span className="text-[10px] text-stone-400 font-mono">
                            ({item.year})
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleCopyKey(item.key)}
                        title="Copy Citation Key"
                        className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-400 hover:text-stone-200 transition"
                      >
                        {copiedKey === item.key ? (
                          <Check className="w-3.5 h-3.5 text-scholarly-green dark:text-scholarly-greenDark" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    <p className="text-xs font-medium text-stone-900 dark:text-stone-100 leading-snug">
                      {item.title || 'Untitled Reference'}
                    </p>

                    <div className="text-[11px] text-stone-500 dark:text-stone-400 flex flex-wrap gap-x-2">
                      <span>{item.author || 'Unknown Author'}</span>
                      {item.journal && <span>· <em>{item.journal}</em></span>}
                      {item.volume && <span>Vol. {item.volume}</span>}
                    </div>

                    {/* Quick Insertion Actions */}
                    <div className="flex items-center space-x-2 pt-1.5 border-t border-stone-200/60 dark:border-stone-800/80">
                      <button
                        onClick={() => {
                          onInsert(`\\cite{${item.key}}`);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-md bg-scholarly-green/10 hover:bg-scholarly-green/20 text-scholarly-green dark:text-scholarly-greenDark font-mono text-[11px] font-semibold transition"
                      >
                        \cite&#123;{item.key}&#125;
                      </button>
                      <button
                        onClick={() => {
                          onInsert(`\\citep{${item.key}}`);
                          onClose();
                        }}
                        className="px-2.5 py-1 rounded-md bg-scholarly-blue/10 hover:bg-scholarly-blue/20 text-scholarly-blue font-mono text-[11px] font-semibold transition"
                      >
                        \citep&#123;{item.key}&#125;
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 2: Add New Reference */}
        {activeTab === 'add' && (
          <form onSubmit={handleSaveCitation} className="flex-1 flex flex-col overflow-hidden p-5 space-y-4">
            {/* Mode Switcher */}
            <div className="flex items-center space-x-2 text-xs">
              <button
                type="button"
                onClick={() => setAddMode('raw')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  addMode === 'raw'
                    ? 'bg-scholarly-green dark:bg-scholarly-greenDark text-white font-semibold shadow-xs'
                    : 'bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                Paste BibTeX (Scholar / arXiv)
              </button>
              <button
                type="button"
                onClick={() => setAddMode('fields')}
                className={`px-3 py-1.5 rounded-lg font-medium transition ${
                  addMode === 'fields'
                    ? 'bg-scholarly-green dark:bg-scholarly-greenDark text-white font-semibold shadow-xs'
                    : 'bg-surface-lightSubtle dark:bg-surface-darkSubtle text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                }`}
              >
                Structured Form
              </button>
            </div>

            {/* Error or Success feedback */}
            {saveError && (
              <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-500 dark:text-rose-400 text-xs">
                {saveError}
              </div>
            )}
            {saveSuccess && (
              <div className="p-2.5 rounded-lg bg-scholarly-green/10 border border-scholarly-green/30 text-scholarly-green dark:text-scholarly-greenDark text-xs flex items-center space-x-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{saveSuccess}</span>
              </div>
            )}

            {/* Raw BibTeX Mode */}
            {addMode === 'raw' ? (
              <div className="flex-1 flex flex-col space-y-1.5 min-h-[160px]">
                <label className="text-xs font-semibold text-stone-700 dark:text-stone-300 flex items-center space-x-1.5">
                  <FileText className="w-3.5 h-3.5 text-scholarly-blue" />
                  <span>Raw BibTeX Markup</span>
                </label>
                <textarea
                  value={rawBibtex}
                  onChange={(e) => setRawBibtex(e.target.value)}
                  placeholder={`@article{einstein1905,\n  title={Zur Elektrodynamik bewegter K{\\"o}rper},\n  author={Einstein, Albert},\n  journal={Annalen der Physik},\n  volume={17},\n  pages={891--921},\n  year={1905}\n}`}
                  className="flex-1 p-3 rounded-lg font-mono text-xs bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark text-stone-900 dark:text-stone-100 placeholder:text-stone-400 leading-relaxed resize-none transition"
                />
              </div>
            ) : (
              /* Structured Form Mode */
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-700 dark:text-stone-300 font-medium mb-1">
                      Entry Type
                    </label>
                    <select
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full p-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark transition"
                    >
                      <option value="article">@article (Journal paper)</option>
                      <option value="book">@book (Textbook / Monograph)</option>
                      <option value="inproceedings">@inproceedings (Conference)</option>
                      <option value="misc">@misc (Preprint / Website)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-stone-700 dark:text-stone-300 font-medium mb-1">
                      Citation Key *
                    </label>
                    <input
                      type="text"
                      value={formKey}
                      onChange={(e) => setFormKey(e.target.value)}
                      placeholder="e.g. novoselov2004electric"
                      className="w-full p-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 font-mono text-xs focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-stone-700 dark:text-stone-300 font-medium mb-1">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="e.g. Electric field effect in atomically thin carbon films"
                    className="w-full p-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark transition"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label className="block text-stone-700 dark:text-stone-300 font-medium mb-1">
                      Author(s) (separated by "and")
                    </label>
                    <input
                      type="text"
                      value={formAuthor}
                      onChange={(e) => setFormAuthor(e.target.value)}
                      placeholder="e.g. Novoselov, K. S. and Geim, A. K."
                      className="w-full p-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark transition"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-700 dark:text-stone-300 font-medium mb-1">
                      Year
                    </label>
                    <input
                      type="text"
                      value={formYear}
                      onChange={(e) => setFormYear(e.target.value)}
                      placeholder="2024"
                      className="w-full p-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark font-mono transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-stone-700 dark:text-stone-300 font-medium mb-1">
                      Journal / Venue
                    </label>
                    <input
                      type="text"
                      value={formJournal}
                      onChange={(e) => setFormJournal(e.target.value)}
                      placeholder="e.g. Science"
                      className="w-full p-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark transition"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-700 dark:text-stone-300 font-medium mb-1">
                      Volume
                    </label>
                    <input
                      type="text"
                      value={formVolume}
                      onChange={(e) => setFormVolume(e.target.value)}
                      placeholder="e.g. 306"
                      className="w-full p-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark font-mono transition"
                    />
                  </div>

                  <div>
                    <label className="block text-stone-700 dark:text-stone-300 font-medium mb-1">
                      Pages
                    </label>
                    <input
                      type="text"
                      value={formPages}
                      onChange={(e) => setFormPages(e.target.value)}
                      placeholder="e.g. 666-669"
                      className="w-full p-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder text-stone-900 dark:text-stone-100 text-xs focus:outline-hidden focus:border-scholarly-green dark:focus:border-scholarly-greenDark font-mono transition"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Save Button Footer */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-surface-lightBorder dark:border-surface-darkBorder flex-shrink-0">
              <button
                type="button"
                onClick={() => setActiveTab('browse')}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-800 transition"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center space-x-1.5 px-4 py-1.5 rounded-lg bg-scholarly-green hover:bg-scholarly-greenDark active:scale-98 text-white font-semibold text-xs transition shadow-xs disabled:opacity-50 btn-tactile"
              >
                {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save to references.bib</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
