import MiniSearch from 'minisearch';
import { db, type Bookmark } from '../db';

type MiniDoc = {
  id: number;
  title: string;
  url: string;
  domain: string;
  folderPath: string;
};

export const MINI_SEARCH_OPTIONS = {
  prefix: true,
  fuzzy: 0.15,
  boost: {
    title: 2,
    domain: 1.5,
    folderPath: 1,
    url: 0.8,
  },
} as const;

let cachedIndex: MiniSearch<MiniDoc> | null = null;
let indexBuildPromise: Promise<MiniSearch<MiniDoc>> | null = null;

function toMiniDoc(bookmark: Bookmark): MiniDoc | null {
  if (bookmark.id == null) return null;
  return {
    id: bookmark.id,
    title: bookmark.title ?? '',
    url: bookmark.url ?? '',
    domain: bookmark.domain ?? '',
    folderPath: bookmark.folderPath ?? '',
  };
}

export async function getMiniIndex(): Promise<MiniSearch<MiniDoc>> {
  if (cachedIndex) return cachedIndex;
  if (indexBuildPromise) return indexBuildPromise;

  indexBuildPromise = (async () => {
    const bookmarks = await db.bookmarks.toArray();
    const docs: MiniDoc[] = [];
    for (const bookmark of bookmarks) {
      const doc = toMiniDoc(bookmark);
      if (doc) docs.push(doc);
    }

    const mini = new MiniSearch<MiniDoc>({
      fields: ['title', 'domain', 'folderPath', 'url'],
      storeFields: ['id', 'title', 'url', 'domain', 'folderPath'],
      idField: 'id',
    });
    mini.addAll(docs);
    cachedIndex = mini;
    return mini;
  })().finally(() => {
    indexBuildPromise = null;
  });

  return indexBuildPromise;
}

export function invalidateMiniIndex(): void {
  cachedIndex = null;
  indexBuildPromise = null;
}
