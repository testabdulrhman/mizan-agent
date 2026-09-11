import { createRequire } from 'node:module';
import { checkUploadedFile, sanitizeText, type SupportedMime } from './security';

/* ==========================================================================
 * document-parser.ts — استخراج النص من المستندات المرفوعة.
 * PDF عبر pdf-parse، DOCX عبر mammoth، والنصوص مباشرة.
 * لا يُحفظ أي ملف على القرص من هنا: نعمل على Buffer في الذاكرة فقط.
 * ========================================================================== */

export type ParsedDocument = {
  ok: true;
  filename: string;
  mimeType: SupportedMime;
  kind: 'pdf' | 'docx' | 'text';
  text: string;
  charCount: number;
  pageCount?: number;
  truncated: boolean;
  /** PDF ممسوح ضوئياً: لا طبقة نص، يحتاج OCR غير المتوفر في هذه النسخة. */
  needsOcr: boolean;
  warnings: string[];
};

export type ParseFailure = {
  ok: false;
  filename: string;
  error: string;
  code: 'unsupported' | 'too_large' | 'corrupt' | 'empty' | 'encrypted';
};

export type ParseOutcome = ParsedDocument | ParseFailure;

const MAX_TEXT_CHARS = 120_000;

/** أقل عدد حروف لكل صفحة يُعتبر دونه ملف PDF ممسوحاً ضوئياً. */
const OCR_THRESHOLD_PER_PAGE = 40;

export async function parseDocument(input: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ParseOutcome> {
  const check = checkUploadedFile({
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.buffer.byteLength,
  });

  if (!check.ok) {
    const code = check.reason.includes('حجم') ? 'too_large' : 'unsupported';
    return { ok: false, filename: input.filename, error: check.reason, code };
  }

  switch (check.mimeType) {
    case 'application/pdf':
      return parsePdf(input.filename, input.buffer);
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return parseDocx(input.filename, input.buffer);
    default:
      return parsePlainText(input.filename, check.mimeType, input.buffer);
  }
}

/* -------------------------------- PDF -------------------------------- */

async function parsePdf(filename: string, buffer: Buffer): Promise<ParseOutcome> {
  if (!buffer.subarray(0, 5).toString('latin1').startsWith('%PDF-')) {
    return {
      ok: false,
      filename,
      code: 'corrupt',
      error: 'الملف لا يبدأ بترويسة PDF صالحة — قد يكون تالفاً أو ليس PDF فعلياً.',
    };
  }

  let data: { text: string; numpages: number; info?: Record<string, unknown> };
  try {
    // نحمّل الحزمة عبر require وقت التشغيل: حزم التجميع تكسر داخليات pdfjs،
    // ونستهدف المسار الداخلي لتفادي كود التجربة في index.js الخاص بالحزمة.
    const requireFromHere = createRequire(import.meta.url);
    const pdfParse = requireFromHere('pdf-parse/lib/pdf-parse.js') as (
      b: Uint8Array,
    ) => Promise<typeof data>;
    // نمرر Uint8Array عادياً وليس Buffer: نسخة pdfjs المدمجة في pdf-parse
    // تتعامل مع Buffer بشكل خاطئ داخل بيئة تشغيل Next وتفشل بـ "bad XRef entry".
    data = await pdfParse(new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength));
  } catch (err) {
    const message = (err as Error)?.message ?? '';
    if (/password|encrypt/i.test(message)) {
      return {
        ok: false,
        filename,
        code: 'encrypted',
        error: 'الملف محمي بكلمة مرور. أزل الحماية ثم أعد رفعه.',
      };
    }
    return {
      ok: false,
      filename,
      code: 'corrupt',
      error: `تعذّر قراءة ملف PDF: ${message || 'ملف غير صالح'}`,
    };
  }

  const raw = (data.text ?? '').trim();
  const pages = data.numpages || 1;
  const warnings: string[] = [];
  const needsOcr = raw.length < OCR_THRESHOLD_PER_PAGE * pages;

  if (needsOcr) {
    warnings.push(
      'لم أجد طبقة نصية كافية في هذا الـ PDF. غالباً ملف ممسوح ضوئياً (صور) ويحتاج OCR غير المتوفر في هذه النسخة.',
    );
  }

  const text = sanitizeText(raw, MAX_TEXT_CHARS);
  return {
    ok: true,
    filename,
    mimeType: 'application/pdf',
    kind: 'pdf',
    text,
    charCount: raw.length,
    pageCount: pages,
    truncated: raw.length > MAX_TEXT_CHARS,
    needsOcr,
    warnings,
  };
}

/* -------------------------------- DOCX -------------------------------- */

async function parseDocx(filename: string, buffer: Buffer): Promise<ParseOutcome> {
  // DOCX هو أرشيف ZIP: يبدأ بـ PK.
  if (buffer.subarray(0, 2).toString('latin1') !== 'PK') {
    return {
      ok: false,
      filename,
      code: 'corrupt',
      error: 'الملف ليس مستند DOCX صالحاً (ربما DOC قديم؟ الصيغة القديمة غير مدعومة بعد).',
    };
  }

  try {
    const mammoth = await import('mammoth');
    const extract = (mammoth.default ?? mammoth).extractRawText;
    const result = await extract({ buffer });
    const raw = (result.value ?? '').trim();
    const warnings = (result.messages ?? [])
      .filter((m: { type?: string }) => m.type === 'warning')
      .slice(0, 5)
      .map((m: { message?: string }) => m.message ?? '')
      .filter(Boolean);

    if (!raw) {
      return {
        ok: false,
        filename,
        code: 'empty',
        error: 'المستند لا يحتوي على نص قابل للاستخراج.',
      };
    }

    return {
      ok: true,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      kind: 'docx',
      text: sanitizeText(raw, MAX_TEXT_CHARS),
      charCount: raw.length,
      truncated: raw.length > MAX_TEXT_CHARS,
      needsOcr: false,
      warnings,
    };
  } catch (err) {
    return {
      ok: false,
      filename,
      code: 'corrupt',
      error: `تعذّر قراءة ملف DOCX: ${(err as Error)?.message ?? 'ملف غير صالح'}`,
    };
  }
}

/* -------------------------------- نص -------------------------------- */

async function parsePlainText(
  filename: string,
  mimeType: SupportedMime,
  buffer: Buffer,
): Promise<ParseOutcome> {
  const raw = buffer.toString('utf-8').trim();
  if (!raw) {
    return { ok: false, filename, code: 'empty', error: 'الملف النصي فارغ.' };
  }
  return {
    ok: true,
    filename,
    mimeType,
    kind: 'text',
    text: sanitizeText(raw, MAX_TEXT_CHARS),
    charCount: raw.length,
    truncated: raw.length > MAX_TEXT_CHARS,
    needsOcr: false,
    warnings: [],
  };
}

/* --------------------------- تنسيق للنموذج --------------------------- */

/** يحوّل نتيجة التحليل إلى كتلة نصية موسومة لتمريرها للنموذج. */
export function documentToPromptBlock(doc: ParsedDocument): string {
  const meta = [
    `الملف: ${doc.filename}`,
    `النوع: ${doc.kind.toUpperCase()}`,
    doc.pageCount ? `عدد الصفحات: ${doc.pageCount}` : null,
    `عدد الحروف: ${doc.charCount}`,
    doc.truncated ? 'ملاحظة: تم اقتطاع النص لتجاوزه الحد.' : null,
    doc.needsOcr ? 'تحذير: لا توجد طبقة نصية كافية (يحتاج OCR).' : null,
  ]
    .filter(Boolean)
    .join(' | ');

  return `<document>\n${meta}\n---\n${doc.text}\n</document>`;
}

/** تحذير ثابت يُضاف لأي تحليل ذي طابع قانوني. */
export const LEGAL_DISCLAIMER =
  'هذا التحليل مسوّدة آلية للمراجعة البشرية وليس استشارة قانونية نهائية. راجعه مع مختص قبل الاعتماد عليه.';
