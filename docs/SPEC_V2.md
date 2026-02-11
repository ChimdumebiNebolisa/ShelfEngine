# ShelfEngine -- Product & Technical Specification (V2)

> Status: Draft baseline for post-MVP direction.
> Supersedes as active planning doc: `docs/SPEC.md` (which remains the historical MVP contract).

---

## 1) Vision and Positioning

### One-sentence value proposition
Find saved links by intent, context, and partial memory without relying on folder recall.

### Product direction (V2)
- Keep local-first as default behavior.
- Improve retrieval quality and reliability at ~1,000 bookmark scale.
- Preserve simple UX: import, search, chat-style retrieval, optional extension sync.

---

## 2) Scope for V2

### In scope
- Hybrid retrieval quality improvements (lexical + semantic blending).
- Better operator support (`site:`, `folder:`, quotes, excludes, OR).
- Clear and stable "why matched" explanations.
- Extension ingestion reliability improvements (queue/resync correctness).
- Documentation and regression workflows for maintainability.

### Out of scope
- Backend-first architecture.
- Mandatory auth/login.
- Page content crawling/indexing.
- Generative chat responses.

---

## 3) Non-negotiable Constraints

- Local-first storage: IndexedDB (Dexie) only for bookmark and embedding data.
- No backend required for core usage.
- Chat remains retrieval-only (no generated prose answers).
- Heavy embedding/indexing operations must stay off the main thread.
- Dedupe key remains normalized URL.

---

## 4) User Flows (Current + V2 Expectations)

### Import
1. User uploads Chrome `bookmarks.html`.
2. User selects merge or replace.
3. App parses and dedupes by normalized URL.
4. App stores bookmarks and updates import status.
5. User can trigger embedding index build and monitor progress.

### Search
1. User submits keyword, operator-based, or natural-language query.
2. App parses terms/operators and applies effective filters.
3. App returns ranked bookmark results with "why matched" reasons.

### Chat
1. User sends a message.
2. Message is treated as retrieval query via same search pipeline.
3. Result cards are shown; no generative response text.

### Extension sync (optional)
1. Extension tracks bookmark deltas and/or full resync.
2. Deltas flow through content script + `postMessage` bridge.
3. Web app ingests changes and updates local stores.

---

## 5) Retrieval Specification (V2 Baseline)

### Query parsing
- Parse `site:`/`domain:`, `folder:`, quoted phrases, excludes (`-term`), OR groups.
- Produce normalized `searchText` for lexical + semantic paths.

### Lexical retrieval
- MiniSearch over global in-memory index built from Dexie bookmarks.
- Query-time options include prefix, fuzzy matching, and field boosts.
- Hit validation preserves operator semantics (exclude + OR checks).

### Semantic retrieval
- Query embedding generated in worker-backed path.
- Cosine similarity top-K candidate selection.
- Kept compatible with current embedding schema.

### Fusion and ranking
- Merge lexical + semantic candidates.
- Combine semantic and normalized lexical scores.
- Apply phrase boost, junk-title penalty, and recency adjustments.
- Return strong + related matches with clear thresholds.

### Why matched
- Reasons are retrieval-grounded only:
  - semantic relevance,
  - matched terms/fields,
  - phrase hits.
- No fabricated or generative explanation text.

---

## 6) Data Model and Storage

### Core stores
- `bookmarks`
- `embeddings`
- `imports`

### In-memory indexes/caches
- Lexical index cache (MiniSearch) with explicit invalidation after write batches.
- Query embedding cache (bounded) where applicable.

---

## 7) Performance and Reliability Targets

- Bookmark scale target: ~1,000.
- Embedding index build target: <60 seconds (typical dev hardware).
- Query latency target: <500 ms after index exists.
- First query after lexical invalidation should remain responsive.
- Write-path reliability: import/sync updates should not leave stale retrieval state.

---

## 8) Security and Privacy

- All core bookmark and embedding data remains local by default.
- No page content ingestion.
- No data sent to backend for core product operation.
- Optional auth/backup (if present later) must remain optional.

---

## 9) Acceptance Criteria (V2)

- Import/merge/replace behaves correctly with no duplicate normalized URLs.
- Search handles mixed query styles and operators with accurate filtering.
- "Why matched" explanations are consistent and field-accurate.
- Chat remains retrieval-only while reusing search pipeline.
- Extension delta/resync ingestion applies reliably when app is open/closed.
- Core flows remain usable offline after initial load.

---

## 10) Open Decisions

- Whether to keep score fusion weights static or make them configurable.
- Whether to add rank-fusion alternatives (e.g., RRF) behind a flag.
- Whether to formalize benchmark fixtures for retrieval regressions.

---

## 11) Document Lineage

- Historical MVP spec: `docs/SPEC.md`
- Active implementation planning (V2): `docs/MILESTONES_V2.md`
