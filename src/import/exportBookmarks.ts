/**
 * Export bookmarks to Chrome/Netscape bookmarks.html format.
 * No DB access; callers pass the bookmark list.
 */

export interface ExportBookmark {
  url: string;
  title: string;
  folderPath: string;
  addDate: number | null;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface TreeNode {
  links: ExportBookmark[];
  children: Record<string, TreeNode>;
}

function buildTree(bookmarks: ExportBookmark[]): TreeNode {
  const root: TreeNode = { links: [], children: {} };
  for (const b of bookmarks) {
    const parts = b.folderPath ? b.folderPath.split('/').filter(Boolean) : [];
    let node = root;
    for (const part of parts) {
      if (!node.children[part]) node.children[part] = { links: [], children: {} };
      node = node.children[part];
    }
    node.links.push(b);
  }
  return root;
}

function emitNode(node: TreeNode, indent: string): string {
  const parts: string[] = [];
  for (const link of node.links) {
    const addDate = link.addDate != null ? String(link.addDate) : '0';
    parts.push(`${indent}<dt><a href="${escapeHtml(link.url)}" add_date="${addDate}">${escapeHtml(link.title)}</a>`);
  }
  for (const [name, child] of Object.entries(node.children)) {
    const childIndent = indent + '  ';
    parts.push(`${indent}<dt><h3 add_date="0">${escapeHtml(name)}</h3>`);
    parts.push(`${indent}<dl>`);
    parts.push(emitNode(child, childIndent));
    parts.push(`${indent}</dl>`);
  }
  return parts.join('\n');
}

/**
 * Build Netscape/Chrome bookmarks.html from a list of bookmarks.
 */
export function buildBookmarksHtml(bookmarks: ExportBookmark[]): string {
  const tree = buildTree(bookmarks);
  const inner = emitNode(tree, '  ');
  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<title>Bookmarks</title>
<h1>Bookmarks</h1>
<dl>
${inner}
</dl>
`;
}

/**
 * Trigger download of bookmarks.html in the browser.
 */
export function downloadBookmarksHtml(html: string, filename = 'bookmarks.html'): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
