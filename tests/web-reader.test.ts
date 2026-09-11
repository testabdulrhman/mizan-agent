import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readPublicUrl, htmlToText, extractTitle } from '@/lib/web-reader';
import { resetEnvCache } from '@/lib/env';

// DNS مُقلَّد: نطاقات الاختبار تشير إلى عنوان عام.
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(async (host: string) => {
    if (host.includes('internal')) return [{ address: '10.0.0.9', family: 4 }];
    return [{ address: '93.184.216.34', family: 4 }];
  }),
}));

const SAMPLE_HTML = `<!doctype html>
<html><head>
  <title>مقال تجريبي</title>
  <style>.ad { color: red }</style>
  <script>window.tracker = 'x';</script>
</head>
<body>
  <nav><a href="/">الرئيسية</a><a href="/ads">إعلانات</a></nav>
  <article>
    <h1>عنوان المقال</h1>
    <p>الفقرة الأولى من المحتوى الحقيقي الذي نريد استخراجه من الصفحة لأنه المهم فعلاً.</p>
    <p>الفقرة الثانية تحتوي تفاصيل إضافية مفيدة للتلخيص وتزيد طول النص المستخرج بما يكفي.</p>
    <p>الفقرة الثالثة تكمل الموضوع وتضيف سياقاً كافياً حتى يتجاوز النص الحد الأدنى المطلوب.</p>
  </article>
  <footer>حقوق النشر</footer>
</body></html>`;

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetEnvCache();
  fetchSpy = vi.fn();
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('استخراج النص من HTML', () => {
  it('يحذف السكربتات والأنماط والقوائم والتذييل', () => {
    const text = htmlToText(SAMPLE_HTML);
    expect(text).toContain('الفقرة الأولى');
    expect(text).not.toContain('window.tracker');
    expect(text).not.toContain('color: red');
    expect(text).not.toContain('إعلانات');
  });

  it('يستخرج العنوان', () => {
    expect(extractTitle(SAMPLE_HTML)).toBe('مقال تجريبي');
    expect(extractTitle('<meta property="og:title" content="عنوان OG">')).toBe('عنوان OG');
  });
});

describe('قراءة الروابط', () => {
  it('يمنع localhost بلا أي طلب شبكة', async () => {
    const result = await readPublicUrl('http://localhost:3000/admin');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ssrf_blocked');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('يمنع عنوان بيانات وصف السحابة', async () => {
    const result = await readPublicUrl('http://169.254.169.254/latest/meta-data/');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ssrf_blocked');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('يمنع النطاق الذي يشير إلى شبكة داخلية بعد DNS', async () => {
    const result = await readPublicUrl('https://service.internal.example/');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ssrf_blocked');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('يقرأ صفحة عامة ويعيد العنوان والنص', async () => {
    fetchSpy.mockResolvedValue(
      new Response(SAMPLE_HTML, {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      }),
    );

    const result = await readPublicUrl('https://example.com/article');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.title).toBe('مقال تجريبي');
      expect(result.content).toContain('الفقرة الأولى');
      expect(result.fetchedWith).toBe('http');
      expect(result.finalUrl).toBe('https://example.com/article');
    }
  });

  it('يبلغ بوضوح عندما تتطلب الصفحة تسجيل دخول', async () => {
    fetchSpy.mockResolvedValue(
      new Response('forbidden', { status: 403, headers: { 'content-type': 'text/html' } }),
    );

    const result = await readPublicUrl('https://example.com/private');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('login_required');
      expect(result.error).toContain('تسجيل دخول');
    }
  });

  it('يرفض أنواع المحتوى غير النصية', async () => {
    fetchSpy.mockResolvedValue(
      new Response('binary', { status: 200, headers: { 'content-type': 'image/png' } }),
    );

    const result = await readPublicUrl('https://example.com/image.png');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('unsupported_content');
  });

  it('يبلغ عند انتهاء المهلة بدل اختلاق محتوى', async () => {
    fetchSpy.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));

    const result = await readPublicUrl('https://example.com/slow');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('timeout');
  });

  it('يعيد فحص إعادة التوجيه إلى عنوان داخلي', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:9000/secret' } }),
    );

    const result = await readPublicUrl('https://example.com/redirect');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ssrf_blocked');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
