import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { TwinData } from '../lib/api';
import { useAuth } from '../lib/auth';
import { SourceUpload } from '../components/SourceUpload';
import { MemorySearch } from '../components/MemorySearch';
import { PersonalityDisplay } from '../components/PersonalityDisplay';
import { CommunicationStyleDisplay } from '../components/CommunicationStyleDisplay';
import { KgDisplay } from '../components/KgDisplay';
import { TwinChat } from '../components/TwinChat';

export function Twin() {
  const { user, logout } = useAuth();
  const [twin, setTwin] = useState<TwinData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTwin().then(setTwin).finally(() => setLoading(false));
  }, []);

  return (
    <div className="twin">
      <header className="twin-header">
        <div>
          <p className="tag">YOUR DIGITAL TWIN</p>
          <h1>{twin?.name ?? (loading ? 'Loading…' : 'No Twin yet')}</h1>
          {twin?.occupation && <p className="muted">{twin.occupation}</p>}
          {user && <p className="muted small">owner: {user.email}</p>}
        </div>
        <button onClick={logout} className="ghost">Log out</button>
      </header>

      {!twin && !loading && (
        <div className="card">
          <p>You haven't created your Digital Twin yet.</p>
          <a href="/onboarding" className="btn">Create your Twin</a>
        </div>
      )}

      {twin && (
        <section className="grid">
          <div className="card">
            <h3>Status</h3>
            <p className="ok">Twin created</p>
            <p className="muted small">
              Phase 9 complete. Chat with your Twin!
            </p>
          </div>
          <div className="card">
            <h3>Languages</h3>
            <p>{(twin.preferredLanguages ?? []).join(', ') || '—'}</p>
          </div>
        </section>
      )}

      {twin && <SourceUpload />}
      {twin && <MemorySearch />}
      {twin && <PersonalityDisplay twinId={twin.id} />}
      {twin && <CommunicationStyleDisplay twinId={twin.id} />}
      {twin && <KgDisplay twinId={twin.id} />}
      {twin && <TwinChat twinId={twin.id} />}
    </div>
  );
}