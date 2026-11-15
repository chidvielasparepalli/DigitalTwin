import { useState, useEffect, useCallback } from 'react';
import { api, ApiError, type KgEntity, type KgRelationship } from '../lib/api';

export function KgDisplay({ twinId }: { twinId: string }) {
  const [entities, setEntities] = useState<KgEntity[]>([]);
  const [relationships, setRelationships] = useState<KgRelationship[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGraph = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const graph = await api.kg.getFullGraph();
      setEntities(graph.entities);
      setRelationships(graph.relationships);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch knowledge graph');
    } finally {
      setLoading(false);
    }
  }, [twinId]);

  useEffect(() => {
    fetchGraph();
  }, [fetchGraph]);

  // Placeholder for a trigger to extract KG from new sources.
  // In Phase 8 (Twin Brain), this would be part of a broader analysis.
  const handleExtractKg = async () => {
    setError(null);
    setLoading(true); // Assuming this triggers a background job
    try {
      // This part needs to call an API endpoint that triggers KG extraction on existing/new sources.
      // For now, let's just re-fetch, assuming some background process might have run.
      // A more robust implementation would involve triggering a specific ingestion pipeline step.
      // await api.ingest.triggerKgExtraction(twinId); // Placeholder API call
      await fetchGraph(); // Just refresh the view
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to trigger KG extraction');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3>Knowledge Graph</h3>
      <button onClick={handleExtractKg} disabled={loading} className="small">Refresh Graph (LLM Extraction)</button> {/* Placeholder for actual extraction trigger */}
      {error && <p className="err">{error}</p>}

      {loading ? (
        <p className="muted">Loading knowledge graph...</p>
      ) : (
        <>
          <h4>Entities ({entities.length})</h4>
          {entities.length === 0 ? (
            <p className="muted">No entities found yet.</p>
          ) : (
            <ul className="kg-list">
              {entities.map((entity) => (
                <li key={entity.id}>
                  <strong>{entity.name}</strong> ({entity.type}) - {(entity.confidence * 100).toFixed(0)}% ({entity.provenance})
                  {entity.description && <span className="muted small"> - {entity.description}</span>}
                </li>
              ))}
            </ul>
          )}

          <h4>Relationships ({relationships.length})</h4>
          {relationships.length === 0 ? (
            <p className="muted">No relationships found yet.</p>
          ) : (
            <ul className="kg-list">
              {relationships.map((rel) => (
                <li key={rel.id}>
                  {entities.find(e => e.id === rel.sourceEntityId)?.name} --({rel.type})--&gt; {entities.find(e => e.id === rel.targetEntityId)?.name}
                  - {(rel.confidence * 100).toFixed(0)}% ({rel.provenance})
                  {rel.description && <span className="muted small"> - {rel.description}</span>}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}