// pdf-parse لا يوفّر أنواعاً. نستورد المسار الداخلي لتفادي كود التجربة في index.js.
declare module 'pdf-parse/lib/pdf-parse.js' {
  type PdfParseResult = {
    text: string;
    numpages: number;
    numrender: number;
    info?: Record<string, unknown>;
    metadata?: unknown;
    version?: string;
  };
  function pdfParse(
    data: Buffer | Uint8Array,
    options?: Record<string, unknown>,
  ): Promise<PdfParseResult>;
  export default pdfParse;
}
