import { useState, useEffect } from 'react';
import { api, ApiError, type PersonalityTrait } from '../lib/api';
import { PERSONALITY_TRAITS } from '@digital-twin/shared';

export function PersonalityDisplay({ twinId }: { twinId: string }) {
  const [traits, setTraits] = useState<PersonalityTrait[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState(0);
  const [editConfidence, setEditConfidence] = useState(0);

  const fetchTraits = async () => {
    setError(null);
    setLoading(true);
    try {
      const fetchedTraits = await api.personality?.getTraits?.() ?? (await api.request<PersonalityTrait[]>('/personality/traits'));
      setTraits(fetchedTraits);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch traits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTraits();
  }, [twinId]);

  const handleInfer = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.personality?.infer?.() ?? (await api.request('/personality/infer', { method: 'POST' }));
      await fetchTraits();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to infer traits');
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (trait: PersonalityTrait) => {
    setEditingId(trait.id);
    setEditValue(trait.value);
    setEditConfidence(trait.confidence);
  };

  const handleSave = async (traitId: string) => {
    setError(null);
    setBusy(true);
    try {
      await api.personality?.updateTrait?.(traitId, { value: editValue, confidence: editConfidence, provenance: 'explicit' }) ?? (await api.request(`/personality/traits/${traitId}`, { method: 'PATCH', body: JSON.stringify({ value: editValue, confidence: editConfidence, provenance: 'explicit' }) }));
      setEditingId(null);
      await fetchTraits();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update trait');
    } finally {
      setBusy(false);
    }
  };

  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <h3>Personality Traits</h3>
      <button onClick={handleInfer} disabled={loading || traits.length > 0} className="small">Infer Initial Traits</button>
      {error && <p className="err">{error}</p>}

      {loading ? (
        <p className="muted">Loading traits...</p>
      ) : traits.length === 0 ? (
        <p className="muted">No traits inferred yet. Click "Infer Initial Traits" to get started.</p>
      ) : (
        <ul className="trait-list">
          {PERSONALITY_TRAITS.map(traitKey => {
            const trait = traits.find(t => t.trait === traitKey);
            if (!trait) return null; // Only display defined traits

            const isEditing = editingId === trait.id;

            return (
              <li key={trait.id}>
                <div className="trait-info">
                  <strong>{trait.trait.replace(/_/g, ' ')}:</strong>
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      max="1"
                      step="0.01"
                      value={editValue}
                      onChange={(e) => setEditValue(parseFloat(e.target.value))}
                    />
                  ) : (
                    <span>{(trait.value * 100).toFixed(0)}%</span>
                  )}
                  <span>({(trait.confidence * 100).toFixed(0)}% confidence)</span>
                  <span className={`provenance ${trait.provenance}`}>{trait.provenance}</span>
                </div>
                <small className="muted">Last Updated: {new Date(trait.lastUpdated).toLocaleDateString()}</small>
                {isEditing ? (
                  <div className="trait-actions">
                    <button onClick={() => handleSave(trait.id)} disabled={busy} className="small">Save</button>
                    <button onClick={() => setEditingId(null)} disabled={busy} className="ghost small">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => handleEdit(trait)} disabled={busy} className="ghost small">Edit</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
