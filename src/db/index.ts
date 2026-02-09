import Dexie, { type EntityTable } from 'dexie';

export interface Bookmark {
  id?: number;
  url: string;
  title: string;
  domain: string;
  folderPath: string;
  addDate: number | null;
  createdAt: number;
}

export interface Embedding {
  id?: number;
  bookmarkId: number;
  vector: number[];
  modelName: string;
  createdAt: number;
}

export interface ImportRecord {
  importId?: number;
  status: 'pending' | 'success' | 'failure';
  counts: { added: number; skipped: number; failed: number };
  createdAt: number;
  error: string | null;
}

class ShelfDb extends Dexie {
  bookmarks!: EntityTable<Bookmark, 'id'>;
  embeddings!: EntityTable<Embedding, 'id'>;
  imports!: EntityTable<ImportRecord, 'importId'>;

  constructor() {
    super('ShelfEngine');
    this.version(1).stores({
      bookmarks: '++id, &url, folderPath, domain, addDate, createdAt',
      embeddings: '++id, &bookmarkId, modelName, createdAt',
      imports: '++importId, status, createdAt',
    });
  }
}

export const db = new ShelfDb();
