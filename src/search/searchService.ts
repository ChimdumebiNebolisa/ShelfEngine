/**
 * Search service: runs semantic + keyword retrieval, merges results,
 * applies filters, and builds "why matched" one-line strings.
 */

import { db } from '../db';
import type { Bookmark } from '../db';
import { embedQuery } from '../embeddings/embeddingService';
import { semanticTopK, keywordSearch } from './retrieval';
import type { KeywordHit, MatchedIn } from './retrieval';

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
}

function applyFilters(
  bookmarks: Bookmark[],
  filters: SearchFilters
): Bookmark[] {
  let out = bookmarks;

  if (filters.folder != null && filters.folder !== '') {
    out = out.filter((b) => b.folderPath === filters.folder);
  }
  if (filters.domain != null && filters.domain !== '') {
    out = out.filter((b) => b.domain === filters.domain);
  }
  if (filters.dateRange != null && filters.dateRange !== 'any') {
    const now = Math.floor(Date.now() / 1000);
    const cut =
      filters.dateRange === '7d' ? now - 7 * 24 * 3600 : now - 30 * 24 * 3600;
    out = out.filter((b) => b.addDate != null && b.addDate >= cut);
  }

  return out;
}

function formatMatchedIn(m: MatchedIn): string {
  if (m === 'folderPath') return 'folder';
  return m;
}

function buildWhyMatched(
  keywordHit: KeywordHit | undefined,
  similarity: number
): string {
  const simStr = similarity.toFixed(2);
  if (keywordHit && keywordHit.matchedTerms.length > 0) {
    const terms = keywordHit.matchedTerms.map((t) => `"${t}"`).join(', ');
    const where =
      keywordHit.matchedIn.length > 0
        ? keywordHit.matchedIn.map(formatMatchedIn).join(', ')
        : '';
    const part = where ? ` in ${where}` : '';
    return `Matched ${terms}${part} · similarity ${simStr}`;
  }
  return `Similarity ${simStr}`;
}

export async function search(
  query: string,
  filters: SearchFilters = {}
): Promise<SearchResult[]> {
  const trimmed = query.trim();
  if (trimmed === '') return [];

  const [bookmarks, embeddings] = await Promise.all([
    db.bookmarks.toArray(),
    db.embeddings.toArray(),
  ]);

  const filteredBookmarks = applyFilters(bookmarks, filters);
  const filteredIds = new Set(filteredBookmarks.map((b) => b.id).filter((id): id is number => id != null));

  const embeddingByBookmarkId = new Map(
    embeddings.filter((e) => filteredIds.has(e.bookmarkId)).map((e) => [e.bookmarkId, e] as const)
  );
  const bookmarkById = new Map(
    filteredBookmarks.filter((b) => b.id != null).map((b) => [b.id!, b] as const)
  );

  const semanticItems = Array.from(embeddingByBookmarkId.entries()).map(
    ([bookmarkId, e]) => ({ bookmarkId, vector: e.vector })
  );

  if (semanticItems.length === 0) {
    const keywordHits = keywordSearch(filteredBookmarks, trimmed);
    return keywordHits.slice(0, 10).map((kh) => {
      const b = bookmarkById.get(kh.bookmarkId);
      if (!b) return null;
      return {
        bookmark: b,
        score: 1,
        whyMatched: `Matched ${kh.matchedTerms.map((t) => `"${t}"`).join(', ')} in ${kh.matchedIn.map(formatMatchedIn).join(', ')}`,
      };
    }).filter((r): r is SearchResult => r != null);
  }

  const queryVector = await embedQuery(trimmed || ' ');
  const semanticHits = semanticTopK(semanticItems, queryVector, 10);
  const keywordHits = keywordSearch(filteredBookmarks, trimmed);
  const keywordByBookmarkId = new Map(keywordHits.map((kh) => [kh.bookmarkId, kh]));

  const seen = new Set<number>();
  const results: SearchResult[] = [];

  for (const kh of keywordHits) {
    if (seen.has(kh.bookmarkId)) continue;
    const b = bookmarkById.get(kh.bookmarkId);
    if (!b) continue;
    seen.add(kh.bookmarkId);
    const sim = embeddingByBookmarkId.has(kh.bookmarkId)
      ? semanticHits.find((s) => s.bookmarkId === kh.bookmarkId)?.score ?? 0
      : 0;
    results.push({
      bookmark: b,
      score: 1 + sim,
      whyMatched: buildWhyMatched(kh, sim),
    });
  }

  for (const sh of semanticHits) {
    if (seen.has(sh.bookmarkId)) continue;
    const b = bookmarkById.get(sh.bookmarkId);
    if (!b) continue;
    seen.add(sh.bookmarkId);
    const kh = keywordByBookmarkId.get(sh.bookmarkId);
    results.push({
      bookmark: b,
      score: sh.score,
      whyMatched: buildWhyMatched(kh, sh.score),
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
