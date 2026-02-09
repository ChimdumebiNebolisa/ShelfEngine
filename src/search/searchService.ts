/**
 * Search service: runs semantic + keyword retrieval, merges results,
 * applies filters, and builds "why matched" one-line strings.
 */

import { db } from '../db';
import type { Bookmark } from '../db';
import { embedQuery } from '../embeddings/embeddingService';
import { parseQuery } from './queryParse';
import { semanticTopK, keywordSearch } from './retrieval';
import type { KeywordHit, MatchedIn } from './retrieval';

export type { ParsedQuery } from './queryParse';

const MIN_SEMANTIC_SCORE = 0.4;
const MIN_SEMANTIC_ONLY_SCORE = 0.5;
const MIN_COMBINED_SCORE = 0.2;
const ALPHA = 0.55;

export type DateRangeFilter = 'any' | '7d' | '30d';

export interface SearchFilters {
  folder?: string;
  domain?: string;
  dateRange?: DateRangeFilter;
}

export interface SearchResult {
  bookmark: Bookmark;
  score: number;
  whyMatched: string;
  matchedTerms?: string[];
}

function hasAnyFilter(filters: SearchFilters): boolean {
  return (
    (filters.folder != null && filters.folder !== '') ||
    (filters.domain != null && filters.domain !== '') ||
    (filters.dateRange != null && filters.dateRange !== 'any')
  );
}

function dateCut(filters: SearchFilters): number | null {
  if (filters.dateRange == null || filters.dateRange === 'any') return null;
  const now = Math.floor(Date.now() / 1000);
  return filters.dateRange === '7d' ? now - 7 * 24 * 3600 : now - 30 * 24 * 3600;
}

/**
 * Load bookmarks and embeddings. Filters are combined with AND.
 */
async function loadBookmarksAndEmbeddings(filters: SearchFilters): Promise<{
  bookmarks: Bookmark[];
  embeddings: { bookmarkId: number; vector: number[] }[];
}> {
  const [allBookmarks, embeddings] = await Promise.all([
    db.bookmarks.toArray(),
    db.embeddings.toArray(),
  ]);

  let bookmarks = allBookmarks;
  if (filters.folder != null && filters.folder !== '') {
    bookmarks = bookmarks.filter((b) => b.folderPath === filters.folder);
  }
  if (filters.domain != null && filters.domain !== '') {
    bookmarks = bookmarks.filter((b) => b.domain === filters.domain);
  }
  const cut = dateCut(filters);
  if (cut != null) {
    bookmarks = bookmarks.filter((b) => b.addDate != null && b.addDate >= cut);
  }

  const ids = bookmarks.map((b) => b.id).filter((id): id is number => id != null);
  const embeddingsFiltered =
    ids.length > 0
      ? embeddings.filter((e) => ids.includes(e.bookmarkId))
      : [];
  return {
    bookmarks,
    embeddings: embeddingsFiltered.map((e) => ({ bookmarkId: e.bookmarkId, vector: e.vector })),
  };
}

function formatMatchedIn(m: MatchedIn): string {
  if (m === 'folderPath') return 'folder';
  return m;
}

function buildWhyMatched(keywordHit: KeywordHit | undefined, hasSemantic: boolean): string {
  const keywordPart =
    keywordHit && keywordHit.matchedTerms.length > 0
      ? `Matches ${keywordHit.matchedTerms.map((t) => `'${t}'`).join(', ')}${keywordHit.matchedIn.length > 0 ? ` in ${keywordHit.matchedIn.map(formatMatchedIn).join(', ')}` : ''}`
      : '';
  const semanticPart = hasSemantic ? 'Relevant to your query' : '';
  if (keywordPart && semanticPart) return `${keywordPart} and ${semanticPart.toLowerCase()}`;
  if (keywordPart) return keywordPart;
  return semanticPart || 'Relevant to your query';
}

const FILTER_ONLY_LIMIT = 50;

function mergeFilters(ui: SearchFilters, parsed: { domain?: string; folder?: string }): SearchFilters {
  return {
    ...ui,
    ...(parsed.domain != null && parsed.domain !== '' && { domain: parsed.domain }),
    ...(parsed.folder != null && parsed.folder !== '' && { folder: parsed.folder }),
  };
}

export async function search(
  query: string,
  filters: SearchFilters = {}
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  const parsed = parseQuery(trimmed);
  const effectiveFilters = mergeFilters(filters, parsed);
  const { bookmarks: filteredBookmarks, embeddings: embeddingsList } = await loadBookmarksAndEmbeddings(effectiveFilters);

  const queryFilterOnly = parsed.domain != null || parsed.folder != null;
  const searchTextEmpty = parsed.searchText.trim() === '';
  if (searchTextEmpty && !queryFilterOnly) return [];
  if (trimmed === '' || (searchTextEmpty && queryFilterOnly)) {
    if (!hasAnyFilter(effectiveFilters)) return [];
    const sorted = [...filteredBookmarks].sort((a, b) => {
      const aDate = a.addDate ?? a.createdAt ?? 0;
      const bDate = b.addDate ?? b.createdAt ?? 0;
      return bDate - aDate;
    });
    return sorted.slice(0, FILTER_ONLY_LIMIT).map((b) => ({
      bookmark: b,
      score: 1,
      whyMatched: 'Filtered results',
    }));
  }

  const filteredIds = new Set(filteredBookmarks.map((b) => b.id).filter((id): id is number => id != null));

  const embeddingByBookmarkId = new Map(
    embeddingsList.map((e) => [e.bookmarkId, e] as const)
  );
  const bookmarkById = new Map(
    filteredBookmarks.filter((b) => b.id != null).map((b) => [b.id!, b] as const)
  );

  const semanticItems = Array.from(embeddingByBookmarkId.entries()).map(
    ([bookmarkId, e]) => ({ bookmarkId, vector: e.vector })
  );

  if (semanticItems.length === 0) {
    const keywordHits = keywordSearch(filteredBookmarks, parsed.searchText || ' ');
    return keywordHits.slice(0, 10).map((kh) => {
      const b = bookmarkById.get(kh.bookmarkId);
      if (!b) return null;
      return {
        bookmark: b,
        score: kh.score,
        whyMatched: buildWhyMatched(kh, false),
      };
    }).filter((r): r is SearchResult => r != null);
  }

  const queryVector = await embedQuery(parsed.searchText || ' ');
  const semanticHitsRaw = semanticTopK(semanticItems, queryVector, 10);
  const semanticHits = semanticHitsRaw.filter((s) => s.score >= MIN_SEMANTIC_SCORE);
  const keywordHits = keywordSearch(filteredBookmarks, parsed.searchText || ' ');
  const keywordByBookmarkId = new Map(keywordHits.map((kh) => [kh.bookmarkId, kh]));
  const semanticByBookmarkId = new Map(semanticHits.map((s) => [s.bookmarkId, s.score]));

  const maxKeywordScore = keywordHits.length > 0
    ? Math.max(...keywordHits.map((kh) => kh.score), 1)
    : 1;

  const candidateIds = new Set<number>([
    ...keywordHits.map((kh) => kh.bookmarkId),
    ...semanticHits.map((s) => s.bookmarkId),
  ]);

  const results: SearchResult[] = [];
  for (const bookmarkId of candidateIds) {
    const b = bookmarkById.get(bookmarkId);
    if (!b) continue;
    const semanticScore = semanticByBookmarkId.get(bookmarkId) ?? 0;
    const kh = keywordByBookmarkId.get(bookmarkId);
    const rawKeyword = kh?.score ?? 0;
    if (rawKeyword === 0 && semanticScore < MIN_SEMANTIC_ONLY_SCORE) continue;
    const normKeyword = Math.min(1, rawKeyword / maxKeywordScore);
    const combined = ALPHA * semanticScore + (1 - ALPHA) * normKeyword;
    if (combined < MIN_COMBINED_SCORE) continue;
    results.push({
      bookmark: b,
      score: combined,
      whyMatched: buildWhyMatched(kh, semanticScore > 0),
      matchedTerms: kh?.matchedTerms && kh.matchedTerms.length > 0 ? kh.matchedTerms : undefined,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, 10);
}

export async function getFilterOptions(): Promise<{
  folders: string[];
  domains: string[];
}> {
  const bookmarks = await db.bookmarks.toArray();
  const folders = [...new Set(bookmarks.map((b) => b.folderPath).filter(Boolean))].sort();
  const domains = [...new Set(bookmarks.map((b) => b.domain).filter(Boolean))].sort();
  return { folders, domains };
}
