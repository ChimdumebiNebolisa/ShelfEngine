/**
 * Search service: runs semantic + keyword retrieval, merges results,
 * applies filters, and builds "why matched" one-line strings.
 */

import { db } from '../db';
import type { Bookmark } from '../db';
import { embedQuery } from '../embeddings/embeddingService';
import { parseQuery } from './queryParse';
import { getMiniIndex, MINI_SEARCH_OPTIONS } from './miniIndex';
import {
  semanticTopK,
  isJunkTitle,
  isRecent,
  inferKeywordSignals,
  bookmarkMatchesExclude,
  bookmarkMatchesOrGroup,
} from './retrieval';
import type { KeywordHit, MatchedIn } from './retrieval';

export type { ParsedQuery } from './queryParse';

const MIN_COMBINED_SCORE = 0.2;
const RELATED_SEMANTIC_FLOOR = 0.15;
const ALPHA = 0.55;
const PHRASE_BOOST_CAP = 0.2;
const PHRASE_BOOST_PER = 0.07;
const JUNK_TITLE_PENALTY = 0.15;
const RECENCY_BOOST_CAP = 0.05;

export type DateRangeFilter = 'any' | '7d' | '30d';

export interface SearchFilters {
  folder?: string;
  domain?: string;
  dateRange?: DateRangeFilter;
}

export type WhyMatchedReason =
  | { type: 'semantic' }
  | { type: 'keyword'; field: 'title' | 'folder' | 'site'; terms: string[] }
  | { type: 'phrase'; phrase: string };

export type MatchTier = 'strong' | 'related';

export interface SearchResult {
  bookmark: Bookmark;
  score: number;
  whyMatched: string;
  reasons: WhyMatchedReason[];
  matchedTerms?: string[];
  matchTier?: MatchTier;
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

function buildReasons(keywordHit: KeywordHit | undefined, hasSemantic: boolean): WhyMatchedReason[] {
  const reasons: WhyMatchedReason[] = [];
  if (hasSemantic) reasons.push({ type: 'semantic' });
  if (keywordHit?.matchedPhrases?.length) {
    for (const p of keywordHit.matchedPhrases.slice(0, 1)) {
      reasons.push({ type: 'phrase', phrase: p.phrase });
      if (reasons.length >= 2) break;
    }
  }
  if (reasons.length < 2 && keywordHit?.matchedTerms?.length && keywordHit.matchedIn.length > 0) {
    const fieldMap: MatchedIn[] = ['title', 'folderPath', 'domain', 'url'];
    for (const f of fieldMap) {
      if (keywordHit.matchedIn.includes(f) && reasons.length < 2) {
        const field = f === 'folderPath' ? 'folder' : f === 'title' ? 'title' : 'site';
        reasons.push({ type: 'keyword', field, terms: keywordHit.matchedTerms });
        break;
      }
    }
  }
  if (reasons.length === 0) reasons.push({ type: 'semantic' });
  return reasons.slice(0, 2);
}

function formatReasons(reasons: WhyMatchedReason[]): string {
  return reasons.map((r) => {
    if (r.type === 'semantic') return 'Relevant to your query';
    if (r.type === 'phrase') return `Phrase match: ${r.phrase}`;
    const terms = r.terms.map((t) => `'${t}'`).join(', ');
    return `Matches in ${r.field}: ${terms}`;
  }).join(' · ');
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
      reasons: [],
    }));
  }

  const embeddingByBookmarkId = new Map(
    embeddingsList.map((e) => [e.bookmarkId, e] as const)
  );
  const bookmarkById = new Map(
    filteredBookmarks.filter((b) => b.id != null).map((b) => [b.id!, b] as const)
  );
  const filteredIds = new Set(bookmarkById.keys());

  const mini = await getMiniIndex();
  const rawMiniHits = parsed.searchText.trim()
    ? mini.search(parsed.searchText, MINI_SEARCH_OPTIONS)
    : [];
  const keywordHits: KeywordHit[] = [];
  for (const hit of rawMiniHits) {
    const bookmarkId = typeof hit.id === 'number' ? hit.id : Number(hit.id);
    if (!Number.isFinite(bookmarkId) || !filteredIds.has(bookmarkId)) continue;
    const bookmark = bookmarkById.get(bookmarkId);
    if (!bookmark) continue;
    if (bookmarkMatchesExclude(bookmark, parsed.excludeTerms)) continue;
    if (
      parsed.orGroups.length > 1 &&
      !parsed.orGroups.some((group) => bookmarkMatchesOrGroup(bookmark, group))
    ) {
      continue;
    }
    keywordHits.push({
      bookmarkId,
      score: hit.score ?? 0,
      ...inferKeywordSignals(bookmark, parsed),
    });
  }

  const semanticItems = Array.from(embeddingByBookmarkId.entries()).map(
    ([bookmarkId, e]) => ({ bookmarkId, vector: e.vector })
  );

  if (semanticItems.length === 0) {
    const maxKw = keywordHits.length > 0 ? Math.max(...keywordHits.map((kh) => kh.score), 1) : 1;
    const queryTokens = parsed.terms.length + parsed.phrases.length;
    const keywordOnlyResults: SearchResult[] = [];
    for (const kh of keywordHits.slice(0, 10)) {
      const b = bookmarkById.get(kh.bookmarkId);
      if (!b) continue;
      const semantic = 0;
      const keyword = Math.min(1, (kh.score ?? 0) / maxKw);
      const phraseCount = kh.matchedPhrases?.length ?? 0;
      const phraseBoost = Math.min(PHRASE_BOOST_CAP, phraseCount * PHRASE_BOOST_PER);
      const junkPenalty = isJunkTitle(b.title ?? '') ? JUNK_TITLE_PENALTY : 0;
      const recencyBoost = (queryTokens <= 2 && isRecent(b)) ? RECENCY_BOOST_CAP : 0;
      const raw = ALPHA * semantic + (1 - ALPHA) * keyword + phraseBoost - junkPenalty + recencyBoost;
      const finalScore = Math.max(0, Math.min(1, raw));
      const reasons = buildReasons(kh, false);
      keywordOnlyResults.push({
        bookmark: b,
        score: finalScore,
        whyMatched: formatReasons(reasons),
        reasons,
        matchedTerms: kh.matchedTerms?.length ? kh.matchedTerms : undefined,
      });
    }
    return keywordOnlyResults;
  }

  const queryVector = await embedQuery(parsed.searchText || ' ');
  const semanticHitsRaw = semanticTopK(semanticItems, queryVector, 50);
  const keywordByBookmarkId = new Map(keywordHits.map((kh) => [kh.bookmarkId, kh]));
  const semanticByBookmarkId = new Map(semanticHitsRaw.map((s) => [s.bookmarkId, s.score]));

  const maxKeywordScore = keywordHits.length > 0
    ? Math.max(...keywordHits.map((kh) => kh.score), 1)
    : 1;

  const candidateIds = new Set<number>([
    ...keywordHits.map((kh) => kh.bookmarkId),
    ...semanticHitsRaw.map((s) => s.bookmarkId),
  ]);

  const queryTokens = parsed.terms.length + parsed.phrases.length;

  const results: SearchResult[] = [];
  for (const bookmarkId of candidateIds) {
    const b = bookmarkById.get(bookmarkId);
    if (!b) continue;
    const semantic = semanticByBookmarkId.get(bookmarkId) ?? 0;
    const kh = keywordByBookmarkId.get(bookmarkId);
    const rawKeyword = kh?.score ?? 0;
    const keyword = Math.min(1, rawKeyword / maxKeywordScore);
    const phraseCount = kh?.matchedPhrases?.length ?? 0;
    const phraseBoost = Math.min(PHRASE_BOOST_CAP, phraseCount * PHRASE_BOOST_PER);
    const junkPenalty = isJunkTitle(b.title ?? '') ? JUNK_TITLE_PENALTY : 0;
    const recencyBoost = (queryTokens <= 2 && isRecent(b)) ? RECENCY_BOOST_CAP : 0;
    const raw = ALPHA * semantic + (1 - ALPHA) * keyword + phraseBoost - junkPenalty + recencyBoost;
    const finalScore = Math.max(0, Math.min(1, raw));

    const reasons = buildReasons(kh, semantic > 0);
    const isStrong = finalScore >= MIN_COMBINED_SCORE;
    results.push({
      bookmark: b,
      score: finalScore,
      whyMatched: formatReasons(reasons),
      reasons,
      matchedTerms: kh?.matchedTerms && kh.matchedTerms.length > 0 ? kh.matchedTerms : undefined,
      matchTier: isStrong ? 'strong' : undefined,
    });
  }

  results.sort((a, b) => b.score - a.score);
  const strongResults = results.filter((r) => r.matchTier === 'strong');
  let finalResults = strongResults.slice(0, 10);

  if (finalResults.length < 10 && semanticHitsRaw.length > 0) {
    const strongIds = new Set(finalResults.map((r) => r.bookmark.id).filter((id): id is number => id != null));
    const relatedCandidates = semanticHitsRaw
      .filter((s) => s.score >= RELATED_SEMANTIC_FLOOR && !strongIds.has(s.bookmarkId))
      .slice(0, 10 - finalResults.length);
    for (const s of relatedCandidates) {
      const b = bookmarkById.get(s.bookmarkId);
      if (!b) continue;
      finalResults.push({
        bookmark: b,
        score: s.score,
        whyMatched: 'Relevant to your query',
        reasons: [{ type: 'semantic' }],
        matchTier: 'related',
      });
    }
    finalResults.sort((a, b) => b.score - a.score);
  }

  return finalResults.slice(0, 10);
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
