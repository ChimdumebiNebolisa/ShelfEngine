/**
 * Prepares bookmark text for embedding (title + hostname + folder path per spec),
 * runs embedding in a worker, and persists to the embeddings store.
 */

import { db } from '../db';
import type { Bookmark } from '../db';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const BATCH_SIZE = 24;

export function embeddingText(b: Bookmark): string {
  const parts = [b.title || '', b.domain || '', b.folderPath || ''].filter(Boolean);
  return parts.join(' | ') || b.url;
}

export type IndexingProgress = {
  done: number;
  total: number;
  error: string | null;
};

/**
 * Find bookmarks that don't have an embedding yet, then generate and store embeddings.
 * Reports progress via onProgress. Runs all work in a worker (embedding) and main thread only for DB I/O.
 */
export async function buildIndex(onProgress?: (p: IndexingProgress) => void): Promise<{ indexed: number; error: string | null }> {
  const bookmarks = await db.bookmarks.toArray();
  const existing = await db.embeddings.toArray();
  const hasEmbedding = new Set(existing.map((e) => e.bookmarkId));
  const toEmbed = bookmarks.filter((b) => b.id != null && !hasEmbedding.has(b.id));

  if (toEmbed.length === 0) {
    onProgress?.({ done: bookmarks.length, total: bookmarks.length, error: null });
    return { indexed: 0, error: null };
  }

  const total = toEmbed.length;
  let done = 0;

  const worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), { type: 'module' });

  const saveBatch = async (batch: { id: number; text: string }[], vectors: number[][]) => {
    const now = Date.now();
    for (let i = 0; i < batch.length; i++) {
      await db.embeddings.add({
        bookmarkId: batch[i].id,
        vector: vectors[i],
        modelName: MODEL_NAME,
        createdAt: now,
      });
    }
    done += batch.length;
    onProgress?.({ done, total, error: null });
  };

  try {
    for (let i = 0; i < toEmbed.length; i += BATCH_SIZE) {
      const slice = toEmbed.slice(i, i + BATCH_SIZE);
      const batch = slice.map((b) => ({ id: b.id!, text: embeddingText(b) }));

      const result = await new Promise<{ vectors: number[][] }>((resolve, reject) => {
        const handler = (e: MessageEvent) => {
          const d = e.data as { type: string; vectors?: number[][]; message?: string };
          if (d.type === 'result' && d.vectors) {
            worker.removeEventListener('message', handler);
            resolve({ vectors: d.vectors });
          } else if (d.type === 'error') {
            worker.removeEventListener('message', handler);
            reject(new Error(d.message ?? 'Embedding failed'));
          }
        };
        worker.addEventListener('message', handler);
        worker.postMessage({ type: 'embed', texts: batch.map((x) => x.text) });
      });

      await saveBatch(batch, result.vectors);
    }

    worker.terminate();
    return { indexed: done, error: null };
  } catch (err) {
    worker.terminate();
    const message = err instanceof Error ? err.message : String(err);
    onProgress?.({ done, total, error: message });
    return { indexed: done, error: message };
  }
}

/**
 * Embed a single string (e.g. search query) in a worker. Returns one vector.
 * Used by search to get query vector for cosine similarity.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), { type: 'module' });
  try {
    const result = await new Promise<number[]>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        const d = e.data as { type: string; vectors?: number[][]; message?: string };
        if (d.type === 'result' && d.vectors?.[0]) {
          worker.removeEventListener('message', handler);
          resolve(d.vectors[0]);
        } else if (d.type === 'error') {
          worker.removeEventListener('message', handler);
          reject(new Error(d.message ?? 'Embedding failed'));
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'embed', texts: [text] });
    });
    return result;
  } finally {
    worker.terminate();
  }
}

/**
 * Embed a single bookmark and save to the embeddings store. Used by sync/ingest when a bookmark is upserted.
 */
export async function embedSingleBookmark(bookmark: Bookmark & { id: number }): Promise<void> {
  const worker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), { type: 'module' });
  try {
    const text = embeddingText(bookmark);
    const result = await new Promise<number[]>((resolve, reject) => {
      const handler = (e: MessageEvent) => {
        const d = e.data as { type: string; vectors?: number[][]; message?: string };
        if (d.type === 'result' && d.vectors?.[0]) {
          worker.removeEventListener('message', handler);
          resolve(d.vectors[0]);
        } else if (d.type === 'error') {
          worker.removeEventListener('message', handler);
          reject(new Error(d.message ?? 'Embedding failed'));
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'embed', texts: [text] });
    });
    const now = Date.now();
    await db.embeddings.where('bookmarkId').equals(bookmark.id).delete();
    await db.embeddings.add({
      bookmarkId: bookmark.id,
      vector: result,
      modelName: MODEL_NAME,
      createdAt: now,
    });
  } finally {
    worker.terminate();
  }
}

/**
 * Count of bookmarks that have embeddings. Used to show "run one query" or index status.
 */
export async function getEmbeddingStats(): Promise<{ total: number; withEmbedding: number }> {
  const [total, withEmbedding] = await Promise.all([
    db.bookmarks.count(),
    db.embeddings.count(),
  ]);
  return { total, withEmbedding };
}
