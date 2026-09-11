import { describe, it, expect } from 'vitest';
import { routeTask, describeKind } from '@/lib/agent-router';

describe('توجيه المهام', () => {
  it('يوجّه الطلب البرمجي إلى coding', () => {
    const r = routeTask({ message: 'اكتب كود Node.js يقرأ ملف CSV ويطبع أعلى القيم' });
    expect(r.kind).toBe('coding');
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it('يوجّه طلب إصلاح كود مع كتلة كود إلى coding', () => {
    const r = routeTask({
      message: 'أصلح الكود التالي من فضلك:\n```js\nconst x = 1\n```',
    });
    expect(r.kind).toBe('coding');
  });

  it('يوجّه الرسالة التي تحوي رابطاً إلى web_research', () => {
    const r = routeTask({ message: 'لخص لي https://example.com/post من فضلك' });
    expect(r.kind).toBe('web_research');
    expect(r.urls).toEqual(['https://example.com/post']);
  });

  it('يوجّه طلب البحث بلا رابط إلى web_research', () => {
    const r = routeTask({ message: 'ابحث لي عن أحدث أخبار الذكاء الاصطناعي وحدثني' });
    expect(r.kind).toBe('web_research');
  });

  it('يوجّه الرسالة ذات المرفق إلى document_analysis', () => {
    const r = routeTask({
      message: 'لخص هذا الملف',
      hasAttachments: true,
      attachmentNames: ['contract.pdf'],
    });
    expect(r.kind).toBe('document_analysis');
  });

  it('يوجّه العمليات المؤثرة إلى confirmation_required', () => {
    const r = routeTask({ message: 'أرسل بريداً إلى العميل بالتفاصيل' });
    expect(r.kind).toBe('confirmation_required');
    expect(r.pendingAction).toBe('إرسال بريد إلكتروني');
  });

  it('يطلب توضيحاً عند الرسائل المبهمة', () => {
    const r = routeTask({ message: 'ساعدني' });
    expect(r.kind).toBe('clarification');
    expect(r.clarifyingQuestion).toBeTruthy();
  });

  it('يعيد conversation للأسئلة العامة', () => {
    const r = routeTask({
      message: 'ما الفرق بين التخزين المؤقت في المتصفح والتخزين على الخادم؟',
    });
    expect(r.kind).toBe('conversation');
  });

  it('يفضّل coding على web_research عند طلب برمجي صريح يحوي رابطاً', () => {
    const r = routeTask({ message: 'اكتب كود يستدعي https://api.example.com/v1/items' });
    expect(r.kind).toBe('coding');
  });

  it('يعطي وصفاً عربياً لكل نوع', () => {
    expect(describeKind('web_research')).toContain('الويب');
    expect(describeKind('coding')).toContain('برمجية');
    expect(describeKind('document_analysis')).toContain('مستند');
  });
});
