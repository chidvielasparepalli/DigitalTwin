import { describe, it, expect } from 'vitest';
import { chunkText, extractMemoryCandidates } from '../src/index';

describe('chunkText', () => {
  it('splits long text on boundaries with overlap', () => {
    const para = 'The quick brown fox jumps over the lazy dog. '.repeat(200);
    const chunks = chunkText(para, { size: 300, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    // Chunks respect the size cap.
    expect(chunks.every((c) => c.text.length <= 350)).toBe(true);
    // Coverage: reconstruct roughly covers the whole text.
    const joined = chunks.map((c) => c.text).join(' ');
    expect(joined.length).toBeGreaterThan(para.length * 0.9);
  });

  it('returns [] for empty', () => {
    expect(chunkText('')).toEqual([]);
  });

  it('keeps short text as one chunk', () => {
    const chunks = chunkText('Hello there. Nice day.', { size: 1000 });
    expect(chunks.length).toBe(1);
    expect(chunks[0]?.text).toBe('Hello there. Nice day.');
  });
});

describe('extractMemoryCandidates', () => {
  it('extracts first-person sentences', () => {
    const text = 'I moved to Hyderabad in 2024. It was a big change for me. The weather is hot.';
    const mems = extractMemoryCandidates(text);
    expect(mems.length).toBeGreaterThan(0);
    expect(mems[0]!.content).toMatch(/^(I|It)/);
  });

  it('classifies preference-like content', () => {
    const mems = extractMemoryCandidates('I really prefer remote work over the office.');
    expect(mems[0]?.type).toBe('preference');
  });

  it('classifies decision-like content', () => {
    const mems = extractMemoryCandidates('I decided to reject the Bangalore offer.');
    expect(mems[0]?.type).toBe('decision');
  });

  it('returns empty for non-personal text', () => {
    expect(extractMemoryCandidates('The earth orbits the sun.')).toEqual([]);
  });
});
