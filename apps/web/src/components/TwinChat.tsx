import { useState, useRef, useEffect, useCallback } from 'react';
import { api, ApiError, type TwinBrainOutput, type Conversation, type ConversationMessage } from '../lib/api';

interface ChatMessage {
  role: 'user' | 'twin' | 'system'; // 'system' for errors
  content: string;
  conversationId?: string; // Link to the conversation
  output?: TwinBrainOutput; // Only present for Twin's full response
}

export function TwinChat({ twinId }: { twinId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | undefined>(undefined);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchConversations = useCallback(async () => {
    try {
      const convos = await api.twinBrain.getConversations();
      setConversations(convos);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
      setError(err instanceof ApiError ? err.message : 'Failed to fetch conversations');
    }
  }, []);

  const loadConversation = useCallback(async (convId: string) => {
    setBusy(true);
    setError(null);
    try {
      const { messages: msgs } = await api.twinBrain.getMessages(convId);
      setMessages(msgs.map(m => ({
        role: m.role === 'user' ? 'user' : 'twin', // map 'assistant' to 'twin'
        content: m.content,
        conversationId: m.conversationId,
      })));
      setCurrentConversationId(convId);
    } catch (err) {
      console.error('Failed to load conversation:', err);
      setError(err instanceof ApiError ? err.message : 'Failed to load conversation');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  useEffect(scrollToBottom, [messages]);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || busy) return;

    const userMessage: ChatMessage = { role: 'user', content: input, conversationId: currentConversationId };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setError(null);
    setBusy(true);

    try {
      const response = await api.twinBrain.process(input, currentConversationId);
      const twinMessage: ChatMessage = { role: 'twin', content: response.response, output: response, conversationId: response.conversationId };
      setMessages((prev) => [...prev, twinMessage]);
      setCurrentConversationId(response.conversationId); // Update if new conversation started
      fetchConversations(); // Refresh conversation list
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed to get Twin response';
      setError(msg);
      setMessages((prev) => [...prev, { role: 'twin', content: `Error: ${msg}`, conversationId: currentConversationId }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card chat-card">
      <h3>Talk to your Twin</h3>
      <div className="chat-area">
        <div className="conversation-sidebar">
          <h4>Conversations</h4>
          <ul className="conversation-list">
            {conversations.length === 0 && <li className="muted small">No conversations yet.</li>}
            {conversations.map(conv => (
              <li
                key={conv.id}
                className={conv.id === currentConversationId ? 'active' : ''}
                onClick={() => loadConversation(conv.id)}
              >
                <span>{conv.title || 'New Chat'}</span>
                <span className="muted small">{new Date(conv.startedAt).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
          <button onClick={() => { setMessages([]); setCurrentConversationId(undefined); }} className="small">Start New Chat</button>
        </div>

        <div className="chat-main">
          <div className="chat-window">
            {messages.length === 0 && <p className="muted center-text">Ask your Twin anything!</p>}
            {messages.map((msg, idx) => (
              <div key={idx} className={`chat-message ${msg.role}`}>
                <span className="chat-role">{msg.role === 'user' ? 'You' : 'Twin'}</span>
                <div className="chat-content">
                  {msg.content}
                  {msg.output && (
                    <div className="chat-metadata">
                      <p className="muted small">
                        Confidence: {(msg.output.confidence * 100).toFixed(0)}% ·
                        Memories: {msg.output.relevantMemories.length} ·
                        KG Entities: {msg.output.relevantKgEntities.length}
                      </p>
                      {msg.output.decisionPrediction && (
                        <div className="decision-prediction-summary">
                          <strong>Prediction:</strong> {msg.output.decisionPrediction.prediction} ({(msg.output.decisionPrediction.confidence * 100).toFixed(0)}% confident)
                          <p className="small muted">Factors: {msg.output.decisionPrediction.mainFactors.join(', ')}</p>
                          {msg.output.decisionPrediction.alternativePossibilities.length > 0 && (
                            <p className="small muted">Alternatives: {msg.output.decisionPrediction.alternativePossibilities.join('; ')}</p>
                          )}
                        </div>
                      )}
                      <details>
                        <summary className="small">Explanation</summary>
                        <p className="small">{msg.output.explanation}</p>
                        {msg.output.relevantMemories.length > 0 && (
                          <details>
                            <summary className="small">Relevant Memories</summary>
                            <ul>
                              {msg.output.relevantMemories.map((mem) => (
                                <li key={mem.id} className="small">{mem.content} (Score: {mem.score.toFixed(2)})</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {/* Add other relevant info like Personality Traits, KG, Decisions */}
                        {msg.output.relevantPersonalityTraits.length > 0 && (
                          <details>
                            <summary className="small">Relevant Personality Traits</summary>
                            <ul>
                              {msg.output.relevantPersonalityTraits.map((trait) => (
                                <li key={trait.id} className="small">{trait.trait.replace(/_/g, ' ')}: {(trait.value * 100).toFixed(0)}% (Confidence: {(trait.confidence * 100).toFixed(0)}%)</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {msg.output.relevantKgEntities.length > 0 && (
                          <details>
                            <summary className="small">Relevant KG Entities</summary>
                            <ul>
                              {msg.output.relevantKgEntities.map((entity) => (
                                <li key={entity.id} className="small">{entity.name} ({entity.type})</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {msg.output.relevantDecisions.length > 0 && (
                          <details>
                            <summary className="small">Relevant Decisions</summary>
                            <ul>
                              {msg.output.relevantDecisions.map((dec) => (
                                <li key={dec.id} className="small">{dec.description} (Chosen: {dec.chosen})</li>
                              ))}
                            </ul>
                          </details>
                        )}
                      </details>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <form onSubmit={handleSubmit} className="chat-input-form">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              disabled={busy}
            />
            <button type="submit" disabled={busy}>Send</button>
          </form>
        </div>
      </div>
      {error && <p className="err">{error}</p>}
    </div>
  );
}