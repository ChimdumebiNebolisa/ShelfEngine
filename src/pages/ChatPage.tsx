import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getEmbeddingStats } from '../embeddings/embeddingService';
import { search } from '../search/searchService';
import type { SearchResult } from '../search/searchService';
import SearchResultCard from '../components/SearchResultCard';

export interface ChatTurn {
  query: string;
  results: SearchResult[] | null;
  loading: boolean;
  error?: string;
}

export default function ChatPage() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [stats, setStats] = useState<{ total: number; withEmbedding: number } | null>(null);

  useEffect(() => {
    getEmbeddingStats().then(setStats);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    if (stats != null && stats.withEmbedding === 0) return;

    setInput('');
    const newTurn: ChatTurn = { query: trimmed, results: null, loading: true };
    setTurns((prev) => [...prev, newTurn]);

    try {
      const results = await search(trimmed, {});
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.query === trimmed && last.loading) {
          next[next.length - 1] = { ...last, results, loading: false };
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Search failed';
      setTurns((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.query === trimmed && last.loading) {
          next[next.length - 1] = { ...last, results: [], loading: false, error: message };
        }
        return next;
      });
    }
  }

  const canSend = stats != null && stats.withEmbedding > 0 && input.trim() !== '';
  const sending = turns.some((t) => t.loading);

  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Chat</h1>
      <p>Ask in plain language; you&apos;ll get matching bookmarks with &quot;why matched&quot; — no AI reply, retrieval only.</p>

      {stats != null && stats.total > 0 && stats.withEmbedding === 0 && (
        <p style={{ padding: '0.75rem', backgroundColor: 'rgba(200,160,80,0.2)', borderRadius: 4 }}>
          No index yet. <Link to="/import">Import bookmarks</Link> and click &quot;Build index&quot; first.
        </p>
      )}

      <div style={{ marginBottom: '1.5rem' }}>
        {turns.map((turn, i) => (
          <div key={i} style={turnBlockStyle}>
            <div style={userBubbleStyle}>{turn.query}</div>
            {turn.loading && <div style={metaStyle}>Searching…</div>}
            {turn.error && <div style={errorStyle}>{turn.error}</div>}
            {!turn.loading && turn.results !== null && (
              <>
                {turn.results.length === 0 ? (
                  <div style={metaStyle}>No bookmarks match your query.</div>
                ) : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {turn.results.map((r) => (
                      <SearchResultCard key={r.bookmark.id} result={r} />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. that article about React hooks..."
            disabled={!(stats != null && stats.withEmbedding > 0)}
            style={inputStyle}
          />
          <button type="submit" disabled={!canSend || sending} style={buttonStyle}>
            {sending ? '…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}

const turnBlockStyle: React.CSSProperties = {
  marginBottom: '1.25rem',
};

const userBubbleStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  marginBottom: '0.5rem',
  borderRadius: 4,
  backgroundColor: 'rgba(126, 184, 218, 0.15)',
  borderLeft: '3px solid #7eb8da',
  maxWidth: '80%',
};

const metaStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: '#a0a0b0',
  marginTop: '0.25rem',
};

const errorStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  color: '#e0a0a0',
  marginTop: '0.25rem',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  maxWidth: 400,
  padding: '0.5rem 0.75rem',
  fontSize: '1rem',
  border: '1px solid #2d2d44',
  borderRadius: 4,
  backgroundColor: '#252538',
  color: '#eaeaea',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  fontSize: '1rem',
  border: '1px solid #3d5a80',
  borderRadius: 4,
  backgroundColor: '#2d4a6a',
  color: '#eaeaea',
  cursor: 'pointer',
};
