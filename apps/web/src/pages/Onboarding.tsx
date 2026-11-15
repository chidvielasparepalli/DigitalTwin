import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

interface FormState {
  name: string;
  preferredName: string;
  occupation: string;
  interests: string;
  skills: string;
  communicationStyle: string;
  values: string;
  likes: string;
  dislikes: string;
  goals: string;
  boundaries: string;
  relationships: string;
  preferredLanguages: string;
}

const initial: FormState = {
  name: '', preferredName: '', occupation: '', interests: '', skills: '',
  communicationStyle: '', values: '', likes: '', dislikes: '', goals: '',
  boundaries: '', relationships: '', preferredLanguages: 'English',
};

const STEPS = ['Identity', 'Work & Interests', 'Preferences', 'Relationships'];

export function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (k: keyof FormState) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

  const submit = async () => {
    if (!form.name.trim()) {
      setError('Give your Twin a name');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await api.createTwin({
        name: form.name.trim(),
        preferredName: form.preferredName.trim(),
        occupation: form.occupation.trim(),
        interests: form.interests.trim(),
        skills: form.skills.trim(),
        communicationStyle: form.communicationStyle.trim(),
        values: form.values.trim(),
        likes: split(form.likes),
        dislikes: split(form.dislikes),
        goals: form.goals.trim(),
        boundaries: form.boundaries.trim(),
        relationships: split(form.relationships).map((name) => ({ name, relationType: 'known' })),
        preferredLanguages: split(form.preferredLanguages),
      });
      navigate('/twin');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create Twin');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <header>
        <h1>Create your Digital Twin</h1>
        <p className="muted">
          {user ? `Hello ${user.name} — tell your Twin about yourself.` : 'Tell your Twin about yourself.'}
        </p>
        <div className="steps">
          {STEPS.map((s, i) => (
            <span key={s} className={i === step ? 'step active' : i < step ? 'step done' : 'step'}>
              {s}
            </span>
          ))}
        </div>
      </header>

      {step === 0 && (
        <div className="card">
          <label>Twin name *
            <input value={form.name} onChange={set('name')} placeholder="What should your Twin be called?" />
          </label>
          <label>Preferred name (what they call you)
            <input value={form.preferredName} onChange={set('preferredName')} placeholder="Nickname" />
          </label>
          <label>Occupation
            <input value={form.occupation} onChange={set('occupation')} placeholder="Software Engineer" />
          </label>
          <label>Preferred languages (comma-separated)
            <input value={form.preferredLanguages} onChange={set('preferredLanguages')} />
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <label>Interests
            <textarea value={form.interests} onChange={set('interests')} placeholder="What do you care about?" />
          </label>
          <label>Skills
            <textarea value={form.skills} onChange={set('skills')} placeholder="Things you're good at" />
          </label>
          <label>Communication style
            <select value={form.communicationStyle} onChange={set('communicationStyle')}>
              <option value="">Select…</option>
              <option value="direct">Direct</option>
              <option value="warm">Warm & friendly</option>
              <option value="formal">Formal</option>
              <option value="casual">Casual</option>
              <option value="humorous">Humorous</option>
            </select>
          </label>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <label>Likes (comma-separated)
            <input value={form.likes} onChange={set('likes')} placeholder="coffee, mornings, hiking" />
          </label>
          <label>Dislikes (comma-separated)
            <input value={form.dislikes} onChange={set('dislikes')} placeholder="loud noises, spam calls" />
          </label>
          <label>Values
            <textarea value={form.values} onChange={set('values')} placeholder="What matters most to you?" />
          </label>
          <label>Goals
            <textarea value={form.goals} onChange={set('goals')} placeholder="What are you working toward?" />
          </label>
          <label>Boundaries (what the Twin should NOT do)
            <textarea value={form.boundaries} onChange={set('boundaries')} placeholder="Never share medical details, never book things without asking…" />
          </label>
        </div>
      )}

      {step === 3 && (
        <div className="card">
          <label>Important relationships (names, comma-separated)
            <textarea value={form.relationships} onChange={set('relationships')} placeholder="Ananya, Ravi, Mom" />
          </label>
        </div>
      )}

      {error && <p className="err">{error}</p>}

      <div className="onboarding-nav">
        {step > 0 && <button onClick={() => setStep((s) => s - 1)}>Back</button>}
        {step < STEPS.length - 1 ? (
          <button onClick={() => setStep((s) => s + 1)}>Continue</button>
        ) : (
          <button onClick={submit} disabled={busy}>{busy ? 'Creating…' : 'Create my Twin'}</button>
        )}
      </div>
    </div>
  );
}
