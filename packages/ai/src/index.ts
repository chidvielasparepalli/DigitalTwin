import OpenAI from 'openai';

export interface AiConfig {
  apiKey?: string;
  /** Default model for generation (chat/completions). */
  chatModel?: string;
  /** Default model for embeddings. */
  embeddingModel?: string;
}

export interface AiProvider {
  readonly chatModel: string;
  readonly embeddingModel: string;
  /** Embed a batch of texts into float vectors. */
  embed(texts: string[]): Promise<number[][]>;
  /** Single-turn completion. Used by ingestion/extraction in later phases. */
  complete(system: string, user: string): Promise<string>;
  /** Structured extraction using JSON mode. */
  extractJson<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T | null>;
}

export { TwinBrain, type TwinBrainInput, type TwinBrainOutput } from './twin-brain';

const DEFAULT_CHAT = 'gpt-4o-mini';
const DEFAULT_EMBEDDING = 'text-embedding-3-small';

/**
 * Thin OpenAI wrapper. Later phases (Twin Brain, chat streaming) extend
 * this interface rather than importing the SDK directly.
 */
export function createProvider(config: AiConfig = {}): AiProvider {
  const client = new OpenAI({ apiKey: config.apiKey });
  const chatModel = config.chatModel ?? DEFAULT_CHAT;
  const embeddingModel = config.embeddingModel ?? DEFAULT_EMBEDDING;

  return {
    chatModel,
    embeddingModel,
    async embed(texts) {
      const res = await client.embeddings.create({ model: embeddingModel, input: texts });
      return res.data.map((d) => d.embedding);
    },
    async complete(system, user) {
      const res = await client.chat.completions.create({
        model: chatModel,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });
      return res.choices[0]?.message.content ?? '';
    },
    /** Structured extraction using JSON mode. */
    async extractJson<T>(system: string, user: string, schema: Record<string, unknown>): Promise<T | null> {
      try {
        const res = await client.chat.completions.create({
          model: chatModel,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: { type: 'json_object' },
        });
        const content = res.choices[0]?.message.content;
        if (!content) return null;
        return JSON.parse(content) as T;
      } catch (error) {
        console.error('JSON extraction failed:', error);
        return null;
      }
    },
  };
}
