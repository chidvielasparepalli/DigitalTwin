import { createHash } from 'node:crypto';

export interface ExtractedDoc {
  /** Plain text, normalized whitespace. */
  text: string;
  title: string;
  metadata: Record<string, string | number>;
}

/** Supported file types and the extractors that handle them. */
export type DocKind = 'txt' | 'md' | 'json' | 'csv' | 'pdf';

export const MIME_BY_KIND: Record<DocKind, string[]> = {
  txt: ['text/plain'],
  md: ['text/markdown', 'text/plain'],
  json: ['application/json'],
  csv: ['text/csv'],
  pdf: ['application/pdf'],
};

/** Best-effort kind from filename + declared mime. */
export function detectKind(fileName: string, mime?: string): DocKind | null {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext && ext in MIME_BY_KIND) return ext as DocKind;
  if (mime) {
    for (const [kind, mimes] of Object.entries(MIME_BY_KIND)) {
      if (mimes.includes(mime)) return kind as DocKind;
    }
  }
  return null;
}

/** Validate upload. Returns error message or null. */
export function validateUpload(
  fileName: string,
  size: number,
  kind: DocKind,
  opts: { maxBytes?: number } = {},
): string | null {
  const max = opts.maxBytes ?? 10 * 1024 * 1024; // 10MB default
  if (size <= 0) return 'empty file';
  if (size > max) return `file too large (max ${Math.round(max / 1024 / 1024)}MB)`;
  if (!fileName) return 'missing filename';
  if (!kind) return 'unsupported file type';
  return null;
}

const MAX_TEXT_BYTES = 5 * 1024 * 1024;

function guardText(text: string): string {
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
    throw new Error('extracted text too large');
  }
  return text;
}

/** Normalize: collapse blank runs, strip leading/trailing spaces per line, drop NULs. */
export function cleanText(raw: string): string {
  const NUL = String.fromCharCode(0);
  return raw
    .split(NUL)
    .join('')
    .split('\n')
    .map((l) => l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function checksum(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

export interface Extractor {
  kind: DocKind;
  /** Extract text from a UTF-8 text buffer. Throws on bad input. */
  extractText(buf: Buffer, fileName: string): Promise<string>;
}

export const TEXT_EXTRACTORS: Extractor[] = [
  {
    kind: 'txt',
    async extractText(buf) {
      return guardText(cleanText(buf.toString('utf8')));
    },
  },
  {
    kind: 'md',
    async extractText(buf) {
      const raw = buf.toString('utf8');
      // Strip fenced code blocks' markers (keep body), strip headings/task markers.
      const withoutFences = raw.replace(/```[a-z]*\n/g, '\n').replace(/```/g, '\n');
      const clean = withoutFences
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '• ')
        .replace(/^\s*\d+\.\s+/gm, '• ');
      return guardText(cleanText(clean));
    },
  },
  {
    kind: 'json',
    async extractText(buf) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(buf.toString('utf8'));
      } catch {
        throw new Error('invalid JSON');
      }
      const parts: string[] = [];
      const walk = (v: unknown, key = '') => {
        if (v === null || v === undefined) return;
        if (typeof v === 'string') parts.push(key ? `${key}: ${v}` : v);
        else if (typeof v === 'number' || typeof v === 'boolean') parts.push(key ? `${key}: ${v}` : String(v));
        else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${key}[${i}]`));
        else if (typeof v === 'object') for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, k);
      };
      walk(parsed);
      return guardText(cleanText(parts.join('\n')));
    },
  },
  {
    kind: 'csv',
    async extractText(buf) {
      const raw = buf.toString('utf8').replace(/\r\n?/g, '\n').trim();
      if (!raw) return '';
      const lines = raw.split('\n');
      // Emit header row once, then each data row as a line.
      const header = lines[0] ?? '';
      const rows = lines.slice(1).filter(Boolean);
      return guardText(cleanText([header, ...rows].join('\n')));
    },
  },
  {
    kind: 'pdf',
    // Lazy import keeps pdf-parse out of the hot path for non-PDF files.
    async extractText(buf) {
      const { default: pdfParse } = await import('pdf-parse');
      const data = await pdfParse(buf);
      return guardText(cleanText(data.text));
    },
  },
];

export async function extractDocument(buf: Buffer, fileName: string, kind: DocKind): Promise<ExtractedDoc> {
  const ex = TEXT_EXTRACTORS.find((e) => e.kind === kind);
  if (!ex) throw new Error(`no extractor for ${kind}`);
  const text = await ex.extractText(buf, fileName);
  if (!text) throw new Error('no text extracted');
  const base = fileName.split('.')[0] ?? 'document';
  return { text, title: base, metadata: { ext: kind, bytes: buf.length } };
}
