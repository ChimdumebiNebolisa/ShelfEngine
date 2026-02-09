import { db } from '../db';
import { parseBookmarksHtml } from './parseBookmarksHtml';
import { normalizeUrl, getDomain } from './normalizeUrl';

export type ImportMode = 'merge' | 'replace';

/** Clear all bookmarks and embeddings. */
export async function clearAllBookmarks(): Promise<void> {
  await db.bookmarks.clear();
  await db.embeddings.clear();
}

export interface ImportResult {
  importId: number;
  status: 'success' | 'failure';
  counts: { added: number; skipped: number; failed: number };
  error: string | null;
}

export async function runImport(
  file: File,
  mode: ImportMode
): Promise<ImportResult> {
  const text = await file.text();
  const createdAt = Date.now();

  const importId = await db.imports.add({
    status: 'pending',
    counts: { added: 0, skipped: 0, failed: 0 },
    createdAt,
    error: null,
  });

  try {
    const parsed = parseBookmarksHtml(text);
    const counts = { added: 0, skipped: 0, failed: 0 };

    if (mode === 'replace') {
      await db.bookmarks.clear();
      await db.embeddings.clear();
    }

    const existingUrls = new Set<string>();
    if (mode === 'merge') {
      const existing = await db.bookmarks.toArray();
      existing.forEach((b) => existingUrls.add(b.url));
    }

    for (const p of parsed) {
      const url = normalizeUrl(p.url);
      if (mode === 'merge' && existingUrls.has(url)) {
        counts.skipped++;
        continue;
      }
      try {
        const domain = getDomain(p.url);
        await db.bookmarks.put({
          url,
          title: p.title.trim() || url,
          domain,
          folderPath: p.folderPath,
          addDate: p.addDate,
          createdAt,
        });
        counts.added++;
        if (mode === 'merge') existingUrls.add(url);
      } catch (err) {
        counts.failed++;
      }
    }

    await db.imports.update(importId, {
      status: 'success',
      counts,
      error: null,
    });

    return {
      importId,
      status: 'success',
      counts,
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.imports.update(importId, {
      status: 'failure',
      counts: { added: 0, skipped: 0, failed: 0 },
      error: message,
    });
    return {
      importId,
      status: 'failure',
      counts: { added: 0, skipped: 0, failed: 0 },
      error: message,
    };
  }
}
