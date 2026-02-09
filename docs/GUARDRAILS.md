# ShelfEngine Guardrails

These are non-negotiable rules for every change.

## Scope and product rules
- Do not modify docs/SPEC.md.
- Local-first by default. All bookmark data and embeddings stay in the browser.
- No backend required for MVP. Do not add servers, APIs, or databases.
- No login required for core usage. If auth is added later, it must be optional and only for backup.
- Do not fetch or index page content.

## Chat and search rules
- Chat is a UI over retrieval only. No generative responses.
- Every message triggers a semantic query and returns ranked bookmarks with "why matched" explanations only.

## Performance rules
- Must handle about 1,000 bookmarks.
- Indexing target: under 60 seconds.
- Query latency target: under 500 ms after indexing.
- Heavy work must run in Web Workers. Never block the main thread during import or embedding.

## Data rules
- Dedupe key is normalized URL.
- Embedding text must be title + hostname + folder path.
- Store data using Dexie and IndexedDB only.

## Milestone discipline
- Follow docs/MILESTONES.md ordering unless explicitly told otherwise.
- Each milestone must ship a demoable, working state.
- No "nice to have" work inside a milestone.

## Extension bridge rule
- Extension must use the content script plus postMessage bridge described in Milestone 6.
- Do not attempt to share IndexedDB directly between the web app and the extension. Do not propose "shared Dexie DB".

## Code minimalism and quality rules
- Prefer the simplest implementation that satisfies the current milestone. Do not add abstractions "for future use".
- Keep functions small and single-purpose. If a file exceeds ~250 lines, refactor.
- No premature patterns: no DI frameworks, no event buses, no custom state managers unless required.
- Avoid over-engineering types. Use TypeScript types that are useful, not exhaustive.
- Use minimal dependencies. If a feature can be done with existing stack, do not add a library.
- No hidden magic: favor explicit data flow over cleverness.
- Write only the code required for the requested task. Do not add extra features or "improvements".
- Add basic error handling and user-facing error messages where needed, but do not build a full logging system.
- Keep UI components simple: one responsibility per component, minimal props.

Implementation rule: keep code minimal. No premature abstraction. No extra dependencies.
