import { describe, it, expect } from 'vitest';
import { createProvider } from '../src/index';

describe('createProvider', () => {
  it('exposes default model names', () => {
    const p = createProvider();
    expect(p.chatModel).toBe('gpt-4o-mini');
    expect(p.embeddingModel).toBe('text-embedding-3-small');
  });

  it('honors overrides', () => {
    const p = createProvider({ chatModel: 'gpt-4o', embeddingModel: 'text-embedding-3-large' });
    expect(p.chatModel).toBe('gpt-4o');
    expect(p.embeddingModel).toBe('text-embedding-3-large');
  });

  it.skip('extracts JSON (requires API key)', async () => {
    const p = createProvider();
    const schema = {
      type: 'object',
      properties: {
        greeting: { type: 'string' },
        value: { type: 'number' },
      },
      required: ['greeting', 'value'],
    };
    const res = await p.extractJson<{ greeting: string; value: number }>(
      'You are a JSON generating API. Respond with a greeting and a numeric value.',
      'Generate a greeting and the number 42.',
      schema,
    );
    expect(res).not.toBeNull();
    expect(res?.greeting).toBeTypeOf('string');
    expect(res?.value).toBe(42);
  });
});
