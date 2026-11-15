import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../src/lib/auth';
import { api } from '../src/lib/api';
import { TwinChat } from '../src/components/TwinChat';
import { App } from '../src/App'; // To test full routing

// Mock the API calls
vi.mock('../src/lib/api', async (importActual) => {
  const actual = await importActual<typeof import('../src/lib/api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      twinBrain: {
        process: vi.fn((query: string, conversationId?: string) => {
          if (query.includes('unknown')) {
            return Promise.resolve({
              response: "I don't have enough information to answer that.",
              explanation: "Insufficient data.",
              confidence: 0.2,
              relevantMemories: [], relevantPersonalityTraits: [], relevantCommunicationStyle: [],
              relevantKgEntities: [], relevantKgRelationships: [], relevantDecisions: [],
              knownFacts: [], inferences: [], unknownInformation: ["lack of data"],
              conversationId: conversationId || 'new-conv-id-1',
            });
          }
          return Promise.resolve({
            response: `Twin's response to: ${query}`,
            explanation: `Processed "${query}" using various engines.`,
            confidence: 0.8,
            relevantMemories: [{ id: 'mem1', type: 'semantic', content: 'related fact', score: 0.8, confidence: 0.9, importance: 0.8, createdAt: new Date().toISOString(), eventAt: null }],
            relevantPersonalityTraits: [{ id: 'trait1', twinId: 'twin1', trait: 'directness', value: 0.7, confidence: 0.9, provenance: 'inferred', createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString(), evidence: [] }],
            relevantCommunicationStyle: [], relevantKgEntities: [], relevantKgRelationships: [], relevantDecisions: [],
            knownFacts: [], inferences: [], unknownInformation: [],
            conversationId: conversationId || 'new-conv-id-1',
          });
        }),
        getConversations: vi.fn(() => Promise.resolve([
          { id: 'old-conv-id', twinId: 'twin1', title: 'Old Chat', startedAt: new Date().toISOString(), createdAt: new Date().toISOString() }
        ])),
        getMessages: vi.fn((convId: string) => Promise.resolve({
          conversation: { id: convId, twinId: 'twin1', title: 'Old Chat', startedAt: new Date().toISOString(), createdAt: new Date().toISOString() },
          messages: [
            { id: 'msg1', conversationId: convId, role: 'user', content: 'Hello Twin', createdAt: new Date().toISOString() },
            { id: 'msg2', conversationId: convId, role: 'assistant', content: 'Hello User', createdAt: new Date().toISOString() },
          ]
        })),
      },
      getToken: vi.fn(() => 'mock-token'),
      me: vi.fn(() => Promise.resolve({ id: 'user1', email: 'test@test.com', name: 'Test User' })),
      getTwin: vi.fn(() => Promise.resolve({ id: 'twin1', name: 'Test Twin' })),
    },
  };
});

describe('TwinChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders chat interface and sends a message', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <TwinChat twinId="twin1" />
        </AuthProvider>
      </BrowserRouter>
    );

    // Initial state
    expect(screen.getByText('Talk to your Twin')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Type your message...')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send/i })).toBeInTheDocument();

    // Type a message
    const inputElement = screen.getByPlaceholderText('Type your message...');
    fireEvent.change(inputElement, { target: { value: 'Test query' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    // Wait for Twin's response
    await waitFor(() => {
      expect(screen.getByText('You')).toBeInTheDocument();
      expect(screen.getByText('Test query')).toBeInTheDocument();
      expect(screen.getByText('Twin')).toBeInTheDocument();
      expect(screen.getByText(/Twin's response to: Test query/)).toBeInTheDocument();
    });

    expect(api.twinBrain.process).toHaveBeenCalledWith('Test query', undefined);
  });

  it('displays conversation history and allows loading an old conversation', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <TwinChat twinId="twin1" />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Old Chat')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Old Chat'));

    await waitFor(() => {
      expect(api.twinBrain.getMessages).toHaveBeenCalledWith('old-conv-id');
      expect(screen.getByText('Hello Twin')).toBeInTheDocument();
      expect(screen.getByText('Hello User')).toBeInTheDocument();
    });
  });

  it('starts a new chat', async () => {
    render(
      <BrowserRouter>
        <AuthProvider>
          <TwinChat twinId="twin1" />
        </AuthProvider>
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Old Chat')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Start New Chat/i }));

    expect(screen.queryByText('Hello Twin')).not.toBeInTheDocument();
    expect(screen.queryByText('Old Chat')).toBeInTheDocument(); // list is still there
    expect(screen.getByText('Ask your Twin anything!')).toBeInTheDocument();
  });

  it('shows error if Twin Brain processing fails', async () => {
    (api.twinBrain.process as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API failed'));

    render(
      <BrowserRouter>
        <AuthProvider>
          <TwinChat twinId="twin1" />
        </AuthProvider>
      </BrowserRouter>
    );

    const inputElement = screen.getByPlaceholderText('Type your message...');
    fireEvent.change(inputElement, { target: { value: 'Failing query' } });
    fireEvent.click(screen.getByRole('button', { name: /send/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error: API failed/)).toBeInTheDocument();
    });
  });
});
