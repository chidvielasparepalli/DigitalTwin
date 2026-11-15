export interface Chunk {
  index: number;
  text: string;
}

export interface ChunkOptions {
  /** Target chunk size in characters. */
  size?: number;
  /** Overlap between chunks, in characters. */
  overlap?: number;
}

/**
 * Split text into overlapping chunks on sentence/paragraph boundaries.
 * Falls back to hard cuts for very long words/paragraphs.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): Chunk[] {
  const size = opts.size ?? 1500;
  const overlap = Math.min(opts.overlap ?? 150, size - 1);
  if (!text.trim()) return [];

  const chunks: Chunk[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + size;

    if (end < text.length) {
      // Back up to the nearest sentence/paragraph boundary.
      const window = text.slice(start, end);
      const lastNewline = window.lastIndexOf('\n\n');
      const lastPeriod = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
        window.lastIndexOf('।'),
      );
      const boundary = Math.max(lastNewline, lastPeriod);
      if (boundary > size / 2) end = start + boundary + (lastNewline > lastPeriod ? 0 : 1);
    }

    const slice = text.slice(start, end).trim();
    if (slice) chunks.push({ index: chunks.length, text: slice });

    if (end >= text.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
