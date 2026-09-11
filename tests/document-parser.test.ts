import { describe, it, expect } from 'vitest';
import { parseDocument, documentToPromptBlock } from '@/lib/document-parser';
import { makePdf, makeDocx } from './fixtures';

describe('تحليل المستندات', () => {
  it('يستخرج النص من ملف PDF', async () => {
    const buffer = await makePdf(
      'Mizan Agent test document with enough extractable text to prove the parser works.',
    );
    const result = await parseDocument({
      filename: 'test.pdf',
      mimeType: 'application/pdf',
      buffer,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe('pdf');
      expect(result.text).toContain('Mizan Agent test document');
      expect(result.charCount).toBeGreaterThan(40);
      expect(result.pageCount).toBe(1);
      expect(result.needsOcr).toBe(false);
    }
  });

  it('يكتشف PDF بلا طبقة نصية ويطلب OCR', async () => {
    const buffer = await makePdf('');
    const result = await parseDocument({
      filename: 'scanned.pdf',
      mimeType: 'application/pdf',
      buffer,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.needsOcr).toBe(true);
      expect(result.warnings.join(' ')).toContain('OCR');
    }
  });

  it('يستخرج النص من ملف DOCX', async () => {
    const buffer = await makeDocx('عقد اتفاقية بين الطرف الأول والطرف الثاني');
    const result = await parseDocument({
      filename: 'contract.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.kind).toBe('docx');
      expect(result.text).toContain('الطرف الأول');
    }
  });

  it('يرفض الملفات غير المدعومة', async () => {
    const result = await parseDocument({
      filename: 'image.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unsupported');
      expect(result.error).toContain('OCR');
    }
  });

  it('يرفض الملفات التي تتجاوز الحد الأقصى', async () => {
    const result = await parseDocument({
      filename: 'big.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.alloc(11 * 1024 * 1024, 1),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('too_large');
  });

  it('يرفض ملف PDF تالفاً', async () => {
    const result = await parseDocument({
      filename: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('this is not a pdf at all'),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('corrupt');
  });

  it('يبني كتلة نصية موسومة للنموذج', async () => {
    const buffer = await makeDocx('نص تجريبي');
    const result = await parseDocument({
      filename: 'a.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      buffer,
    });
    if (!result.ok) throw new Error('expected success');
    const block = documentToPromptBlock(result);
    expect(block).toContain('<document>');
    expect(block).toContain('a.docx');
  });
});
