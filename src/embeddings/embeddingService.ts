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

// Long-lived worker and queue for query/single-bookmark embedding (not used by buildIndex).
const QUERY_CACHE_MAX = 50;
const queryCache = new Map<string, number[]>();
const queryCacheOrder: string[] = [];

function cacheGet(key: string): number[] | undefined {
  return queryCache.get(key);
}

function cacheSet(key: string, vector: number[]): void {
  if (queryCache.size >= QUERY_CACHE_MAX && queryCacheOrder.length > 0) {
    const oldest = queryCacheOrder.shift();
    if (oldest != null) queryCache.delete(oldest);
  }
  if (!queryCache.has(key)) queryCacheOrder.push(key);
  queryCache.set(key, vector);
}

interface QueueItem {
  texts: string[];
  resolve: (vectors: number[][]) => void;
  reject: (err: Error) => void;
}

let queryWorker: Worker | null = null;
let queryQueue: QueueItem[] = [];
let queryWorkerBusy = false;

function getQueryWorker(): Worker {
  if (queryWorker == null) {
    queryWorker = new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), { type: 'module' });
  }
  return queryWorker;
}

function processQueryQueue(): void {
  if (queryWorkerBusy || queryQueue.length === 0) return;
  const item = queryQueue.shift();
  if (!item) return;
  queryWorkerBusy = true;
  const worker = getQueryWorker();
  const handler = (e: MessageEvent) => {
    const d = e.data as { type: string; vectors?: number[][]; message?: string };
    if (d.type === 'result' && d.vectors) {
      worker.removeEventListener('message', handler);
      queryWorkerBusy = false;
      item.resolve(d.vectors);
      processQueryQueue();
    } else if (d.type === 'error') {
      worker.removeEventListener('message', handler);
      queryWorkerBusy = false;
      item.reject(new Error(d.message ?? 'Embedding failed'));
      processQueryQueue();
    }
  };
  worker.addEventListener('message', handler);
  worker.postMessage({ type: 'embed', texts: item.texts });
}

function embedViaWorker(texts: string[]): Promise<number[][]> {
  return new Promise((resolve, reject) => {
    queryQueue.push({ texts, resolve, reject });
    processQueryQueue();
  });
}

/**
 * Embed a single string (e.g. search query) in a worker. Returns one vector.
 * Uses a long-lived worker and a small cache for repeated queries.
 */
export async function embedQuery(text: string): Promise<number[]> {
  const key = text.trim().toLowerCase() || ' ';
  const cached = cacheGet(key);
  if (cached != null) return cached;
  const toEmbed = text.trim() || ' ';
  const [vectors] = await embedViaWorker([toEmbed]);
  cacheSet(key, vectors);
  return vectors;
}

/**
 * Embed a single bookmark and save to the embeddings store. Used by sync/ingest when a bookmark is upserted.
 * Uses the same long-lived query worker queue as embedQuery.
 */
export async function embedSingleBookmark(bookmark: Bookmark & { id: number }): Promise<void> {
  const text = embeddingText(bookmark);
  const [result] = await embedViaWorker([text]);
  const now = Date.now();
  await db.embeddings.where('bookmarkId').equals(bookmark.id).delete();
  await db.embeddings.add({
    bookmarkId: bookmark.id,
    vector: result,
    modelName: MODEL_NAME,
    createdAt: now,
  });
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
