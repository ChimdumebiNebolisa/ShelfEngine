# Changelog

All notable changes to this project are documented in this file.

## [1.0.1] - 2026-02-11

### Added
- Local-first bookmark import flow with merge/replace behavior and normalized URL dedupe.
- Worker-based local embeddings using `Xenova/all-MiniLM-L6-v2`.
- Hybrid retrieval pipeline (lexical + semantic) with filters and operator parsing (`site:`, `folder:`, phrases, excludes, OR).
- Retrieval-only chat interface powered by the same search pipeline.
- Optional Chrome extension sync bridge (delta queue + resync) for `localhost`, `127.0.0.1`, and `https://shelf-engine.vercel.app`.

### Changed
- Search quality and explainability improvements, including stable "why matched" formatting across search and chat.
- Documentation expanded with architecture, constraints, and milestone/spec lineage for MVP and V2 planning.

### Known limitations
- No automated test suite yet (manual validation workflow documented).
- Scale target is approximately 1,000 bookmarks.
- Chat mode does not generate prose; it returns ranked retrieval results only.
