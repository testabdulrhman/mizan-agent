import { requireUser } from '@/lib/auth';
import { env } from '@/lib/env';
import { fail, handleError, ok, rateLimit } from '@/lib/http';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 120;

const schema = z.object({
  module: z.enum(['profile', 'strategy', 'marketing', 'content', 'growth']),
  request: z.string().trim().min(3).max(8000),
  officeContext: z.string().max(2000),
});

const labels = { profile: 'الملف التعريفي', strategy: 'التخطيط الاستراتيجي', marketing: 'الخطة التسويقية', content: 'المحتوى والموقع', growth: 'خطة النمو' } as const;

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`office-plan:${user.id}`, 10, 60_000)) return fail('عدد كبير من المحاولات. انتظر قليلاً.', 429);
    const input = schema.parse(await request.json());
    const cfg = env();
    const prompt = `أنت مستشار استراتيجي رفيع المستوى لمكتب محاماة سعودي. أنشئ مخرجًا عمليًا ومنظمًا باللغة العربية لوحدة «${labels[input.module]}». استخدم سياق المكتب والمعطيات فقط، ولا تخترع أرقامًا أو إنجازات. ضع [يحتاج تأكيد] عند نقص المعلومات. اجعل الناتج مناسبًا للمراجعة البشرية وقابلًا للنسخ إلى مستند رسمي.\n\nسياق المكتب:\n${input.officeContext}\n\nطلب صاحب المكتب:\n${input.request}\n\nأخرج عناوين واضحة، توصيات قابلة للتنفيذ، أولويات، ومؤشرات قياس عندما تكون مناسبة.`;
    if (!cfg.OPENROUTER_API_KEY) return ok({ content: `# ${labels[input.module]}\n\n> هذه مسودة أولية. أضف مفتاح OpenRouter لتشغيل Fusion.\n\n## المعطيات\n${input.request}\n\n## الخطوة التالية\nسيُعاد تحليل هذه المعطيات عبر عدة نماذج وإخراج نسخة تنفيذية بعد تفعيل المفتاح.`, provider: 'draft', warning: 'لم يُضبط مفتاح OpenRouter بعد.' });
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://redwan.cloud', 'X-Title': 'Mizan Office OS' },
      body: JSON.stringify({ model: 'openrouter/fusion', messages: [{ role: 'user', content: prompt }], max_tokens: 6500 }),
    });
    if (!response.ok) return fail(`تعذّر الاتصال بـ Fusion (${response.status}).`, 502);
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return fail('أعاد Fusion نتيجة فارغة.', 502);
    return ok({ content, provider: 'openrouter/fusion' });
  } catch (error) { return handleError(error); }
}
