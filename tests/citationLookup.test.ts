import { describe, expect, it } from 'vitest';
import {
  candidatesFromArxivAtom,
  titleSimilarity,
  classifyQuery,
  entryFromArxivAtom,
  formatBibEntry,
  makeCitationKey,
  parseBibEntry,
  tidyEntry,
} from '../server/citationLookup.js';

describe('classifyQuery', () => {
  it('recognises a bare DOI and a DOI link', () => {
    expect(classifyQuery('10.1002/andp.19053221004')).toEqual({ kind: 'doi', doi: '10.1002/andp.19053221004' });
    expect(classifyQuery('https://doi.org/10.1038/nature14539.')).toEqual({ kind: 'doi', doi: '10.1038/nature14539' });
  });

  it('recognises arXiv IDs in every form people paste', () => {
    expect(classifyQuery('1706.03762')).toEqual({ kind: 'arxiv', id: '1706.03762' });
    expect(classifyQuery('arXiv:1706.03762v5')).toEqual({ kind: 'arxiv', id: '1706.03762' });
    expect(classifyQuery('https://arxiv.org/abs/1706.03762')).toEqual({ kind: 'arxiv', id: '1706.03762' });
    expect(classifyQuery('https://arxiv.org/pdf/hep-th/9711200')).toEqual({ kind: 'arxiv', id: 'hep-th/9711200' });
    expect(classifyQuery('10.48550/arXiv.1706.03762')).toEqual({ kind: 'arxiv', id: '1706.03762' });
  });

  it('treats anything else as a title search', () => {
    expect(classifyQuery('  Attention is all you need ')).toEqual({ kind: 'title', text: 'Attention is all you need' });
  });
});

describe('title search ranking', () => {
  it('puts the exact title above titles that only share its words', () => {
    const q = 'attention is all you need';
    expect(titleSimilarity(q, 'Attention Is All You Need')).toBeGreaterThan(titleSimilarity(q, 'Is Attention All You Need?'));
    expect(titleSimilarity(q, 'Is Attention All You Need?')).toBeGreaterThan(titleSimilarity(q, 'Not All Attention Is All You Need'));
    expect(titleSimilarity(q, 'Graphene transistors')).toBe(0);
  });

  it('lists every paper in an arXiv search response', () => {
    const xml = `<feed>
      <entry><id>http://arxiv.org/abs/1706.03762v7</id><published>2017-06-12T00:00:00Z</published>
        <title>Attention Is All You Need</title><author><name>Ashish Vaswani</name></author></entry>
      <entry><id>http://arxiv.org/abs/2104.04692v3</id><published>2021-04-10T00:00:00Z</published>
        <title>Not All Attention Is All You Need</title><author><name>Hongqiu Wu</name></author></entry></feed>`;
    expect(candidatesFromArxivAtom(xml)).toEqual([
      { title: 'Attention Is All You Need', authors: 'Vaswani', year: '2017', venue: 'arXiv', lookup: 'arXiv:1706.03762' },
      { title: 'Not All Attention Is All You Need', authors: 'Wu', year: '2021', venue: 'arXiv', lookup: 'arXiv:2104.04692' },
    ]);
  });
});

describe('parseBibEntry', () => {
  it('reads the one-line record doi.org returns, with nested braces', () => {
    const entry = parseBibEntry(
      ' @article{Einstein_1905, title={Zur Elektrodynamik bewegter K{\\"o}rper}, volume={322}, ISSN={1521-3889}, ' +
        'journal={Annalen der Physik}, author={Einstein, A.}, year={1905}, month=jan, pages={891–921} }'
    );
    expect(entry?.type).toBe('article');
    expect(entry?.fields.title).toBe('Zur Elektrodynamik bewegter K{\\"o}rper');
    expect(entry?.fields.month).toBe('jan');
    expect(entry?.fields.issn).toBe('1521-3889');
  });

  it('reads quoted values and returns null for text that is not BibTeX', () => {
    expect(parseBibEntry('@book{k, title = "A {B} c", year = 1994}')?.fields).toEqual({ title: 'A {B} c', year: '1994' });
    expect(parseBibEntry('<html>Not found</html>')).toBeNull();
  });
});

describe('makeCitationKey', () => {
  it('uses surname, year and the first real title word', () => {
    expect(makeCitationKey({ author: 'Einstein, A.', year: '1905', title: 'Zur Elektrodynamik bewegter Körper' })).toBe(
      'einstein1905elektrodynamik'
    );
    expect(makeCitationKey({ author: 'Ashish Vaswani and Noam Shazeer', year: '2017', title: 'Attention Is All You Need' })).toBe(
      'vaswani2017attention'
    );
  });

  it('strips accents and survives missing fields', () => {
    expect(makeCitationKey({ author: 'Schrödinger, Erwin', year: '1926', title: 'An Undulatory Theory' })).toBe(
      'schrodinger1926undulatory'
    );
    expect(makeCitationKey({ title: 'The Title' })).toBe('reftitle');
  });
});

describe('tidyEntry and formatBibEntry', () => {
  it('normalises pages, drops the resolver URL and escapes ampersands', () => {
    const entry = tidyEntry({
      type: 'article',
      key: 'Smith_2020',
      fields: {
        author: 'Smith, Jane',
        title: 'Growth of MoS2 films for LED devices',
        journal: 'Physics & Astronomy Letters',
        pages: '10 – 20',
        year: '2020',
        doi: 'https://doi.org/10.1000/xyz',
        url: 'http://dx.doi.org/10.1000/xyz',
      },
    });
    expect(entry.key).toBe('smith2020growth');
    expect(entry.fields.pages).toBe('10--20');
    expect(entry.fields.doi).toBe('10.1000/xyz');
    expect(entry.fields.url).toBeUndefined();
    expect(entry.fields.title).toBe('Growth of {MoS2} films for {LED} devices');
    const text = formatBibEntry(entry);
    expect(text).toContain('journal = {Physics \\& Astronomy Letters}');
    expect(text.startsWith('@article{smith2020growth,\n')).toBe(true);
    // What Oberleaf writes must read back as the same entry.
    expect(parseBibEntry(text)?.fields.pages).toBe('10--20');
  });
});

describe('entryFromArxivAtom', () => {
  const atom = `<?xml version="1.0"?><feed xmlns:arxiv="http://arxiv.org/schemas/atom">
    <entry>
      <id>http://arxiv.org/abs/1706.03762v7</id>
      <published>2017-06-12T17:57:34Z</published>
      <title>Attention Is All
        You Need</title>
      <author><name>Ashish Vaswani</name></author>
      <author><name>Noam Shazeer</name></author>
      <arxiv:primary_category term="cs.CL" scheme="http://arxiv.org/schemas/atom"/>
    </entry></feed>`;

  it('builds a misc entry with eprint fields', () => {
    const entry = entryFromArxivAtom(atom, '1706.03762');
    expect(entry?.fields.author).toBe('Vaswani, Ashish and Shazeer, Noam');
    expect(entry?.fields.title).toBe('Attention Is All You Need');
    expect(entry?.fields.year).toBe('2017');
    expect(entry?.fields.primaryclass).toBe('cs.CL');
    const text = formatBibEntry(tidyEntry(entry!));
    expect(text).toContain('@misc{vaswani2017attention,');
    expect(text).toContain('archivePrefix = {arXiv}');
  });

  it('returns null when arXiv has no such paper', () => {
    expect(entryFromArxivAtom('<feed></feed>', '0000.00000')).toBeNull();
  });
});
