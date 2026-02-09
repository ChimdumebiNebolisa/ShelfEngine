/**
 * Retrieval: cosine similarity, semantic top-K, and keyword search.
 * Used by searchService to combine both paths (M4).
 */

import type { Bookmark } from '../db';

const TOP_K = 10;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export interface SemanticHit {
  bookmarkId: number;
  score: number;
}

export function semanticTopK(
  items: { bookmarkId: number; vector: number[] }[],
  queryVector: number[],
  k: number = TOP_K
): SemanticHit[] {
  const scored = items.map((item) => ({
    bookmarkId: item.bookmarkId,
    score: cosineSimilarity(item.vector, queryVector),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function tokenizeQuery(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(/\W+/)
    .filter((t) => t.length > 0);
}

export type MatchedIn = 'title' | 'url' | 'folderPath' | 'domain';

const FIELD_WEIGHTS: Record<MatchedIn, number> = {
  title: 2,
  domain: 1.5,
  folderPath: 1,
  url: 0.8,
};

export interface KeywordHit {
  bookmarkId: number;
  matchedTerms: string[];
  matchedIn: MatchedIn[];
  score: number;
}

export function keywordSearch(bookmarks: Bookmark[], query: string): KeywordHit[] {
  const terms = tokenizeQuery(query);
  if (terms.length === 0) return [];

  const results: KeywordHit[] = [];
  for (const b of bookmarks) {
    const id = b.id;
    if (id == null) continue;

    const title = (b.title ?? '').toLowerCase();
    const url = (b.url ?? '').toLowerCase();
    const folderPath = (b.folderPath ?? '').toLowerCase();
    const domain = (b.domain ?? '').toLowerCase();

    const matchedTerms: string[] = [];
    const matchedIn: MatchedIn[] = [];
    let score = 0;

    for (const term of terms) {
      if (title.includes(term)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedIn.includes('title')) matchedIn.push('title');
        score += FIELD_WEIGHTS.title;
      }
      if (url.includes(term)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedIn.includes('url')) matchedIn.push('url');
        score += FIELD_WEIGHTS.url;
      }
      if (folderPath.includes(term)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedIn.includes('folderPath')) matchedIn.push('folderPath');
        score += FIELD_WEIGHTS.folderPath;
      }
      if (domain.includes(term)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedIn.includes('domain')) matchedIn.push('domain');
        score += FIELD_WEIGHTS.domain;
      }
    }

    if (matchedTerms.length > 0) {
      const termBonus = matchedTerms.length / terms.length;
      results.push({ bookmarkId: id, matchedTerms, matchedIn, score: score + termBonus });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
