/**
 * Retrieval: cosine similarity, semantic top-K, and keyword search.
 * Used by searchService to combine both paths (M4).
 */

import type { Bookmark } from '../db';
import type { ParsedQuery } from './queryParse';

const TOP_K = 10;
const MIN_TERM_LENGTH = 2;

const RECENCY_DAYS = 7;

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function termMatchesField(term: string, field: string): boolean {
  if (term.length < MIN_TERM_LENGTH) return false;
  const re = new RegExp(`\\b${escapeRegex(term)}\\b`, 'i');
  return re.test(field);
}

export function phraseMatchesField(text: string, phrase: string): boolean {
  if (!phrase || !text) return false;
  return text.toLowerCase().includes(phrase.toLowerCase());
}

export function isJunkTitle(title: string): boolean {
  const t = (title ?? '').trim().toLowerCase();
  if (t.length < 4) return true;
  return t === 'home' || t === 'untitled';
}

export function isRecent(bookmark: { addDate?: number | null; createdAt?: number }): boolean {
  const nowSec = Math.floor(Date.now() / 1000);
  const dateSec = bookmark.addDate ?? (bookmark.createdAt != null ? Math.floor(bookmark.createdAt / 1000) : null);
  if (dateSec == null) return false;
  return (nowSec - dateSec) <= RECENCY_DAYS * 24 * 3600;
}

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
    .filter((t) => t.length >= MIN_TERM_LENGTH);
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
  matchedPhrases?: { phrase: string; field: MatchedIn }[];
}

export function inferKeywordSignals(
  bookmark: Bookmark,
  parsed: ParsedQuery
): Omit<KeywordHit, 'bookmarkId' | 'score'> {
  const title = (bookmark.title ?? '').toLowerCase();
  const url = (bookmark.url ?? '').toLowerCase();
  const folderPath = (bookmark.folderPath ?? '').toLowerCase();
  const domain = (bookmark.domain ?? '').toLowerCase();
  const fields: Array<{ key: MatchedIn; value: string }> = [
    { key: 'title', value: title },
    { key: 'url', value: url },
    { key: 'folderPath', value: folderPath },
    { key: 'domain', value: domain },
  ];

  const matchedTerms: string[] = [];
  const matchedIn: MatchedIn[] = [];
  for (const term of parsed.terms) {
    for (const field of fields) {
      if (termMatchesField(term, field.value)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedIn.includes(field.key)) matchedIn.push(field.key);
      }
    }
  }

  const matchedPhrases: { phrase: string; field: MatchedIn }[] = [];
  for (const phrase of parsed.phrases) {
    for (const field of fields) {
      if (phraseMatchesField(field.value, phrase)) {
        matchedPhrases.push({ phrase, field: field.key });
        break;
      }
    }
  }

  return {
    matchedTerms,
    matchedIn,
    matchedPhrases: matchedPhrases.length > 0 ? matchedPhrases : undefined,
  };
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
      if (termMatchesField(term, title)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedIn.includes('title')) matchedIn.push('title');
        score += FIELD_WEIGHTS.title;
      }
      if (termMatchesField(term, url)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedIn.includes('url')) matchedIn.push('url');
        score += FIELD_WEIGHTS.url;
      }
      if (termMatchesField(term, folderPath)) {
        if (!matchedTerms.includes(term)) matchedTerms.push(term);
        if (!matchedIn.includes('folderPath')) matchedIn.push('folderPath');
        score += FIELD_WEIGHTS.folderPath;
      }
      if (termMatchesField(term, domain)) {
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

export function bookmarkMatchesExclude(b: Bookmark, excludeTerms: string[]): boolean {
  if (excludeTerms.length === 0) return false;
  const title = (b.title ?? '').toLowerCase();
  const url = (b.url ?? '').toLowerCase();
  const folderPath = (b.folderPath ?? '').toLowerCase();
  const domain = (b.domain ?? '').toLowerCase();
  for (const term of excludeTerms) {
    if (termMatchesField(term, title) || termMatchesField(term, url) ||
        termMatchesField(term, folderPath) || termMatchesField(term, domain)) {
      return true;
    }
  }
  return false;
}

export function bookmarkMatchesOrGroup(b: Bookmark, terms: string[]): boolean {
  if (terms.length === 0) return false;
  const title = (b.title ?? '').toLowerCase();
  const url = (b.url ?? '').toLowerCase();
  const folderPath = (b.folderPath ?? '').toLowerCase();
  const domain = (b.domain ?? '').toLowerCase();
  for (const term of terms) {
    if (!termMatchesField(term, title) && !termMatchesField(term, url) &&
        !termMatchesField(term, folderPath) && !termMatchesField(term, domain)) {
      return false;
    }
  }
  return true;
}

function scoreBookmarkTerms(b: Bookmark, terms: string[]): { matchedTerms: string[]; matchedIn: MatchedIn[]; score: number } {
  const title = (b.title ?? '').toLowerCase();
  const url = (b.url ?? '').toLowerCase();
  const folderPath = (b.folderPath ?? '').toLowerCase();
  const domain = (b.domain ?? '').toLowerCase();
  const matchedTerms: string[] = [];
  const matchedIn: MatchedIn[] = [];
  let score = 0;
  for (const term of terms) {
    if (termMatchesField(term, title)) {
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
      if (!matchedIn.includes('title')) matchedIn.push('title');
      score += FIELD_WEIGHTS.title;
    }
    if (termMatchesField(term, url)) {
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
      if (!matchedIn.includes('url')) matchedIn.push('url');
      score += FIELD_WEIGHTS.url;
    }
    if (termMatchesField(term, folderPath)) {
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
      if (!matchedIn.includes('folderPath')) matchedIn.push('folderPath');
      score += FIELD_WEIGHTS.folderPath;
    }
    if (termMatchesField(term, domain)) {
      if (!matchedTerms.includes(term)) matchedTerms.push(term);
      if (!matchedIn.includes('domain')) matchedIn.push('domain');
      score += FIELD_WEIGHTS.domain;
    }
  }
  return { matchedTerms, matchedIn, score };
}

function phraseMatchesBookmark(b: Bookmark, phrase: string): { phrase: string; field: MatchedIn } | null {
  const title = (b.title ?? '').toLowerCase();
  const url = (b.url ?? '').toLowerCase();
  const folderPath = (b.folderPath ?? '').toLowerCase();
  const domain = (b.domain ?? '').toLowerCase();
  const p = phrase.toLowerCase();
  if (phraseMatchesField(title, p)) return { phrase, field: 'title' };
  if (phraseMatchesField(url, p)) return { phrase, field: 'url' };
  if (phraseMatchesField(folderPath, p)) return { phrase, field: 'folderPath' };
  if (phraseMatchesField(domain, p)) return { phrase, field: 'domain' };
  return null;
}

export function keywordSearchStructured(bookmarks: Bookmark[], parsed: ParsedQuery): KeywordHit[] {
  const { terms, excludeTerms, phrases, orGroups } = parsed;
  const hasTerms = terms.length > 0;
  const hasPhrases = phrases.length > 0;
  if (!hasTerms && !hasPhrases) return [];

  const results: KeywordHit[] = [];
  for (const b of bookmarks) {
    if (b.id == null) continue;
    if (bookmarkMatchesExclude(b, excludeTerms)) continue;

    let matchedTerms: string[] = [];
    const matchedIn: MatchedIn[] = [];
    let score = 0;

    if (orGroups.length > 1) {
      let orMatch = false;
      for (const group of orGroups) {
        if (bookmarkMatchesOrGroup(b, group)) {
          orMatch = true;
          const r = scoreBookmarkTerms(b, group);
          for (const t of r.matchedTerms) {
            if (!matchedTerms.includes(t)) matchedTerms.push(t);
          }
          for (const f of r.matchedIn) {
            if (!matchedIn.includes(f)) matchedIn.push(f);
          }
          score = Math.max(score, r.score);
        }
      }
      if (!orMatch) continue;
    } else if (hasTerms) {
      const r = scoreBookmarkTerms(b, terms);
      if (r.matchedTerms.length === 0) continue;
      matchedTerms = r.matchedTerms;
      matchedIn.push(...r.matchedIn);
      score = r.score;
    }

    const matchedPhrases: { phrase: string; field: MatchedIn }[] = [];
    for (const phrase of phrases) {
      const pm = phraseMatchesBookmark(b, phrase);
      if (pm) {
        matchedPhrases.push(pm);
        score += 2;
      }
    }

    if (matchedTerms.length > 0 || matchedPhrases.length > 0) {
      const termBonus = hasTerms ? matchedTerms.length / terms.length : 0;
      results.push({
        bookmarkId: b.id,
        matchedTerms,
        matchedIn: [...new Set(matchedIn)],
        score: score + termBonus,
        matchedPhrases: matchedPhrases.length > 0 ? matchedPhrases : undefined,
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}
