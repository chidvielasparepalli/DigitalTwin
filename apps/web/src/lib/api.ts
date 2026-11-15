const BASE = '/api';

/** Reads the stored JWT, or null. */
export function getToken(): string | null {
  return localStorage.getItem('dt_token');
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem('dt_token', token);
  else localStorage.removeItem('dt_token');
}

export interface ApiUser {
  id: string;
  email: string;
  name: string;
}

export interface TwinData {
  id: string;
  name: string;
  occupation?: string | null;
  preferredLanguages?: string[];
}

export interface ScoredMemory {
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

export interface PersonalityTrait {
  id: string;
  twinId: string;
  trait: string;
  value: number;
  confidence: number;
  provenance: 'explicit' | 'inferred';
  evidence: { text: string; sourceId?: string }[];
  createdAt: string;
  lastUpdated: string;
}

export interface CommunicationStyleCharacteristic {
  id: string;
  twinId: string;
  characteristic: string;
  value: unknown;
  confidence: number;
  provenance: 'explicit' | 'inferred';
  createdAt: string;
  lastUpdated: string;
}

export interface KgEntity {
  id: string;
  twinId: string;
  name: string;
  type: string; // KgEntityType
  description?: string | null;
  metadata: Record<string, unknown>;
  confidence: number;
  provenance: 'explicit' | 'inferred';
  createdAt: string;
  updatedAt: string;
}

export interface KgRelationship {
  id: string;
  twinId: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: string; // KgRelationshipType
  description?: string | null;
  confidence: number;
  provenance: 'explicit' | 'inferred';
  createdAt: string;
  updatedAt: string;
}

export interface TwinBrainOutput {
  response: string;
  explanation: string; // Safe explanation of reasoning
  confidence: number;
  relevantMemories: ScoredMemory[];
  relevantPersonalityTraits: PersonalityTrait[];
  relevantCommunicationStyle: CommunicationStyleCharacteristic[];
  relevantKgEntities: KgEntity[];
  relevantKgRelationships: KgRelationship[];
  relevantDecisions: Decision[];
  knownFacts: string[];
  inferences: string[];
  unknownInformation: string[];
  decisionPrediction?: DecisionPrediction; // Optional decision prediction output
  conversationId?: string; // ID of the conversation this message belongs to
}

export interface Decision {
  id: string;
  twinId: string;
  description: string;
  context?: string | null;
  options: string[];
  chosen?: string | null;
  rationale?: string | null;
  decisionDate?: string | null;
  status: 'active' | 'revised';
}

export interface DecisionPrediction {
  prediction: string;
  confidence: number;
  mainFactors: string[];
  alternativePossibilities: string[];
}

export interface Conversation {
  id: string;
  twinId: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: string;
}


export interface Source {
  id: string;
  name: string;
  status: 'uploaded' | 'processing' | 'processed' | 'failed';
  fileName: string;
  fileSize: number;
  createdAt: string;
  lastError?: string;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers as Record<string, string>),
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* ignore non-JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  request: request as <T>(path: string, opts?: RequestInit) => Promise<T>,
  register: (data: { email: string; name: string; password: string }) =>
    request<{ token: string; user: ApiUser }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data: { email: string; password: string }) =>
    request<{ token: string; user: ApiUser }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request<ApiUser>('/auth/me'),
  createTwin: (data: Record<string, unknown>) => request<TwinData>('/twins', { method: 'POST', body: JSON.stringify(data) }),
  getTwin: () => request<TwinData | null>('/twins/me'),
  getSources: () => request<Source[]>('/sources'),
  deleteSource: (id: string) => request<{ ok: boolean }>(`/sources/${id}`, { method: 'DELETE' }),
  memory: {
    query: (data: { query: string; limit?: number }) => request<{ query: string; results: ScoredMemory[] }>('/memory/query', { method: 'POST', body: JSON.stringify(data) }),
  },
  personality: {
    infer: () => request<{ message: string }>('/personality/infer', { method: 'POST' }),
    getTraits: () => request<PersonalityTrait[]>('/personality/traits'),
    updateTrait: (id: string, data: { value?: number; confidence?: number; evidence?: { text: string; sourceId?: string }[]; provenance?: 'explicit' | 'inferred' }) =>
      request<PersonalityTrait>(`/personality/traits/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  },
  communicationStyle: {
    analyze: () => request<{ message: string }>('/communication-style/analyze', { method: 'POST' }),
    getProfile: () => request<CommunicationStyleCharacteristic[]>('/communication-style/profile'),
    updateCharacteristic: (id: string, data: { value?: unknown; confidence?: number; provenance?: 'explicit' | 'inferred' }) =>
      request<CommunicationStyleCharacteristic>(`/communication-style/profile/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    getMatchScore: (text: string) => request<{ score: number }>('/communication-style/match-score', { method: 'POST', body: JSON.stringify({ text }) }),
  },
  kg: {
    createEntity: (data: { name: string; type: string; description?: string; metadata?: Record<string, unknown> }) =>
      request<KgEntity>('/kg/entity', { method: 'POST', body: JSON.stringify(data) }),
    createRelationship: (data: { sourceEntityId: string; targetEntityId: string; type: string; description?: string }) =>
      request<KgRelationship>('/kg/relationship', { method: 'POST', body: JSON.stringify(data) }),
    getEntities: (type?: string) => request<KgEntity[]>(`/kg/entities${type ? `?type=${type}` : ''}`),
    getRelationships: (type?: string) => request<KgRelationship[]>(`/kg/relationships${type ? `?type=${type}` : ''}`),
    getFullGraph: () => request<{ entities: KgEntity[]; relationships: KgRelationship[] }>('/kg/full-graph'),
    getConnectedGraph: (entityId: string) =>
      request<{ entity: KgEntity; relationships: KgRelationship[]; connectedEntities: KgEntity[] }>(`/kg/entity/${entityId}/connected`),
  },
  twinBrain: {
    process: (query: string, conversationId?: string) => request<TwinBrainOutput>('/twin-brain/process', { method: 'POST', body: JSON.stringify({ query, conversationId }) }),
    getConversations: () => request<Conversation[]>('/twin-brain/conversations'),
    getMessages: (conversationId: string) => request<{ conversation: Conversation; messages: ConversationMessage[] }>(`/twin-brain/conversations/${conversationId}/messages`),
  },
};