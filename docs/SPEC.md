# ShelfEngine -- Product & Technical Specification

## One-Sentence Value Proposition
Find saved links using what you remember about them, not folders.

---

## Product Overview
ShelfEngine is a **local-first web app** that lets users import their browser bookmarks once and later retrieve them using natural-language queries, search, and filters. Instead of relying on folders, users recall links by intent. All data stays on the user's device by default.

---

## Core Principles
- Local-first by default
- Privacy-preserving
- Low-cost to operate
- Fast retrieval over small datasets (≈1,000 bookmarks)
- Retrieval-focused "chat", not generative fluff

---

## Target User Problem
Users save useful links but cannot find them later because they remember *what the link was about*, not where it was saved.

---

## MVP Scope

### Goals
- Import Chrome bookmarks via exported HTML file
- Store bookmarks locally in the browser
- Build a local semantic index
- Support:
  - Search
  - Filters
  - Chat-style query interface
- Allow manual re-import (merge or replace)

### Non-Goals
- Automatic live sync on day one
- Fetching or indexing page content
- Team collaboration
- Mobile app

---

## User Flows

### App Start
- User opens ShelfEngine in the browser
- Core functionality works without login
- Optional "Sign in with Google" for backup or future sync

### Import Bookmarks
1. User clicks **Import**
2. Uploads `bookmarks.html` (Chrome export)
3. App parses:
   - Title
   - URL
   - Folder path
   - Add date (if present)
4. Deduplicate by normalized URL
5. Build local semantic index

### Find a Bookmark
Two equivalent interfaces:
- **Search**: keyword search with filters
- **Chat**: natural-language query treated as semantic search

Each result shows:
- Title
- URL
- Folder path
- Short "why matched" explanation

### Re-Import
- User can re-import anytime
- Options:
  - Merge and dedupe (default)
  - Replace existing data

---

## Architecture

### Client
- Progressive Web App (PWA)
- Works offline after initial load
- IndexedDB for storage
- Web Workers for heavy computation

### Storage (IndexedDB)
Object stores:
- `bookmarks`
  - id
  - url
  - title
  - domain
  - folderPath
  - addDate
  - createdAt
- `embeddings`
  - bookmarkId
  - vector
  - modelName
  - createdAt
- `imports`
  - importId
  - status
  - counts
  - createdAt
  - error

---

## Embeddings & Retrieval

### Embeddings
- Computed locally in the browser
- Use `transformers.js`
- Run inside a Web Worker

### Text Used for Embedding
Concatenated string:
- Title
- Hostname
- Folder path

Example:
Awesome Coupons | example.com | Bookmarks Bar/Shopping/Deals


### Vector Search
- Cosine similarity
- Top-K retrieval (K = 10)
- Client-side ranking
- Optional keyword overlap boost

### Performance Targets
- Index 1,000 bookmarks in under 60 seconds
- Query latency under 500 ms after indexing

---

## Search & Filters

### Search
- Keyword + semantic search
- Instant results

### Filters
- Folder path
- Domain
- Date added (if available)
- Optional heuristic type (e.g. repo, article, video)

---

## Chat Interface (MVP Definition)
- Chat is a UI abstraction over search
- No generative responses
- Each message triggers a semantic query
- Returns ranked bookmarks only
- Displays short "why matched" explanations
- No hallucination risk

---

## Privacy & Security
- All data stays local by default
- No page content fetched
- No bookmarks sent to a server unless user explicitly opts in
- Optional Google OAuth only for backup and future sync

---

## Authentication (Optional)
- Google OAuth for:
  - Cloud backup
  - Multi-device restore (future)
- App usable without login

---

## Future: Automatic Bookmark Sync
- Chrome extension using bookmarks API
- Listens for create, update, delete, move events
- Syncs deltas into ShelfEngine
- Queues changes when app is closed
- Flushes on next app open

---

## Acceptance Criteria
- Can import a real Chrome bookmarks export
- Semantic search returns relevant results for vague queries
- Re-import merge does not create duplicates
- App works offline after import
- No login required for core usage

---

## Milestones

### Milestone 1: App Scaffold
- PWA shell
- IndexedDB setup
- Basic UI layout

### Milestone 2: Bookmark Import
- HTML parsing
- Folder path extraction
- Deduplication
- Import status tracking

### Milestone 3: Local Embeddings
- Web Worker setup
- Embedding generation
- Vector storage

### Milestone 4: Search + Chat UI
- Search bar
- Filters
- Chat-style interface
- Result cards with explanations

### Milestone 5: Chrome Extension Sync
- OAuth via chrome.identity
- Initial sync
- Delta updates
- Local queue + flush

---

## Success Metric
A user can retrieve a previously saved link in under 10 seconds using a vague, natural-language query without re-Googling.
