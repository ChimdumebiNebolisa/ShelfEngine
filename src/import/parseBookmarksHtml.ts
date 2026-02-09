export interface ParsedBookmark {
  url: string;
  title: string;
  folderPath: string;
  addDate: number | null;
}

/**
 * Parse Chrome/Netscape bookmarks.html. Walks DL/DT/H3/A structure and
 * extracts title, URL, folder path, add date. Does not normalize URLs
 * (caller uses normalizeUrl for dedupe).
 */
export function parseBookmarksHtml(html: string): ParsedBookmark[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const results: ParsedBookmark[] = [];
  const folderStack: string[] = [];

  function walk(node: Node) {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;

    if (el.tagName === 'H3') {
      const name = (el.textContent ?? '').trim();
      folderStack.push(name);
      const next = el.nextElementSibling;
      if (next?.tagName === 'DL') walk(next);
      folderStack.pop();
      return;
    }

    if (el.tagName === 'A') {
      const href = el.getAttribute('href');
      if (href && href.startsWith('http')) {
        const title = (el.textContent ?? '').trim() || href;
        const addDateAttr = el.getAttribute('add_date');
        let addDate: number | null = null;
        if (addDateAttr) {
          const sec = parseInt(addDateAttr, 10);
          if (!Number.isNaN(sec)) addDate = sec;
        }
        const folderPath = folderStack.length ? folderStack.join('/') : '';
        results.push({ url: href, title, folderPath, addDate });
      }
      return;
    }

    if (el.tagName === 'DL') {
      for (const child of el.children) {
        if (child.tagName === 'DT') {
          const first = child.firstElementChild;
          if (first) walk(first);
        }
      }
      return;
    }

    for (const child of node.childNodes) walk(child);
  }

  walk(doc.body ?? doc);
  return results;
}
