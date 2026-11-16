// Turns a DOI, an arXiv ID, a link to either, or a paper title into a BibTeX
// entry. This is the one place Oberleaf talks to the internet on the user's
// behalf while writing: only the text typed into the lookup box is sent, to
// doi.org, arXiv or Crossref, and only when the user asks.

export interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

export interface LookupCandidate {
  title: string;
  authors: string;
  year: string;
  venue: string;
  /** What to look up to get this paper's entry: its DOI, or arXiv:<id> */
  lookup: string;
}

export type LookupResult =
  | { kind: 'entry'; source: 'doi' | 'arxiv'; bibtex: string; key: string; title: string; authors: string; year: string; venue: string; doi?: string }
  | { kind: 'candidates'; items: LookupCandidate[] };

export class LookupError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const USER_AGENT = 'Oberleaf (local LaTeX editor; citation lookup)';
const TIMEOUT_MS = 12000;

// ─── Recognising what was typed ─────────────────────────────────────────────

export type Query =
  | { kind: 'doi'; doi: string }
  | { kind: 'arxiv'; id: string }
  | { kind: 'title'; text: string };

export function classifyQuery(raw: string): Query {
  const text = raw.trim();
  // arXiv first: an arXiv DOI (10.48550/arXiv.2301.01234) is better served by
  // arXiv's own record than by DataCite's.
  const arxivDoi = text.match(/10\.48550\/arxiv\.(\d{4}\.\d{4,5})/i);
  if (arxivDoi) return { kind: 'arxiv', id: arxivDoi[1] };
  const arxivUrl = text.match(/arxiv\.org\/(?:abs|pdf)\/([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})/i);
  if (arxivUrl) return { kind: 'arxiv', id: arxivUrl[1] };
  const arxivTagged = text.match(/^arxiv\s*:?\s*([a-z-]+(?:\.[A-Z]{2})?\/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?$/i);
  if (arxivTagged) return { kind: 'arxiv', id: arxivTagged[1] };
  const arxivBare = text.match(/^(\d{4}\.\d{4,5})(?:v\d+)?$/);
  if (arxivBare) return { kind: 'arxiv', id: arxivBare[1] };

  const doi = text.match(/10\.\d{4,9}\/[^\s"<>]+/);
  if (doi) return { kind: 'doi', doi: doi[0].replace(/[.,;)\]]+$/, '') };

  return { kind: 'title', text };
}

// ─── BibTeX parsing and writing ─────────────────────────────────────────────

/** Parses the first entry in a BibTeX string. Braces inside values may nest. */
export function parseBibEntry(source: string): BibEntry | null {
  const head = source.match(/@\s*([a-zA-Z]+)\s*\{\s*([^,\s]*)\s*,/);
  if (!head || head.index === undefined) return null;
  const fields: Record<string, string> = {};
  let i = head.index + head[0].length;
  const n = source.length;

  while (i < n) {
    while (i < n && /[\s,]/.test(source[i])) i++;
    if (i >= n || source[i] === '}') break;
    const nameMatch = source.slice(i).match(/^([a-zA-Z][\w-]*)\s*=\s*/);
    if (!nameMatch) break;
    const name = nameMatch[1].toLowerCase();
    i += nameMatch[0].length;

    let value = '';
    if (source[i] === '{') {
      let depth = 0;
      const start = i + 1;
      for (; i < n; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '{') depth++;
        else if (source[i] === '}' && --depth === 0) break;
      }
      value = source.slice(start, i);
      i++;
    } else if (source[i] === '"') {
      const start = i + 1;
      i++;
      let depth = 0;
      for (; i < n; i++) {
        if (source[i] === '\\') { i++; continue; }
        if (source[i] === '{') depth++;
        else if (source[i] === '}') depth--;
        else if (source[i] === '"' && depth === 0) break;
      }
      value = source.slice(start, i);
      i++;
    } else {
      const bare = source.slice(i).match(/^[^,}\s]+/);
      value = bare ? bare[0] : '';
      i += value.length;
    }
    fields[name] = value.replace(/\s+/g, ' ').trim();
  }

  return { type: head[1].toLowerCase(), key: head[2], fields };
}

const TITLE_STOP_WORDS = new Set([
  'a', 'an', 'the', 'on', 'of', 'in', 'for', 'and', 'to', 'with', 'from', 'at', 'by', 'is', 'are',
  'zur', 'der', 'die', 'das', 'le', 'la', 'les', 'de', 'un', 'une',
]);

function asciiWord(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\\[a-zA-Z]+|[{}\\"'`^~]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toLowerCase();
}

/** einstein1905elektrodynamik: first author's surname, year, first real title word. */
export function makeCitationKey(fields: Record<string, string>): string {
  const firstAuthor = (fields.author || fields.editor || '').split(/\s+and\s+/i)[0].trim();
  let surname = '';
  if (firstAuthor.includes(',')) surname = firstAuthor.split(',')[0];
  else {
    // "Ludwig van Beethoven": keep the last word; braces protect a full name.
    const braced = firstAuthor.match(/^\{(.+)\}$/);
    surname = braced ? braced[1].split(/\s+/)[0] : firstAuthor.split(/\s+/).pop() || '';
  }
  const year = (fields.year || fields.date || '').match(/\d{4}/)?.[0] ?? '';
  const titleWord =
    (fields.title || '')
      .split(/[\s\-:]+/)
      .map(asciiWord)
      .find((w) => w.length > 1 && !TITLE_STOP_WORDS.has(w)) ?? '';
  return `${asciiWord(surname) || 'ref'}${year}${titleWord}` || 'ref';
}

const FIELD_ORDER = [
  'author', 'editor', 'title', 'booktitle', 'journal', 'series', 'volume', 'number', 'pages', 'publisher',
  'address', 'school', 'institution', 'edition', 'year', 'month', 'doi', 'eprint', 'archiveprefix',
  'primaryclass', 'isbn', 'issn', 'url', 'note',
];
const VERBATIM_FIELDS = new Set(['url', 'doi', 'eprint', 'file', 'isbn', 'issn']);
const FIELD_NAMES: Record<string, string> = { archiveprefix: 'archivePrefix', primaryclass: 'primaryClass' };

/** Characters that are plain text in a database record but special to LaTeX. */
function escapeLatexText(value: string): string {
  return value.replace(/(?<!\\)&/g, '\\&').replace(/(?<!\\)%/g, '\\%').replace(/(?<!\\)#/g, '\\#');
}

export function formatBibEntry(entry: BibEntry): string {
  const names = Object.keys(entry.fields).filter((k) => entry.fields[k]);
  names.sort((a, b) => {
    const ia = FIELD_ORDER.indexOf(a);
    const ib = FIELD_ORDER.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib) || a.localeCompare(b);
  });
  const width = Math.max(...names.map((k) => (FIELD_NAMES[k] ?? k).length), 0);
  const lines = names.map((k) => {
    const value = VERBATIM_FIELDS.has(k) ? entry.fields[k] : escapeLatexText(entry.fields[k]);
    return `  ${(FIELD_NAMES[k] ?? k).padEnd(width)} = {${value}}`;
  });
  return `@${entry.type}{${entry.key},\n${lines.join(',\n')}\n}`;
}

/** Cleans a record from a database into the entry Oberleaf writes to the .bib file. */
export function tidyEntry(entry: BibEntry): BibEntry {
  const fields: Record<string, string> = {};
  for (const [name, raw] of Object.entries(entry.fields)) {
    let value = raw.trim();
    if (!value) continue;
    if (name === 'pages') value = value.replace(/\s*[\u2010-\u2015-]+\s*/g, '--');
    if (name === 'doi') value = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '');
    // A DOI resolver URL repeats the doi field; a publisher URL is worth keeping.
    if (name === 'url' && /^https?:\/\/(dx\.)?doi\.org\//i.test(value) && entry.fields.doi) continue;
    if (name === 'month') value = value.toLowerCase();
    fields[name] = value;
  }
  // Protect capitals BibTeX styles would lowercase: acronyms and chemical formulae.
  if (fields.title) {
    fields.title = fields.title.replace(/(?<![{\\\w])((?:[A-Z][a-z]?\d*){2,}|[A-Z]{2,}\d*)(?![\w}])/g, '{$1}');
  }
  return { type: entry.type, key: makeCitationKey(fields), fields };
}

// ─── Network ────────────────────────────────────────────────────────────────

async function fetchText(url: string, headers: Record<string, string> = {}): Promise<{ status: number; text: string }> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, ...headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: any) {
    const host = new URL(url).host;
    if (err?.name === 'TimeoutError') throw new LookupError(`${host} did not answer within ${TIMEOUT_MS / 1000} seconds.`, 504);
    throw new LookupError(`Could not reach ${host}. Check the internet connection.`, 502);
  }
  return { status: res.status, text: await res.text() };
}

function summarise(entry: BibEntry) {
  return {
    title: entry.fields.title?.replace(/[{}]/g, '') ?? '',
    authors: entry.fields.author ?? '',
    year: entry.fields.year ?? '',
    venue: entry.fields.journal || entry.fields.booktitle || entry.fields.publisher || '',
  };
}

export async function lookupDoi(doi: string): Promise<LookupResult> {
  const { status, text } = await fetchText(`https://doi.org/${encodeURI(doi)}`, {
    Accept: 'application/x-bibtex; charset=utf-8',
  });
  if (status === 404) throw new LookupError(`No record for DOI ${doi}. Check it for a typo.`, 404);
  if (status >= 400) throw new LookupError(`doi.org answered ${status} for ${doi}.`, 502);
  const parsed = parseBibEntry(text);
  if (!parsed) throw new LookupError(`doi.org has no BibTeX record for ${doi}.`, 502);
  if (!parsed.fields.doi) parsed.fields.doi = doi;
  const entry = tidyEntry(parsed);
  return { kind: 'entry', source: 'doi', bibtex: formatBibEntry(entry), key: entry.key, doi: entry.fields.doi, ...summarise(entry) };
}

function xmlText(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
  return m
    ? m[1].replace(/\s+/g, ' ').trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    : '';
}

/** Builds the entry from arXiv's Atom response. Exported for the tests. */
export function entryFromArxivAtom(xml: string, id: string): BibEntry | null {
  const entryBlock = xml.match(/<entry>([\s\S]*?)<\/entry>/)?.[1];
  if (!entryBlock || !/<title/.test(entryBlock) || /<title>\s*Error\s*<\/title>/i.test(entryBlock)) return null;
  const authors = [...entryBlock.matchAll(/<author>([\s\S]*?)<\/author>/g)]
    .map((m) => xmlText(m[1], 'name'))
    .filter(Boolean)
    .map((name) => {
      const parts = name.split(/\s+/);
      return parts.length > 1 ? `${parts[parts.length - 1]}, ${parts.slice(0, -1).join(' ')}` : name;
    });
  const published = xmlText(entryBlock, 'published');
  const primary = entryBlock.match(/<arxiv:primary_category[^>]*term="([^"]+)"/)?.[1] ?? '';
  const journalRef = xmlText(entryBlock, 'arxiv:journal_ref');
  const doi = xmlText(entryBlock, 'arxiv:doi');
  const fields: Record<string, string> = {
    author: authors.join(' and '),
    title: xmlText(entryBlock, 'title'),
    year: published.slice(0, 4),
    eprint: id,
    archiveprefix: 'arXiv',
    primaryclass: primary,
    url: `https://arxiv.org/abs/${id}`,
  };
  if (journalRef) fields.note = `Published as ${journalRef}`;
  if (doi) fields.doi = doi;
  return { type: 'misc', key: '', fields };
}

export async function lookupArxiv(id: string): Promise<LookupResult> {
  const { status, text } = await fetchText(`https://export.arxiv.org/api/query?id_list=${encodeURIComponent(id)}&max_results=1`);
  if (status >= 400) throw new LookupError(`arXiv answered ${status} for ${id}.`, 502);
  const parsed = entryFromArxivAtom(text, id);
  if (!parsed) throw new LookupError(`arXiv has no paper with the ID ${id}.`, 404);
  const entry = tidyEntry(parsed);
  return { kind: 'entry', source: 'arxiv', bibtex: formatBibEntry(entry), key: entry.key, doi: entry.fields.doi, ...summarise(entry) };
}

/** How much of the query a title covers, 0..1, with a small penalty for extra words. */
export function titleSimilarity(query: string, title: string): number {
  const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
  const q = words(query);
  const t = words(title);
  if (q.length === 0 || t.length === 0) return 0;
  const inTitle = new Set(t);
  const covered = q.filter((w) => inTitle.has(w)).length / q.length;
  const extra = Math.max(0, t.length - q.length) / (t.length + q.length);
  // The same words in the same order is the paper that was asked for.
  const exact = q.join(' ') === t.join(' ') ? 0.25 : 0;
  return covered - extra * 0.5 + exact;
}

/** Every paper in an arXiv Atom response, as candidates. Exported for the tests. */
export function candidatesFromArxivAtom(xml: string): LookupCandidate[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)]
    .map((m) => {
      const block = m[1];
      const id = xmlText(block, 'id').match(/arxiv\.org\/abs\/(.+?)(?:v\d+)?$/)?.[1] ?? '';
      const names = [...block.matchAll(/<author>([\s\S]*?)<\/author>/g)].map((a) => xmlText(a[1], 'name').split(/\s+/).pop() ?? '');
      return {
        title: xmlText(block, 'title'),
        authors: names.length > 3 ? `${names.slice(0, 3).join(', ')} et al.` : names.join(', '),
        year: xmlText(block, 'published').slice(0, 4),
        venue: 'arXiv',
        lookup: id ? `arXiv:${id}` : '',
      };
    })
    .filter((c) => c.lookup && c.title);
}

async function searchArxivByTitle(text: string): Promise<LookupCandidate[]> {
  const phrase = text.replace(/["\\]/g, ' ').trim();
  const url = `https://export.arxiv.org/api/query?max_results=4&search_query=${encodeURIComponent(`ti:"${phrase}"`)}`;
  const { status, text: body } = await fetchText(url);
  return status >= 400 ? [] : candidatesFromArxivAtom(body);
}

export async function searchByTitle(text: string): Promise<LookupResult> {
  if (text.length < 4) throw new LookupError('Type a DOI, an arXiv ID, or a few words of the title.');
  // Crossref knows published papers, arXiv knows preprints; a title can be in
  // either, so both are asked and the answers ranked together. One of them
  // failing still leaves the other's results.
  const [crossref, arxiv] = await Promise.allSettled([searchCrossrefByTitle(text), searchArxivByTitle(text)]);
  if (crossref.status === 'rejected' && arxiv.status === 'rejected') throw crossref.reason;
  const all = [
    ...(crossref.status === 'fulfilled' ? crossref.value : []),
    ...(arxiv.status === 'fulfilled' ? arxiv.value : []),
  ];
  const ranked = all
    .map((c, i) => ({ c, i, score: titleSimilarity(text, c.title) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.c);
  return { kind: 'candidates', items: ranked.slice(0, 8) };
}

async function searchCrossrefByTitle(text: string): Promise<LookupCandidate[]> {
  const url =
    'https://api.crossref.org/works?rows=6&select=DOI,title,author,issued,container-title,type&query.bibliographic=' +
    encodeURIComponent(text);
  const { status, text: body } = await fetchText(url);
  if (status >= 400) throw new LookupError(`Crossref answered ${status}.`, 502);
  let items: any[] = [];
  try {
    items = JSON.parse(body)?.message?.items ?? [];
  } catch {
    throw new LookupError('Crossref sent a reply that could not be read.', 502);
  }
  const candidates: LookupCandidate[] = items
    .filter((it) => it?.DOI && Array.isArray(it.title) && it.title[0])
    .map((it) => {
      const authors: any[] = Array.isArray(it.author) ? it.author : [];
      const names = authors.map((a) => a.family || a.name).filter(Boolean);
      return {
        title: String(it.title[0]).replace(/<[^>]+>/g, ''),
        authors: names.length > 3 ? `${names.slice(0, 3).join(', ')} et al.` : names.join(', '),
        year: String(it.issued?.['date-parts']?.[0]?.[0] ?? ''),
        venue: Array.isArray(it['container-title']) ? it['container-title'][0] ?? '' : '',
        lookup: String(it.DOI),
      };
    });
  return candidates;
}

export async function lookupCitation(raw: string): Promise<LookupResult> {
  const query = classifyQuery(String(raw ?? ''));
  if (query.kind === 'doi') return lookupDoi(query.doi);
  if (query.kind === 'arxiv') return lookupArxiv(query.id);
  return searchByTitle(query.text);
}
