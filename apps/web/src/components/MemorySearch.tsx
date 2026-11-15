import { useState } from 'react';
import { api, ApiError } from '../lib/api';

interface ScoredMemory {
  id: string;
  type: string;
  content: string;
  importance: number;
  confidence: number;
  eventAt: string | null;
  createdAt: string;
  score: number;
  scoreBreakdown: {
    semantic: number;
    recency: number;
    importance: number;
    confidence: number;
    context: number;
  };
}

export function MemorySearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScoredMemory[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.memory?.query?.({ query }) ?? (await api.request<{ results: ScoredMemory[] }>('/memory/query', {
        method: 'POST',
        body: JSON.stringify({ query }),
      }));
      setResults(res.results);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'memory search failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3>Memory Search</h3>
      <div className="search-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask your Twin about its memories..."
          disabled={busy}
        />
        <button onClick={handleSearch} disabled={busy || !query}>
          {busy ? 'Searching…' : 'Search'}
        </button>
      </div>
      {error && <p className="err">{error}</p>}

      <ul className="memory-list">
        {results.length === 0 && <li className="muted">No memories found.</li>}
        {results.map((m) => (
          <li key={m.id}>
            <div className="mem-header">
              <strong>{m.content}</strong>
              <span className={`mem-type ${m.type}`}>{m.type}</span>
            </div>
            <small>
              Score: {m.score.toFixed(2)} ({m.scoreBreakdown.semantic.toFixed(2)} semantic,{' '}
              {m.scoreBreakdown.recency.toFixed(2)} recency, {m.scoreBreakdown.importance.toFixed(2)}{' '}
              importance, {m.scoreBreakdown.confidence.toFixed(2)} confidence,{' '}
              {m.scoreBreakdown.context.toFixed(2)} context) · Confidence: {(m.confidence * 100).toFixed(0)}%
            </small>
            <p className="muted small">
              {m.eventAt && `Event: ${new Date(m.eventAt).toLocaleDateString()} · `}
              Created: {new Date(m.createdAt).toLocaleDateString()}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Extend api namespace
declare module '../lib/api' {
  interface Api {
    memory?: {
      query?: (opts: { query: string; limit?: number }) => Promise<{ results: ScoredMemory[] }>;
    };
    request<T>(path: string): Promise<T>;
  }
}
