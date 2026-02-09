/**
 * Parse query operators: site:, folder:, quoted phrases, -exclusions, OR.
 * On parse failure, treats input as plain text.
 */

export interface ParsedQuery {
  terms: string[];
  excludeTerms: string[];
  phrases: string[];
  domain?: string;
  folder?: string;
  orGroups: string[][];
  /** Raw text for embedding (terms + phrases, excluding operators) */
  searchText: string;
}

const MIN_TERM_LENGTH = 2;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .split(/\W+/)
    .filter((t) => t.length >= MIN_TERM_LENGTH);
}

export function parseQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { terms: [], excludeTerms: [], phrases: [], orGroups: [], searchText: '' };
  }

  try {
    let rest = trimmed;
    let domainResult: string | undefined;
    let folderResult: string | undefined;
    const phrases: string[] = [];
    const excludeTerms: string[] = [];

    const siteRe = /\b(?:site|domain):(\S+)/gi;
    let m = siteRe.exec(rest);
    if (m) {
      domainResult = m[1];
      rest = rest.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    }

    const folderRe = /\bfolder:(?:"([^"]*)"|(\S+))/i;
    m = folderRe.exec(rest);
    if (m) {
      folderResult = (m[1] ?? m[2] ?? '').trim();
      rest = rest.replace(m[0], ' ').replace(/\s+/g, ' ').trim();
    }

    const quoteRe = /"([^"]+)"/g;
    let qm;
    while ((qm = quoteRe.exec(rest)) !== null) {
      phrases.push(qm[1].trim());
    }
    rest = rest.replace(quoteRe, ' ').replace(/\s+/g, ' ').trim();

    const excludeRe = /(?:^|\s)-([a-zA-Z0-9]+)(?=\s|$)/g;
    let em;
    while ((em = excludeRe.exec(rest)) !== null) {
      const term = em[1].toLowerCase();
      if (term.length >= MIN_TERM_LENGTH) excludeTerms.push(term);
    }
    rest = rest.replace(/(?:^|\s)-[a-zA-Z0-9]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();

    const orParts = rest.split(/\s+OR\s+/i);
    const orGroups: string[][] = orParts.map((p) => tokenize(p)).filter((g) => g.length > 0);
    const terms = orGroups.length === 1 ? orGroups[0] : orGroups.flat();
    const searchText = [...new Set([...terms, ...phrases])].join(' ');

    return {
      terms,
      excludeTerms,
      phrases,
      domain: domainResult,
      folder: folderResult || undefined,
      orGroups: orGroups.length > 1 ? orGroups : [],
      searchText,
    };
  } catch {
    const terms = tokenize(trimmed);
    return {
      terms,
      excludeTerms: [],
      phrases: [],
      orGroups: terms.length > 0 ? [terms] : [],
      searchText: trimmed,
    };
  }
}
