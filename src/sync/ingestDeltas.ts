/**
 * Ingest bookmark deltas from the Chrome extension. Apply upserts and removes to Dexie;
 * on upsert, recompute embedding via the existing worker path.
 */

import { db } from '../db';
import type { Bookmark } from '../db';
import { normalizeUrl, getDomain } from '../import/normalizeUrl';
import { embedSingleBookmark } from '../embeddings/embeddingService';

export type DeltaUpsert = {
  url: string;
  title: string;
  folderPath: string;
  addDate: number | null;
  domain?: string;
};

export type DeltaRemove = { url: string };

export type BookmarkDelta = { upsert?: DeltaUpsert } | { remove?: DeltaRemove };

function isUpsert(d: BookmarkDelta): d is { upsert: DeltaUpsert } {
  return 'upsert' in d && d.upsert != null;
}

function isRemove(d: BookmarkDelta): d is { remove: DeltaRemove } {
  return 'remove' in d && d.remove != null;
}

/**
 * Apply a list of deltas to the bookmarks and embeddings stores.
 * Upserts normalize URL, put bookmark, then compute and store embedding.
 * Removes delete by normalized URL and clear the embedding.
 */
export async function ingestDeltas(deltas: BookmarkDelta[]): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = [];
  let applied = 0;

  for (const d of deltas) {
    try {
      if (isRemove(d)) {
        const url = normalizeUrl(d.remove.url);
        const existing = await db.bookmarks.where('url').equals(url).first();
        if (existing?.id != null) {
          await db.embeddings.where('bookmarkId').equals(existing.id).delete();
          await db.bookmarks.delete(existing.id);
          applied++;
        }
        continue;
      }

      if (isUpsert(d)) {
        const u = d.upsert;
        const url = normalizeUrl(u.url);
        const domain = u.domain ?? getDomain(u.url);
        const now = Date.now();
        const existing = await db.bookmarks.where('url').equals(url).first();
        const bookmark: Bookmark = {
          ...(existing?.id != null ? { id: existing.id } : {}),
          url,
          title: (u.title || '').trim() || url,
          domain,
          folderPath: u.folderPath ?? '',
          addDate: u.addDate ?? null,
          createdAt: existing?.createdAt ?? now,
        };
        const id = await db.bookmarks.put(bookmark);
        const saved = await db.bookmarks.get(id);
        if (saved?.id != null) {
          await embedSingleBookmark(saved);
          applied++;
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { applied, errors };
}

/** Resync item from extension (full bookmark row for URL-canonical upsert). */
export type ResyncItem = {
  url: string;
  title: string;
  folderPath: string;
  addDate: number | null;
  domain: string;
};

/**
 * Ingest a full resync batch from the extension (Path A: URL-canonical, no destructive sync).
 * Upserts by normalized url; only embeds bookmarks that do not yet have an embedding.
 */
export async function ingestResyncBatch(
  items: ResyncItem[]
): Promise<{ applied: number; errors: string[] }> {
  const errors: string[] = [];
  let applied = 0;

  for (const u of items) {
    try {
      const url = normalizeUrl(u.url);
      const domain = u.domain ?? getDomain(u.url);
      const now = Date.now();
      const existing = await db.bookmarks.where('url').equals(url).first();
      const bookmark: Bookmark = {
        ...(existing?.id != null ? { id: existing.id } : {}),
        url,
        title: (u.title || '').trim() || url,
        domain,
        folderPath: u.folderPath ?? '',
        addDate: u.addDate ?? null,
        createdAt: existing?.createdAt ?? now,
      };
      const id = await db.bookmarks.put(bookmark);
      const saved = await db.bookmarks.get(id);
      if (saved?.id != null) {
        applied++;
        const hasEmbedding = (await db.embeddings.where('bookmarkId').equals(saved.id).count()) > 0;
        if (!hasEmbedding) {
          await embedSingleBookmark(saved as Bookmark & { id: number });
        }
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  return { applied, errors };
}
