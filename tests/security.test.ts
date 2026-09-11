import { describe, it, expect } from 'vitest';
import {
  extractUrls,
  assertSafeUrlShape,
  assertPublicUrl,
  isPrivateAddress,
  checkUploadedFile,
  isSafeProjectPath,
  SsrfError,
} from '@/lib/security';

describe('استخراج الروابط من الرسالة', () => {
  it('يستخرج رابطاً واحداً من نص عربي', () => {
    const urls = extractUrls('من فضلك لخص لي هذه الصفحة https://example.com/article شكراً');
    expect(urls).toEqual(['https://example.com/article']);
  });

  it('يتجاهل علامات الترقيم الملتصقة بنهاية الرابط', () => {
    expect(extractUrls('انظر https://example.com/a.')).toEqual(['https://example.com/a']);
    expect(extractUrls('(https://example.com/b)')).toEqual(['https://example.com/b']);
  });

  it('يدعم www بلا بروتوكول ويضيف https', () => {
    expect(extractUrls('زر www.example.com/x')).toEqual(['https://www.example.com/x']);
  });

  it('يستخرج عدة روابط بلا تكرار وبترتيب الظهور', () => {
    const urls = extractUrls('https://a.com و https://b.com ثم https://a.com مرة أخرى');
    expect(urls).toEqual(['https://a.com/', 'https://b.com/']);
  });

  it('يعيد قائمة فارغة عند غياب الروابط', () => {
    expect(extractUrls('اكتب لي دالة تجمع رقمين')).toEqual([]);
  });
});

describe('منع SSRF', () => {
  const blocked = [
    'http://localhost:3000/admin',
    'http://127.0.0.1/',
    'http://0.0.0.0/',
    'http://10.0.0.5/internal',
    'http://192.168.1.1/',
    'http://172.16.4.4/',
    'http://169.254.169.254/latest/meta-data/',
    'http://metadata.google.internal/computeMetadata/v1/',
    'http://[::1]/',
    'http://service.internal/',
    'http://printer.local/',
    'file:///etc/passwd',
    'ftp://example.com/x',
    'http://user:pass@example.com/',
    'http://example.com:22/',
    'http://2130706433/',
  ];

  for (const url of blocked) {
    it(`يمنع ${url}`, () => {
      expect(() => assertSafeUrlShape(url)).toThrow(SsrfError);
    });
  }

  it('يسمح بالروابط العامة', () => {
    expect(() => assertSafeUrlShape('https://example.com/page?q=1')).not.toThrow();
    expect(() => assertSafeUrlShape('http://example.org:8080/x')).not.toThrow();
  });

  it('يصنّف العناوين الخاصة بشكل صحيح', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.1.2.3')).toBe(true);
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700::1111')).toBe(false);
  });

  it('يمنع النطاق الذي يشير إلى عنوان داخلي بعد DNS', async () => {
    await expect(assertPublicUrl('http://localhost.localdomain/')).rejects.toBeInstanceOf(
      SsrfError,
    );
  });
});

describe('فحص الملفات المرفوعة', () => {
  it('يقبل PDF و DOCX', () => {
    expect(
      checkUploadedFile({ filename: 'a.pdf', mimeType: 'application/pdf', size: 1000 }).ok,
    ).toBe(true);
    expect(
      checkUploadedFile({
        filename: 'a.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: 1000,
      }).ok,
    ).toBe(true);
  });

  it('يرفض الأنواع غير المدعومة برسالة واضحة', () => {
    const exe = checkUploadedFile({
      filename: 'x.exe',
      mimeType: 'application/x-msdownload',
      size: 100,
    });
    expect(exe.ok).toBe(false);
    if (!exe.ok) expect(exe.reason).toContain('غير مدعوم');

    const doc = checkUploadedFile({ filename: 'x.doc', mimeType: 'application/msword', size: 100 });
    expect(doc.ok).toBe(false);
    if (!doc.ok) expect(doc.reason).toContain('DOC');
  });

  it('يرفض الملف الذي يتجاوز الحد الأقصى للحجم', () => {
    const result = checkUploadedFile({
      filename: 'big.pdf',
      mimeType: 'application/pdf',
      size: 11 * 1024 * 1024,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('الحد المسموح');
  });

  it('يرفض الملف الفارغ', () => {
    const result = checkUploadedFile({ filename: 'a.pdf', mimeType: 'application/pdf', size: 0 });
    expect(result.ok).toBe(false);
  });
});

describe('مسارات ملفات المشاريع', () => {
  it('يمنع الهروب من المجلد', () => {
    expect(isSafeProjectPath('../../etc/passwd')).toBe(false);
    expect(isSafeProjectPath('/etc/passwd')).toBe(false);
    expect(isSafeProjectPath('C:/windows/x')).toBe(false);
    expect(isSafeProjectPath('src/../../x')).toBe(false);
  });

  it('يقبل المسارات النسبية العادية', () => {
    expect(isSafeProjectPath('index.js')).toBe(true);
    expect(isSafeProjectPath('src/lib/util.ts')).toBe(true);
  });
});

describe('النطاقات المكتوبة بلا بروتوكول', () => {
  it('يتعرف على نطاق مجرد داخل رسالة عربية', () => {
    expect(extractUrls('افتح redwan.sa وشوف المحتوى')).toEqual(['https://redwan.sa/']);
    expect(extractUrls('redwan.sa')).toEqual(['https://redwan.sa/']);
  });

  it('يتعرف على نطاق مع مسار', () => {
    expect(extractUrls('شوف example.com/blog/post-1')).toEqual([
      'https://example.com/blog/post-1',
    ]);
  });

  it('لا يكرر الرابط الملتقط بالبروتوكول', () => {
    expect(extractUrls('https://example.com/a وأيضاً example.com/a')).toEqual([
      'https://example.com/a',
    ]);
  });

  it('لا يعتبر أسماء الملفات روابط', () => {
    expect(extractUrls('عدّل index.js ثم package.json')).toEqual([]);
    expect(extractUrls('ارفع report.pdf و data.csv')).toEqual([]);
    expect(extractUrls('الملف styles.css والسكربت deploy.sh')).toEqual([]);
  });

  it('لا يعتبر البريد الإلكتروني رابطاً', () => {
    expect(extractUrls('راسلني على ahmed@example.com')).toEqual([]);
  });

  it('لا يعتبر أرقام الإصدارات روابط', () => {
    expect(extractUrls('النسخة 1.2.3 والإصدار v10.4')).toEqual([]);
  });

  it('يرفض الحروف غير اللاتينية الملتصقة بالنطاق', () => {
    expect(extractUrls('لخّص https://example.comد')).toEqual(['https://example.com/']);
  });
});
