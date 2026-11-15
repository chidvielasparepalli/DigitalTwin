# 🧬 Digital Twin

An **evolving computational model of a person**: their knowledge, memories,
communication patterns, preferences, values, and decision behavior — not a
chatbot that pretends to be someone.

The Twin learns from data the owner explicitly provides and approves. Every
AI inference is labelled as such, carries a confidence score and supporting
evidence, and can be corrected by the user. The system predicts how the person
would think and act, and can *show* the evidence behind each prediction.

> **Current status: Phase 0 — project architecture.** See
> [`ROADMAP.md`](./ROADMAP.md) for the full 20-phase plan.

---

## Architecture

```
                    🧬 DIGITAL TWIN
                           │
                    ┌──────┴──────┐
                    │  TWIN BRAIN │
                    └──────┬──────┘
                           │
       ┌───────────────────┼───────────────────┐
       ↓                   ↓                   ↓
   MEMORY ENGINE      PERSONALITY ENGINE   DECISION ENGINE
       │                   │                   │
       ↓                   ↓                   ↓
  Knowledge Graph    Communication Style   Past Decisions
       │                   │                   │
       └───────────────────┼───────────────────┘
                           ↓
                    CONTEXT ENGINE
                           ↓
                    AI REASONING
                           ↓
              ┌────────────┴────────────┐
              ↓                         ↓
          TEXT TWIN                 VOICE TWIN
              │                         │
              └────────────┬────────────┘
                           ↓
                    AGENTIC TWIN
                           ↓
                  PERMISSION ENGINE
                           ↓
                     REAL ACTIONS
```

## Monorepo layout

```
apps/
  api/    Fastify backend (HTTP API, validation, background jobs later)
  web/    React + Vite frontend (onboarding, chat, dashboard)
packages/
  db/     SQLite + Drizzle data layer (schema, migrations land in Phase 1)
  ai/     OpenAI provider abstraction (embeddings + generation)
  shared/ Types and constants shared across apps and packages
```

All packages are TypeScript, ESM, and compiled strictly (`strict`,
`noUncheckedIndexedAccess`).

## Tech stack

| Layer      | Choice                              |
| ---------- | ----------------------------------- |
| Frontend   | React 19 + Vite                     |
| Backend    | Fastify 5                           |
| Database   | SQLite (`better-sqlite3`) + Drizzle |
| AI         | OpenAI (embeddings + chat)          |
| Language   | TypeScript throughout               |
| Tooling    | pnpm workspaces, ESLint, Prettier, Vitest |

## Getting started

```bash
# 1. Install dependencies
pnpm install

# 2. (optional) copy env templates
cp apps/api/.env.example apps/api/.env

# 3. Run everything (API on :4000, web on :5173)
pnpm dev
```

Open http://localhost:5173 — the page polls `/api/health` and shows the API
is reachable, proving the full chain (browser → Vite → Fastify → SQLite) is
wired.

`OPENAI_API_KEY` is not needed until Phase 3 (data ingestion/embeddings).

## Workspace scripts

| Script            | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `pnpm dev`        | Run API + web dev servers in parallel          |
| `pnpm build`      | Type-check and build all packages              |
| `pnpm lint`       | ESLint across the workspace                    |
| `pnpm format`     | Prettier write                                 |
| `pnpm format:check` | Prettier check                              |
| `pnpm typecheck`  | `tsc --noEmit` in every package                |
| `pnpm test`       | Vitest in every package                        |

## Design principles

- **Raw data vs inference are separated.** User-provided facts are never
  silently overwritten by AI guesses.
- **Every AI inference has provenance**: source, evidence, confidence,
  timestamp, and a path for the user to correct it.
- **Nothing invented.** If the Twin lacks evidence, it says it doesn't know —
  it never fabricates personal memories.
- **Confidence over certainty.** Predictions are shown with scores and
  alternative possibilities, never as fact.
- **Multi-user safe.** One user's Twin can never reach another user's data.

---

## Real-Time Clone Interface (Orb)

Live sensing pipeline: camera + microphone → face/body/voice analysis →
behavioral model → real-time orb visualization in the browser.

### Run it

```bash
# Terminal 1 — start the sensor bridge
python -m src.main bridge

# Terminal 2 — start the web UI
cd apps/web && npm install && npm run dev

# Open http://localhost:5173/orb
```

The orb stays dormant, lights up when you're detected, pulses with your
speech, shifts hue with emotion, and tilts with your head. After ~3s it
emits a `style` profile (blink rate, expressiveness, dominant emotion).

### Capture your voice profile (for voice cloning)

```bash
python -m src.main profile
```

Speaks 10s → saves `profiles/voice_ref.wav` + voice characteristics.
The clone engine (Coqui XTTS-v2) is wired in `src/voice/voice_clone.py`;
first run downloads the model (~1.9 GB).

### Architecture

```
camera ──► FaceAnalysisModule ──► blendshapes, head pose, blink, mouth
mic ─────► VoiceAnalysisModule ─► pitch, energy, STT transcript
camera ──► BodyTrackingModule ───► pose, gesture, velocity
                    │
              BehavioralModel (style profile)
                    │
              WebSocket bridge (:8765)
                    │
              three.js orb (apps/web, /orb)
```

Modules: `src/vision/`, `src/voice/`, `src/orb/`. GPU-accelerated via
PyTorch CUDA (RTX 4060). Self-check: `python test_pipeline.py`.
