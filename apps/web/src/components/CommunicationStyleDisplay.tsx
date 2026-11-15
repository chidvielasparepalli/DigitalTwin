import { useState, useEffect } from 'react';
import { api, ApiError, type CommunicationStyleCharacteristic } from '../lib/api';
import { PERSONALITY_TRAITS } from '@digital-twin/shared'; // Using this for general trait structure

export function CommunicationStyleDisplay({ twinId }: { twinId: string }) {
  const [profile, setProfile] = useState<CommunicationStyleCharacteristic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>(''); // Value can be stringified JSON
  const [editConfidence, setEditConfidence] = useState(0);

  const fetchProfile = async () => {
    setError(null);
    setLoading(true);
    try {
      const fetchedProfile = await api.communicationStyle?.getProfile?.() ?? (await api.request<CommunicationStyleCharacteristic[]>('/communication-style/profile'));
      setProfile(fetchedProfile);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to fetch communication style profile');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [twinId]);

  const handleAnalyze = async () => {
    setError(null);
    setBusy(true);
    try {
      await api.communicationStyle?.analyze?.() ?? (await api.request('/communication-style/analyze', { method: 'POST' }));
      await fetchProfile();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to analyze communication style');
    } finally {
      setBusy(false);
    }
  };

  const handleEdit = (char: CommunicationStyleCharacteristic) => {
    setEditingId(char.id);
    setEditValue(JSON.stringify(char.value)); // Store as stringified JSON
    setEditConfidence(char.confidence);
  };

  const handleSave = async (charId: string) => {
    setError(null);
    setBusy(true);
    try {
      const parsedValue = JSON.parse(editValue);
      await api.communicationStyle?.updateCharacteristic?.(charId, { value: parsedValue, confidence: editConfidence, provenance: 'explicit' }) ?? (await api.request(`/communication-style/profile/${charId}`, { method: 'PATCH', body: JSON.stringify({ value: parsedValue, confidence: editConfidence, provenance: 'explicit' }) }));
      setEditingId(null);
      await fetchProfile();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to update characteristic (check JSON format for value)');
    } finally {
      setBusy(false);
    }
  };

  const [busy, setBusy] = useState(false);

  return (
    <div className="card">
      <h3>Communication Style</h3>
      <button onClick={handleAnalyze} disabled={loading || profile.length > 0} className="small">Analyze Initial Style</button>
      {error && <p className="err">{error}</p>}

      {loading ? (
        <p className="muted">Loading communication style profile...</p>
      ) : profile.length === 0 ? (
        <p className="muted">No communication style analyzed yet. Click "Analyze Initial Style" to get started.</p>
      ) : (
        <ul className="trait-list"> {/* Reusing trait-list style for now */}
          {profile.map(char => {
            const isEditing = editingId === char.id;

            return (
              <li key={char.id}>
                <div className="trait-info">
                  <strong>{char.characteristic.replace(/_/g, ' ')}:</strong>
                  {isEditing ? (
                    <textarea
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      rows={2}
                    />
                  ) : (
                    <span>{JSON.stringify(char.value)}</span> // Display as stringified JSON
                  )}
                  <span>({(char.confidence * 100).toFixed(0)}% confidence)</span>
                  <span className={`provenance ${char.provenance}`}>{char.provenance}</span>
                </div>
                <small className="muted">Last Updated: {new Date(char.lastUpdated).toLocaleDateString()}</small>
                {isEditing ? (
                  <div className="trait-actions">
                    <button onClick={() => handleSave(char.id)} disabled={busy} className="small">Save</button>
                    <button onClick={() => setEditingId(null)} disabled={busy} className="ghost small">Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => handleEdit(char)} disabled={busy} className="ghost small">Edit</button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}