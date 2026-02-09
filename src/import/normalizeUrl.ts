/**
 * Normalize URL for deduplication: lowercase, no fragment, no trailing slash.
 */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${u.hostname.toLowerCase()}${path}`;
  } catch {
    return url;
  }
}

/**
 * Extract hostname for domain field. Returns empty string if URL is invalid.
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}
