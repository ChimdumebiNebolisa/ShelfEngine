/**
 * Web Worker: loads transformers.js and computes embeddings for batches of strings.
 * Runs off the main thread to avoid blocking the UI.
 */

import { pipeline, env } from '@huggingface/transformers';

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
env.cacheDir = 'transformers-cache';
env.allowLocalModels = false;

let embedder: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getEmbedder() {
  if (embedder) return embedder;
  embedder = await pipeline('feature-extraction', MODEL_NAME);
  return embedder;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const model = await getEmbedder();
  const vectors: number[][] = [];

  for (const text of texts) {
    const output = await model(text, { pooling: 'mean', normalize: true });
    vectors.push(Array.from(output.data as Float32Array));
  }

  return vectors;
}

self.onmessage = async (e: MessageEvent<{ type: 'embed'; texts: string[] }>) => {
  if (e.data?.type !== 'embed' || !Array.isArray(e.data.texts)) {
    self.postMessage({ type: 'error', message: 'Invalid message' });
    return;
  }
  try {
    const vectors = await embedBatch(e.data.texts);
    self.postMessage({ type: 'result', vectors });
  } catch (err) {
    self.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  }
};
