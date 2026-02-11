# ShelfEngine — Technical Architecture

This document describes how ShelfEngine works end-to-end as implemented in the repository. It is intended for recruiters and contributors to understand the system quickly. It does not describe planned or speculative features except where explicitly labeled.

**Key files referenced:**

| Area | Files |
|------|--------|
| Spec & guardrails | `docs/SPEC.md`, `docs/GUARDRAILS.md`, `docs/MILESTONES.md` |
| Database | `src/db/index.ts` |
| Import | `src/import/parseBookmarksHtml.ts`, `src/import/importService.ts`, `src/import/normalizeUrl.ts` |
| Embeddings | `src/embeddings/embeddingService.ts`, `src/workers/embedding.worker.ts` |
| Search | `src/search/queryParse.ts`, `src/search/retrieval.ts`, `src/search/miniIndex.ts`, `src/search/searchService.ts`, `src/search/searchHarness.ts` (dev-only) |
| Sync (extension bridge) | `src/sync/ingestDeltas.ts` (ingestDeltas, ingestResyncBatch), `src/App.tsx` (postMessage) |
| App shell | `src/App.tsx`, `src/layouts/AppLayout.tsx`, `src/layouts/LandingLayout.tsx`, `src/main.tsx` |
| Pages | `src/pages/LandingPage.tsx`, `ImportPage.tsx`, `SearchPage.tsx`, `ChatPage.tsx` |
| Shared UI | `src/components/SearchResultCard.tsx`, `src/index.css` |
| Build & PWA | `vite.config.ts`, `index.html` |
| Extension | `extension/background.ts`, `extension/contentScript.ts`, `extension/popup.html`, `extension/manifest.json` |

---

## 1) Overview

### What ShelfEngine is

- A **local-first web app** for importing browser bookmarks (Chrome export HTML) and retrieving them via **keyword and semantic search** and a **chat-style query UI**.
- Users find links by intent (natural language or keywords), not by folder structure. All bookmark data and embeddings stay in the browser (IndexedDB).
- No backend or login is required for core usage.

### What ShelfEngine is not

- Not a live sync product by default (optional extension sync exists; see §12).
- Does not fetch or index page content; only title, URL, hostname, and folder path are used.
- Chat is **retrieval-only**: no generative/LM responses; each message runs a semantic query and returns ranked bookmarks with “why matched” explanations.

### Local-first guarantee

- All bookmark records and embedding vectors are stored in IndexedDB on the client.
- No bookmark or query data is sent to any server unless the user explicitly opts in (e.g. future optional backup).
- Embeddings are computed in the browser via a Web Worker using a local model (transformers.js).

### Supported scale and performance targets

- **Scale:** Designed for on the order of **1,000 bookmarks**.
- **Indexing:** Target **under 60 seconds** for building the embedding index.
- **Query:** Target **under 500 ms** after the index exists (see `docs/SPEC.md`, `docs/GUARDRAILS.md`).

---

## 2) Tech Stack

| Layer | Choice |
|-------|--------|
| **Framework** | React 18 |
| **Build** | Vite 5 |
| **Language** | TypeScript 5 |
| **Routing** | react-router-dom v6 |
| **Storage** | IndexedDB via **Dexie** v4 (`src/db/index.ts`) |
| **Embeddings** | @huggingface/transformers (transformers.js), model `Xenova/all-MiniLM-L6-v2` |
| **Worker** | Native Web Worker; one short-lived worker per full index build; one long-lived worker + queue for query embedding and single-bookmark embedding |
| **PWA** | vite-plugin-pwa (Workbox): auto-update service worker, cache-first for assets and optional runtime caching (e.g. fonts) |

**UI structure:** Single React tree; `main.tsx` → `BrowserRouter` → `App` → `Routes` with `LandingLayout` (/) or `AppLayout` (/import, /search, /chat). `AppLayout` provides sidebar + main; `LandingLayout` is minimal. No global state library; page-level `useState` and service calls.

---

## 3) High-level system diagram (ASCII)

```
+------------------------------------------------------------------+
|                         index.html + Vite                         |
|  main.tsx → BrowserRouter → App → Routes (LandingLayout | AppLayout) |
+------------------------------------------------------------------+
         |                    |                    |                    |
         v                    v                    v                    v
+-------------+    +----------------+    +----------------+    +----------------+
| LandingPage |    |  ImportPage    |    |  SearchPage    |    |   ChatPage     |
| /           |    |  /import       |    |  /search       |    |   /chat        |
| CTA, chips  |    |  file upload   |    |  query + filters|    |  query → search|
+-------------+    |  merge/replace |    |  debounced     |    |  turns + cards |
                   |  Build index   |    |  search()      |    |  same search() |
                   +-------+--------+    +-------+--------+    +--------+-------+
                           |                     |                     |
                           v                     v                     v
                   +----------------+    +----------------+    +----------------+
                   | importService  |    | searchService  |    | searchService  |
                   | runImport()   |    | search()      |    | search()       |
                   | clearAll()    |    | getFilterOpts()|    |                 |
                   +-------+--------+    +-------+--------+    +----------------+
                           |                     |
           +---------------+                     +----------------+
           v                                       v
   +---------------+                    +------------------+
   | parseBookmarks |                    | embeddingService |
   | Html()         |                    | embedQuery()     |
   | normalizeUrl() |                    | buildIndex()    |
   +-------+--------+                    +--------+---------+
           |                                       |
           v                                       v
   +----------------+                    +------------------+
   | Dexie (db)     |<------------------| embedding.worker |
   | bookmarks      |                    | (transformers.js)|
   | embeddings     |                    +------------------+
   | imports        |
   +-------+--------+
           ^
           | ingestDeltas() / ingestResyncBatch() (from extension via postMessage in App)
   +-------+--------+
   | extension      |
   | background.ts  | ← popup.html (RESYNC_ALL, status)
   | contentScript  | → window.postMessage → App (SHELFENGINE_DELTAS, SHELFENGINE_RESYNC)
   +----------------+
```

**Data flow in short:**

- **Import:** File → `parseBookmarksHtml` → `normalizeUrl` / dedupe → `db.bookmarks` (+ `db.imports`). User then clicks “Build index” → `buildIndex()` → worker embeds text → `db.embeddings`.
- **Search/Chat:** User query → `parseQuery()` → `embedQuery()` (worker) → `loadBookmarksAndEmbeddings()` from Dexie → `semanticTopK` (k=50) + `keywordSearchStructured` in `retrieval.ts` → merge/rank in `searchService.search()` → strong results + related fallback → results with `whyMatched`, `matchTier` → `SearchResultCard`.
- **Extension:** Background listens to `chrome.bookmarks`; pushes deltas to queue (or sends to content script). Popup offers “Open ShelfEngine” and “Resync all bookmarks”; resync crawls `chrome.bookmarks.getTree()`, flattens with folderPath, stores pending batch and/or sends in chunks (500) to open ShelfEngine tab. Content script posts `SHELFENGINE_DELTAS` and `SHELFENGINE_RESYNC` to window; `App` receives and calls `ingestDeltas()` or `ingestResyncBatch()` (Path A: URL-canonical upsert only; embed only when bookmark has no embedding). App sends `SHELFENGINE_ACK` / `SHELFENGINE_RESYNC_ACK`; background clears queue / pending resync and sets last sync time.

---

## 4) Data model and storage

**Dexie database name:** `ShelfEngine` (`src/db/index.ts`).

### Object stores (tables)

| Store | Key | Indexes | Purpose |
|-------|-----|---------|---------|
| **bookmarks** | `++id` (auto-increment) | `&url`, `folderPath`, `domain`, `addDate`, `createdAt` | One row per bookmark. `url` is unique (used for dedupe). |
| **embeddings** | `++id` | `&bookmarkId`, `modelName`, `createdAt` | One vector per bookmark per model; `bookmarkId` unique. |
| **imports** | `++importId` | `status`, `createdAt` | One row per import job for status and counts. |

### Bookmark schema (TypeScript)

- `id?`, `url`, `title`, `domain`, `folderPath`, `addDate` (number | null), `createdAt` (number).

### Embedding schema

- `id?`, `bookmarkId`, `vector` (number[]), `modelName`, `createdAt`.

### Import record schema

- `importId?`, `status`: `'pending' | 'success' | 'failure'`, `counts`: `{ added, skipped, failed }`, `createdAt`, `error` (string | null).

### URL normalization and dedupe

- Implemented in `src/import/normalizeUrl.ts`: `normalizeUrl(url)` → lowercase hostname, strip fragment, strip trailing slash from path (path defaults to `/` if empty). Dedupe in `importService.runImport()`: **merge** mode keeps a set of existing URLs and skips parsed entries whose `normalizeUrl(parsed.url)` is already in that set; **replace** mode clears `bookmarks` and `embeddings` then inserts all. Bookmark rows are stored with the normalized URL; the unique index on `url` enforces one row per URL.

### Import job tracking

- Each `runImport()` creates an **import record** in `db.imports` with `status: 'pending'`, then updates it to `success` or `failure` with `counts` and optional `error`. The UI reads this to show added/skipped/failed and errors (`ImportPage.tsx`).

---

## 5) Bookmark import pipeline

### Where the HTML file is parsed

- **File:** `src/import/parseBookmarksHtml.ts`. Function: `parseBookmarksHtml(html: string): ParsedBookmark[]`.
- Uses `DOMParser` to parse the file as HTML, then walks the DOM. No network; parsing is in the main thread (file already in memory).

### Folder path extraction

- The parser maintains a **folder stack** while walking the tree. On `<H3>` it pushes the folder name and recurses into the following `<DL>`; on `<A>` it uses the current stack joined by `'/'` as `folderPath`. Structure: `DL` → `DT` → first child (`H3` for folder or `A` for link). So folder path is the sequence of `H3` titles from root to the link’s parent.

### Merge vs replace

- **Replace** (`src/import/importService.ts`): before processing parsed list, `db.bookmarks.clear()` and `db.embeddings.clear()`.
- **Merge:** load all existing bookmarks, build `existingUrls = new Set(existing.map(b => b.url))`. For each parsed item, `url = normalizeUrl(p.url)`; if `existingUrls.has(url)` skip (and increment `counts.skipped`); otherwise insert and add URL to `existingUrls`. So merge = add new, skip duplicate URL, leave existing data (and their embeddings) intact.

### Error handling and validation

- Invalid URLs in the parser: only links with `href` starting with `http` are included; no exception for malformed URL in parser. In import service, `normalizeUrl` and `getDomain` catch and return fallbacks (e.g. original url or empty string). Per-bookmark insert failures increment `counts.failed` and the loop continues. Top-level parse or unexpected errors are caught; the import record is updated to `status: 'failure'` with `error` message and that is returned to the UI.

---

## 6) Indexing and embeddings

### Embedding model

- **Exact identifier:** `Xenova/all-MiniLM-L6-v2` (constant `MODEL_NAME` in `src/embeddings/embeddingService.ts` and `src/workers/embedding.worker.ts`).

### Text that is embedded

- Per spec: **title + hostname + folder path**. Implemented as: `embeddingText(b)` in `embeddingService.ts` builds `[b.title, b.domain, b.folderPath].filter(Boolean).join(' | ')` or falls back to `b.url` if empty. Example: `Awesome Coupons | example.com | Bookmarks Bar/Shopping/Deals`.

### Where embeddings are stored and keyed

- **Store:** Dexie table `embeddings` (`src/db/index.ts`). Each row: `bookmarkId` (links to `bookmarks.id`), `vector` (number[]), `modelName`, `createdAt`. Index `&bookmarkId` implies one embedding per bookmark per logical model (in practice one embedding per bookmark). Built by `buildIndex()` or `embedSingleBookmark()`.

### How indexing progress is reported to the UI

- `buildIndex(onProgress?: (p: IndexingProgress) => void)` in `embeddingService.ts` is called from `ImportPage` with a callback. `IndexingProgress` is `{ done, total, error }`. After each batch is written to Dexie, the callback is invoked with updated `done`/`total`; on error, `error` is set and passed once. The Import page shows a progress bar and “Indexing… done/total” and any error string.

### Worker creation, messaging, and termination

- **Full index build:** A **new** Worker is created with `new Worker(new URL('../workers/embedding.worker.ts', import.meta.url), { type: 'module' })`. Messages: main sends `{ type: 'embed', texts: string[] }`; worker replies `{ type: 'result', vectors }` or `{ type: 'error', message }`. After all batches, the main thread calls `worker.terminate()`.
- **Query/single-bookmark embedding:** A **long-lived** worker and a queue are used (`getQueryWorker()`, `queryQueue`, `processQueryQueue()`). Requests are queued and processed one at a time; same message format. This worker is not terminated after queries. Query results are cached in memory (max 50 entries) by normalized query text to avoid re-embedding the same query.

---

## 7) Retrieval / search

### Overview

Search is hybrid: lexical + semantic retrieval merged into one ranked list. Lexical retrieval uses MiniSearch over a global in-memory index built from all bookmarks in Dexie; semantic retrieval remains the existing embedding + cosine path. Query operators and filters (`site:`, `folder:`, phrases, exclude, OR, date range) are preserved.

### Data model

Dexie schema is unchanged (`bookmarks`, `embeddings`, `imports`). MiniSearch index state is in memory only (`src/search/miniIndex.ts`) and is rebuilt from `db.bookmarks.toArray()` when cache is empty. Indexed document shape is:

- `id` (bookmark id)
- `title`
- `url`
- `domain`
- `folderPath`

Indexed/search fields: `title`, `domain`, `folderPath`, `url` with weighted boosts applied at query time.

### Ingest paths

Bookmark writes that can stale lexical search all call `invalidateMiniIndex()` once per write batch:

- `runImport()` in `src/import/importService.ts` (success path, after import record update)
- `clearAllBookmarks()` in `src/import/importService.ts` (after clear)
- `ingestDeltas()` in `src/sync/ingestDeltas.ts` (after loop)
- `ingestResyncBatch()` in `src/sync/ingestDeltas.ts` (after loop)

This keeps writes simple while ensuring the next query rebuilds the global lexical index.

### Search pipeline

#### 7.1 Query parse

`parseQuery(raw)` in `src/search/queryParse.ts` parses:

- `site:` / `domain:`
- `folder:`
- quoted phrases
- `-exclude` terms
- `OR` groups

It returns normalized tokens plus `searchText`, which feeds lexical query text and semantic embedding text.

#### 7.2 Filters

`loadBookmarksAndEmbeddings(filters)` in `src/search/searchService.ts` applies folder/domain/date filters first and returns:

- `filteredBookmarks`
- matching embedding rows

`filteredIds` (bookmark ids from filtered bookmarks) is then used to filter MiniSearch hits so lexical candidates remain constrained by UI/query filters.

#### 7.3 Lexical (MiniSearch lifecycle)

`getMiniIndex()` in `src/search/miniIndex.ts`:

- returns cached index when available
- otherwise loads all bookmarks from Dexie, builds MiniSearch, caches, returns

Search is one MiniSearch call per query (`parsed.searchText`) with:

- `prefix: true`
- `fuzzy: 0.15`
- field boosts (`title: 2`, `domain: 1.5`, `folderPath: 1`, `url: 0.8`)

Post-search filtering in `searchService`:

- keep hits whose `bookmarkId` is in `filteredIds`
- drop hits matching excludes via `bookmarkMatchesExclude`
- enforce OR semantics via `bookmarkMatchesOrGroup`

This preserves existing operator behavior without running MiniSearch per OR group.

#### 7.4 Semantic

Semantic path is unchanged:

- `embedQuery(parsed.searchText)` to get query vector
- `semanticTopK(items, queryVector, 50)` for top semantic candidates

Cosine similarity implementation remains in `src/search/retrieval.ts`.

#### 7.5 Merge and rank

Candidates are union of lexical hits and semantic top-50. Ranking remains:

- `ALPHA * semantic + (1 - ALPHA) * normalizedKeyword`
- plus phrase boost, junk-title penalty, recency boost
- strong vs related logic unchanged

Future improvement (optional): Reciprocal Rank Fusion (RRF) can be added later as an alternative rank-combination strategy.

#### 7.6 Why matched

For lexical signals, `inferKeywordSignals(bookmark, parsed)` in `src/search/retrieval.ts` uses exported `termMatchesField` and `phraseMatchesField` to derive:

- `matchedTerms`
- `matchedIn`
- `matchedPhrases`

`buildReasons()` / `formatReasons()` in `src/search/searchService.ts` remain the formatter path; `url` matches map to existing reason label `site` so URL-only lexical hits still receive keyword explanations.

---

## 8) UI architecture

### Page list and responsibilities

| Route | Component | Responsibility |
|-------|------------|----------------|
| `/` | `LandingPage` | Hero, value prop, CTA to Import; “Try asking” chips that store prefill in sessionStorage and navigate to Chat. |
| `/import` | `ImportPage` | File input (and drag-drop), Merge/Replace radio, “Try sample bookmarks”, run import; show import status (counts/error); show bookmark/index stats; “Build index” button and progress; “Remove all bookmarks” with DELETE confirmation. |
| `/search` | `SearchPage` | Search input (debounced 380 ms), filters (folder, domain, date added), calls `search()`; renders result list with `SearchResultCard`. |
| `/chat` | `ChatPage` | Single input; each submit runs `search(query, {})` and appends a “turn” (query + results or error). Reads sessionStorage prefill from landing chips. Renders same `SearchResultCard` for each result. |

### Shared components

- **SearchResultCard** (`src/components/SearchResultCard.tsx`): Receives `SearchResult` (bookmark, score, whyMatched, reasons, matchedTerms?, matchTier?). Renders title (with optional term highlight), URL, folder path, “why matched” line, and match score %. When `matchTier === 'related'`, shows a "Related match" label. Exported as `ResultCard` as well. Used by both Search and Chat.

### Global layout structure

- **AppLayout** (`src/layouts/AppLayout.tsx`): Header (brand “ShelfEngine”), sidebar (nav links: ShelfEngine, Import, Search, Chat), main content area. On viewport &lt; 768px, sidebar is off-canvas and toggled by a hamburger; overlay closes it. Wraps Import, Search, and Chat pages.
- **LandingLayout** (`src/layouts/LandingLayout.tsx`): Minimal layout (header + main) for the landing page. No sidebar.

### CSS strategy

- **Global:** `src/index.css` — reset/box-sizing, CSS variables (spacing), body background and font, focus styles, button classes (`.btn`, `.btn-primary`, `.btn-danger`, `.btn-secondary`), `.result-card`, `.empty-state`, `.page-subtitle`, spinner, landing hero and cards. No CSS-in-JS; inline styles used in components for layout/specific values; class names for shared patterns.

---

## 9) Offline behavior

### What works offline

- After the app and assets have been loaded once: **full UI**, **IndexedDB** (Dexie) read/write, **import** (file chosen from device), **Build index** (worker + Dexie), **search and chat** (all data and model are local). So core flows work offline once the app and model are cached.

### What does not work offline

- **First load** without cache: HTML/JS/CSS and the embedding model (transformers.js) must be fetched; if the network is down, the app or model load can fail. **Sample bookmarks:** “Try sample bookmarks” fetches `/sample-bookmarks.html`; that request will fail offline if not already cached. **Google Fonts:** If used and not cached, fonts may not load offline (Workbox can cache them; see `vite.config.ts` runtimeCaching).

### Caching (PWA)

- **vite-plugin-pwa** is used with Workbox (`vite.config.ts`): `registerType: 'autoUpdate'`, `globPatterns` for js, css, html, ico, png, svg, woff2. Optional `runtimeCaching` for e.g. Google Fonts (CacheFirst). The embedding model is loaded by transformers.js (typically from Hugging Face or cache); exact caching of the model is controlled by the library/cache dir (`env.cacheDir = 'transformers-cache'` in the worker). No custom service-worker logic beyond the plugin.

---

## 10) Security and privacy

### What is stored locally

- **IndexedDB (Dexie):** Bookmark metadata (url, title, domain, folderPath, addDate, createdAt) and embedding vectors. Import job records (status, counts, error). All in the browser profile for the origin.

### What is never sent anywhere (in core app)

- Bookmark data and user queries are **not** sent to any ShelfEngine backend (there is none). Embeddings are computed locally; the model may be downloaded from Hugging Face (or cached) when the worker loads; no bookmark or query content is sent to a third party by ShelfEngine code.

### Permissions

- **Web app:** No special permissions; standard storage (IndexedDB) and Web Worker. Optional network for first load and model fetch.
- **Chrome extension** (when installed): `bookmarks`, `storage`, `tabs` in manifest; `host_permissions` for `http://localhost/*`, `http://127.0.0.1/*`, and `https://shelf-engine.vercel.app/*`. Content script runs on those origins only. Extension is usable in development (localhost) and against the production app (shelf-engine.vercel.app).

### Threat model assumptions

- Single-user, local-first. No server-side auth or secrets. Extension is trusted (same install); postMessage is origin-checked in the app (`event.data?.source === EXTENSION_SOURCE`). No assumption that the hosting origin is HTTPS in dev (localhost).

---

## 11) Testing and debugging

### Existing tests

- **None.** There are no `*.test.*` or `*.spec.*` files and no test runner or test dependencies in the repo.

### Manual test checklist (core flows)

- **Import:** Upload a Chrome `bookmarks.html`; choose Merge then Replace; confirm counts and no duplicates on second merge. Try “Try sample bookmarks.”
- **Index:** After import, run “Build index”; confirm progress bar and “Indexed” count; verify no main-thread freeze during embedding.
- **Search:** Run keyword, phrase, and natural-language queries; validate filters (folder/domain/date) and query operators (`site:`, `folder:`); confirm “why matched” is accurate.
- **Chat:** Send a query; confirm retrieval-only behavior (no generative reply text), with bookmark cards and explanations using the same search pipeline.
- **Lexical / MiniSearch:** Verify keyword-only path by searching with empty embeddings and confirming useful results + reasons; optionally run `window.runSearchHarness()` in dev console to sanity-check sample queries.
- **Offline:** With devtools “Offline”, reload after one load; confirm search/import/index still work; confirm sample bookmarks only if cached.

### Known limitations

- No automated tests. Large imports (e.g. many thousands of bookmarks) may exceed the 60 s target or memory. Single embedding model; no model selection in UI. Chat does not keep multi-turn context for retrieval (each message is independent).

---

## 12) Planned work (from milestones)

- **docs/MILESTONES.md** defines the ordering: M1 App Scaffold → M2 Bookmark Import → M3 Local Embeddings → M4 Search & Filters → M5 Chat Interface → M6 Chrome Extension.

### Implemented in repo today

- **M1–M5** are implemented: PWA shell, Dexie schema, import (merge/replace), parsing, folder path, import tracking, Web Worker embeddings, search with filters and “why matched,” Chat UI over the same search.
- **M6 (Chrome Extension)** bridge is **implemented**: `extension/background.ts` (bookmark listeners, delta queue in `chrome.storage.local`, send to tabs; RESYNC_ALL: `getTree()` → flatten with folderPath, URL-normalized; pending resync batch stored and sent in chunks of 500; GET_PENDING_RESYNC, RESYNC_ACK, last sync time); `extension/contentScript.ts` (ShelfEngine origin only, postMessage to page; SHELFENGINE_READY → get queue and pending resync, forward SHELFENGINE_DELTAS and SHELFENGINE_RESYNC chunks; SHELFENGINE_ACK / SHELFENGINE_RESYNC_ACK to background); `extension/popup.html` (Open ShelfEngine, Resync all bookmarks, status: Connected, Queue, Pending resync, Last sync); `src/App.tsx` (listens for `SHELFENGINE_DELTAS` and `SHELFENGINE_RESYNC`, calls `ingestDeltas()` or `ingestResyncBatch()`, posts ACKs); `src/sync/ingestDeltas.ts` (deltas: upsert/remove, `embedSingleBookmark()` for upserts; resync: `ingestResyncBatch()` — Path A URL-canonical upsert only, embed only when bookmark has no embedding). **Production origin** is enabled: manifest `host_permissions` and content_scripts include `https://shelf-engine.vercel.app/*` alongside localhost. Build: `npm run build:extension`; load unpacked from `extension` folder.

### Not implemented / optional / deferred

- **OAuth / login:** Not implemented; SPEC defers optional Google OAuth for backup or multi-device to later.
- **Backend, collaboration, mobile app, page-content fetching:** All out of scope per SPEC and GUARDRAILS.

---

*Document generated to describe the repository state as of the last scan. For product and milestone ordering, see `docs/SPEC.md` and `docs/MILESTONES.md`. For contribution rules, see `docs/GUARDRAILS.md`.*
