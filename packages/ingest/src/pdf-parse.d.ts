declare module 'pdf-parse' {
  interface PdfData {
    numpages: number;
    text: string;
  }
  const pdfParse: (dataBuffer: Buffer, options?: Record<string, unknown>) => Promise<PdfData>;
  export default pdfParse;
}
