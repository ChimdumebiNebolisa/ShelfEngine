import { search } from './searchService';

type HarnessResult = Awaited<ReturnType<typeof search>>[number];

function formatResult(result: HarnessResult) {
  return {
    title: result.bookmark.title,
    url: result.bookmark.url,
    score: Number(result.score.toFixed(3)),
    whyMatched: result.whyMatched,
  };
}

export async function runSearchHarness(): Promise<void> {
  const queries = [
    'react hooks',
    '"design system"',
    'site:github.com shelf',
    'folder:"Bookmarks Bar/Work"',
    'how to set up vite project',
  ];

  console.log('[searchHarness] running sample queries...');
  for (const query of queries) {
    const results = await search(query, {});
    console.log(`[searchHarness] query: ${query}`);
    console.table(results.slice(0, 5).map(formatResult));
  }
  console.log('[searchHarness] done');
}

declare global {
  interface Window {
    runSearchHarness?: () => Promise<void>;
  }
}

if (import.meta.env.DEV && typeof window !== 'undefined') {
  window.runSearchHarness = runSearchHarness;
}
