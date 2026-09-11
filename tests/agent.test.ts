import { describe, it, expect, beforeEach, vi } from 'vitest';

/* حلقة الوكيل: تستدعي الأدوات فعلياً وتنقل نتائجها كما هي — بلا ادعاء. */

const readMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/web-reader', () => ({ readPublicUrl: readMock }));
vi.mock('@/lib/db', () => ({
  prisma: {
    project: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({ id: 'p1' })) },
    projectFile: { upsert: vi.fn(async () => ({})) },
    execution: { create: vi.fn(async () => ({ id: 'e1' })), update: vi.fn(async () => ({})) },
    approval: { create: vi.fn(async () => ({ id: 'ap1' })) },
  },
}));

const { runAgent } = await import('@/lib/agent');

beforeEach(() => {
  readMock.mockReset();
  process.env.LLM_PROVIDER = 'mock';
});

const base = {
  userId: 'u1',
  conversationId: 'c1',
  history: [],
  attachments: [],
};

describe('تشغيل الوكيل', () => {
  it('يستدعي أداة قراءة الرابط عند وجود رابط في الرسالة', async () => {
    readMock.mockResolvedValue({
      ok: true,
      url: 'https://example.com/a',
      finalUrl: 'https://example.com/a',
      title: 'صفحة تجريبية',
      content: 'محتوى الصفحة الحقيقي.',
      excerpt: 'محتوى',
      charCount: 20,
      truncated: false,
      fetchedWith: 'http',
      requiresLogin: false,
    });

    const result = await runAgent({ ...base, message: 'لخص https://example.com/a' });

    expect(readMock).toHaveBeenCalledWith('https://example.com/a');
    expect(result.kind).toBe('web_research');
    expect(result.toolLog[0].name).toBe('read_public_url');
    expect(result.toolLog[0].ok).toBe(true);
    expect(result.effects.some((e) => e.type === 'source')).toBe(true);
    expect(result.text).toContain('صفحة تجريبية');
  });

  it('ينقل سبب فشل الأداة بدل اختلاق محتوى', async () => {
    readMock.mockResolvedValue({
      ok: false,
      url: 'https://example.com/private',
      code: 'login_required',
      error: 'الصفحة تتطلب تسجيل دخول.',
    });

    const result = await runAgent({ ...base, message: 'لخص https://example.com/private' });

    expect(result.toolLog[0].ok).toBe(false);
    expect(result.text).toContain('تسجيل دخول');
    expect(result.effects.some((e) => e.type === 'source')).toBe(false);
  });

  it('لا يستدعي أدوات الويب لسؤال عام', async () => {
    const result = await runAgent({
      ...base,
      message: 'ما الفرق بين الدالة المتزامنة وغير المتزامنة؟',
    });

    expect(readMock).not.toHaveBeenCalled();
    expect(result.toolLog).toHaveLength(0);
    expect(result.kind).toBe('conversation');
  });

  it('يصنّف الرسالة ذات المرفق كتحليل مستند', async () => {
    const result = await runAgent({
      ...base,
      message: 'لخص هذا العقد',
      attachments: [
        { id: 'a1', filename: 'contract.pdf', text: 'نص العقد', needsOcr: false, kind: 'pdf' },
      ],
    });

    expect(result.kind).toBe('document_analysis');
    expect(result.kindLabel).toContain('مستند');
    // تحذير المراجعة البشرية يُضاف تلقائياً للتحليل ذي الطابع القانوني.
    expect(result.text).toContain('مسوّدة آلية للمراجعة البشرية');
  });
});
