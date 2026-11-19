import React, { useEffect, useRef, useState } from 'react';
import { Search, Loader2, Check, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';
import type { CitationItem } from './InsertCitationModal';

interface LookupEntry {
  kind: 'entry';
  source: 'doi' | 'arxiv';
  bibtex: string;
  key: string;
  title: string;
  authors: string;
  year: string;
  venue: string;
  doi?: string;
}

interface LookupCandidate {
  title: string;
  authors: string;
  year: string;
  venue: string;
  /** The DOI or arXiv:<id> that resolves to this paper */
  lookup: string;
}

interface CitationLookupProps {
  projectId: string;
  /** What the project's .bib files already hold, to avoid adding a paper twice */
  citations: CitationItem[];
  onInsert: (snippet: string) => void;
  onAdded: () => void | Promise<void>;
  onClose: () => void;
}

const normalise = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** The entry already in the bibliography for this paper, if there is one. */
function findExisting(entry: LookupEntry, citations: CitationItem[]): CitationItem | undefined {
  const doi = normalise(entry.doi);
  const title = normalise(entry.title);
  return citations.find(
    (c) => (doi && normalise(c.doi) === doi) || (title.length > 12 && normalise(c.title) === title)
  );
}

/** A key no other entry uses: smith2020growth, then smith2020growthb, ... */
function uniqueKey(key: string, citations: CitationItem[]): string {
  const taken = new Set(citations.map((c) => c.key));
  if (!taken.has(key)) return key;
  for (const suffix of 'bcdefghijklmnopqrstuvwxyz') {
    if (!taken.has(key + suffix)) return key + suffix;
  }
  return `${key}${Date.now() % 1000}`;
}

export const CitationLookup: React.FC<CitationLookupProps> = ({ projectId, citations, onInsert, onAdded, onClose }) => {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entry, setEntry] = useState<LookupEntry | null>(null);
  const [candidates, setCandidates] = useState<LookupCandidate[] | null>(null);
  const [showBibtex, setShowBibtex] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const lookup = async (text: string) => {
    const q = text.trim();
    if (!q) return;
    const request = ++requestRef.current;
    setIsSearching(true);
    setError(null);
    setEntry(null);
    setCandidates(null);
    setAdded(null);
    setShowBibtex(false);
    try {
      const res = await fetch(`/api/citations/lookup?q=${encodeURIComponent(q)}`);
      const data = await res.json().catch(() => ({}));
      if (request !== requestRef.current) return;
      if (!res.ok) {
        setError(data.error || `The lookup failed (${res.status}).`);
      } else if (data.kind === 'entry') {
        setEntry(data);
      } else if (Array.isArray(data.items) && data.items.length > 0) {
        setCandidates(data.items);
      } else {
        setError('Nothing found. Try the DOI, or fewer and more distinctive title words.');
      }
    } catch {
      if (request === requestRef.current) setError('Could not reach the Oberleaf server.');
    } finally {
      if (request === requestRef.current) setIsSearching(false);
    }
  };

  const existing = entry ? findExisting(entry, citations) : undefined;

  const addEntry = async (alsoCite: boolean) => {
    if (!entry) return;
    setIsSaving(true);
    setError(null);
    try {
      const key = uniqueKey(entry.key, citations);
      const bibtex = key === entry.key ? entry.bibtex : entry.bibtex.replace(`{${entry.key},`, `{${key},`);
      // Add to the bibliography the project already uses, when it has one at the top level.
      const rootBib = citations.map((c) => c.bibFile).find((f) => f && !f.includes('/'));
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/citations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawBibtex: bibtex, bibFile: rootBib || 'references.bib' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Could not write the entry to the bibliography.');
        return;
      }
      await onAdded();
      if (alsoCite) {
        onInsert(`\\cite{${key}}`);
        onClose();
      } else {
        setAdded(`Added as ${key} to ${rootBib || 'references.bib'}.`);
        setEntry(null);
        setQuery('');
        inputRef.current?.focus();
      }
    } catch {
      setError('Could not reach the Oberleaf server.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-5 gap-3 text-xs">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          lookup(query);
        }}
        className="flex items-center gap-2 flex-shrink-0"
      >
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="DOI, arXiv ID, link, or paper title"
            aria-label="DOI, arXiv ID, link, or paper title"
            spellCheck={false}
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder focus:outline-hidden focus:border-scholarly dark:focus:border-scholarly-dark text-stone-900 dark:text-stone-100 placeholder:text-stone-400 transition"
          />
        </div>
        <button
          type="submit"
          disabled={isSearching || !query.trim()}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover dark:hover:bg-scholarly-darkHover text-white font-semibold transition disabled:opacity-50 btn-tactile"
        >
          {isSearching && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          Look Up
        </button>
      </form>

      <p className="text-[11px] text-stone-500 dark:text-stone-400 flex-shrink-0">
        Examples: <span className="font-mono">10.1038/nature14539</span>, <span className="font-mono">arXiv:1706.03762</span>, or a
        few words of the title. The text you type is sent to doi.org, arXiv or Crossref; nothing else leaves this computer.
      </p>

      <div className="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1">
        {error && (
          <div role="alert" className="flex items-start gap-2 p-2.5 rounded-lg bg-crimson-subtle dark:bg-crimson-darkSubtle/60 border border-crimson/30 text-crimson dark:text-crimson-dark">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {added && (
          <div role="status" className="flex items-center gap-2 p-2.5 rounded-lg bg-scholarly-subtle dark:bg-scholarly-darkSubtle border border-scholarly/30 text-scholarly dark:text-scholarly-dark">
            <Check className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{added}</span>
          </div>
        )}

        {entry && (
          <div className="p-3.5 rounded-xl bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder space-y-2">
            <p className="text-sm font-medium leading-snug text-stone-900 dark:text-stone-100">{entry.title || 'Untitled'}</p>
            <p className="text-[11px] text-stone-600 dark:text-stone-400">
              {[entry.authors.replace(/ and /g, '; '), entry.venue && `${entry.venue}`, entry.year].filter(Boolean).join(' · ')}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-stone-500 dark:text-stone-400">
              <span className="font-mono px-1.5 py-0.5 rounded bg-citation-subtle dark:bg-citation-darkSubtle text-citation dark:text-citation-dark">
                {existing ? existing.key : uniqueKey(entry.key, citations)}
              </span>
              <span>{entry.source === 'arxiv' ? 'from arXiv' : 'from doi.org'}</span>
              {entry.doi && <span className="font-mono truncate max-w-full">{entry.doi}</span>}
            </div>

            <button
              type="button"
              onClick={() => setShowBibtex((v) => !v)}
              aria-expanded={showBibtex}
              className="flex items-center gap-1 text-[11px] text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
            >
              {showBibtex ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              BibTeX entry
            </button>
            {showBibtex && (
              <pre className="p-2.5 rounded-lg bg-surface-lightPanel dark:bg-surface-dark border border-surface-lightBorder dark:border-surface-darkBorder font-mono text-[11px] leading-relaxed text-stone-800 dark:text-stone-200 overflow-x-auto select-text">
                {entry.bibtex}
              </pre>
            )}

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-surface-lightBorder dark:border-surface-darkBorder">
              {existing ? (
                <>
                  <span className="text-[11px] text-stone-600 dark:text-stone-400">
                    Already in {existing.bibFile || 'your bibliography'} as <span className="font-mono">{existing.key}</span>.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onInsert(`\\cite{${existing.key}}`);
                      onClose();
                    }}
                    className="ml-auto px-3 py-1.5 rounded-lg bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover dark:hover:bg-scholarly-darkHover text-white font-semibold transition btn-tactile"
                  >
                    Cite It
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => addEntry(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-scholarly dark:bg-scholarly-dark hover:bg-scholarly-hover dark:hover:bg-scholarly-darkHover text-white font-semibold transition disabled:opacity-50 btn-tactile"
                  >
                    {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    Add and Cite
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => addEntry(false)}
                    className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 font-medium transition disabled:opacity-50 btn-tactile"
                  >
                    Add Only
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {candidates && (
          <>
            <p className="text-[11px] font-medium text-stone-600 dark:text-stone-400">Closest matches. Choose the paper you mean:</p>
            {candidates.map((c) => (
              <button
                key={c.lookup}
                type="button"
                onClick={() => lookup(c.lookup)}
                className="w-full text-left p-3 rounded-xl bg-surface-lightSubtle dark:bg-surface-darkSubtle border border-surface-lightBorder dark:border-surface-darkBorder hover:border-scholarly/50 dark:hover:border-scholarly-dark/50 transition"
              >
                <p className="font-medium leading-snug text-stone-900 dark:text-stone-100">{c.title}</p>
                <p className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                  {[c.authors, c.venue, c.year].filter(Boolean).join(' · ')}
                </p>
              </button>
            ))}
          </>
        )}

        {!error && !entry && !candidates && !added && !isSearching && (
          <div className="h-full min-h-[120px] flex items-center justify-center text-center text-[11px] text-stone-400 dark:text-stone-500 px-6">
            Paste a DOI or arXiv link and Oberleaf writes the BibTeX entry, picks a citation key and inserts the \cite for you.
          </div>
        )}
      </div>
    </div>
  );
};
