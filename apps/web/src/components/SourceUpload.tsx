import { useState, useCallback, useEffect } from 'react';
import { api, ApiError, getToken } from '../lib/api';
import type { Source } from '../lib/api';

export function SourceUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intervalId, setIntervalId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.getSources();
      setSources(res);
      // Auto-stop polling when nothing is processing
      const anyProcessing = res.some((s) => s.status === 'processing');
      if (!anyProcessing) stopPoll();
    } catch {
      /* ignore on first load */
    }
  }, []);

  const startPoll = () => {
    if (intervalId) return;
    const id = window.setInterval(() => load(), 3000);
    setIntervalId(id);
  };
  const stopPoll = () => {
    if (intervalId) clearInterval(intervalId);
    setIntervalId(null);
  };

  useEffect(() => {
    load();
    return () => stopPoll();
  }, [load]);

  const handleUpload = async () => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/sources/upload', {
        method: 'POST',
        body: fd,
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'upload failed');
      setFile(null);
      load();
      startPoll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this source and its file?')) return;
    try {
      await api.deleteSource(id);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'delete failed');
    }
  };

  return (
    <div className="card">
      <h3>Data Sources</h3>
      <div className="upload-row">
        <input
          type="file"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          disabled={busy}
          accept=".txt,.md,.json,.csv,.pdf"
        />
        <button onClick={handleUpload} disabled={busy || !file}>
          {busy ? 'Uploading…' : 'Upload'}
        </button>
      </div>
      {error && <p className="err">{error}</p>}

      <ul className="source-list">
        {sources.length === 0 && <li className="muted">No sources yet. Upload a file to teach your Twin.</li>}
        {sources.map((s) => (
          <li key={s.id} className={s.status === 'processing' ? 'active' : ''}>
            <div className="src-info">
              <strong>{s.name}</strong>
              <span className={`status ${s.status}`}>{s.status}</span>
            </div>
            <small>{Math.round(s.fileSize / 1024)} KB · {new Date(s.createdAt).toLocaleString()}</small>
            {s.lastError && <p className="err small">Error: {s.lastError}</p>}
            <div className="src-actions">
              <button onClick={() => handleDelete(s.id)} className="ghost small" disabled={busy}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}