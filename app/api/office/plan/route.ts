import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, handleError, ok, rateLimit } from '@/lib/http';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 120;

const schema = z.object({
  module: z.enum(['profile', 'strategy', 'marketing', 'content', 'growth']),
  request: z.string().trim().min(3).max(8000),
  officeContext: z.string().max(4000),
  existingArtifacts: z.array(z.object({ module: z.string(), title: z.string(), content: z.string() })).max(10).default([]),
});

const labels = { profile: 'الملف التعريفي', strategy: 'التخطيط الاستراتيجي', marketing: 'الخطة التسويقية', content: 'المحتوى والموقع', growth: 'خطة النمو' } as const;

export async function GET() {
  try {
    const user = await requireUser();
    const artifacts = await prisma.officeArtifact.findMany({ where: { userId: user.id }, orderBy: { updatedAt: 'desc' } });
    return ok({ artifacts });
  } catch (error) { return handleError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`office-plan:${user.id}`, 10, 60_000)) return fail('عدد كبير من المحاولات. انتظر قليلاً.', 429);
    const input = schema.parse(await request.json());
    const cfg = env();
    const priorContext = input.existingArtifacts.length
      ? `\n\nالمخرجات الحالية للمشروع. افحص الاتساق معها، وإذا وجدت تعارضًا فأضف في البداية قسمًا بعنوان «تنبيه اتساق» يذكر التعارض صراحة ويقارن الهدفين ويقترح قرارًا واحدًا. إذا لم يوجد تعارض، اكتب «لا يوجد تعارض ظاهر مع سياق المشروع».\n${input.existingArtifacts.map((item) => `\n[${item.title}]\n${item.content.slice(0, 5000)}`).join('\n')}`
      : '\n\nهذه أول مخرجات المشروع؛ ضع افتراضاتك بوضوح ولا تعتبرها حقائق نهائية.';
    const prompt = `أنت مستشار استراتيجي رفيع المستوى لمكتب محاماة سعودي داخل مشروع مستمر. أنشئ مخرجًا عمليًا ومنظمًا باللغة العربية لوحدة «${labels[input.module]}». استخدم سياق المكتب والمخرجات السابقة والمعطيات فقط، ولا تخترع أرقامًا أو إنجازات. ضع [يحتاج تأكيد] عند نقص المعلومات. اجعل الناتج مناسبًا للمراجعة البشرية وقابلًا للنسخ إلى مستند رسمي. حافظ على الاتساق بين رؤية المكتب وأهدافه وخدماته وتسويقه ونموه. لا تعرض أسماء النماذج أو خطوات التفكير الداخلية.\n\nسياق المشروع:\n${input.officeContext}\n\nطلب صاحب المكتب:\n${input.request}${priorContext}\n\nأخرج عناوين واضحة، توصيات قابلة للتنفيذ، أولويات، ومؤشرات قياس عندما تكون مناسبة.`;
    let content: string;
    let provider = 'draft';
    if (!cfg.OPENROUTER_API_KEY) {
      content = `# ${labels[input.module]}\n\n> هذه مسودة أولية. أضف مفتاح OpenRouter لتشغيل Fusion.\n\n## المعطيات\n${input.request}\n\n## اتساق المشروع\nلا يمكن إجراء فحص التعارضات قبل تفعيل Fusion.`;
    } else {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://redwan.cloud', 'X-Title': 'Mizan Office OS' },
        body: JSON.stringify({ model: 'openrouter/fusion', messages: [{ role: 'user', content: prompt }], max_tokens: 6500 }),
      });
      if (!response.ok) return fail(`تعذّر الاتصال بـ Fusion (${response.status}).`, 502);
      const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      content = data.choices?.[0]?.message?.content?.trim() ?? '';
      if (!content) return fail('أعاد Fusion نتيجة فارغة.', 502);
      provider = 'openrouter/fusion';
    }
    const artifact = await prisma.officeArtifact.upsert({
      where: { userId_module: { userId: user.id, module: input.module } },
      update: { title: labels[input.module], content },
      create: { userId: user.id, module: input.module, title: labels[input.module], content },
    });
    return ok({ content, provider, artifact });
  } catch (error) { return handleError(error); }
}
