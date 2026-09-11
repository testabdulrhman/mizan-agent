import { requireUser } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { env } from '@/lib/env';
import { fail, handleError, ok, rateLimit } from '@/lib/http';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 120;

const requestSchema = z.object({
  style: z.enum(['formal', 'premium', 'brief']),
  clientName: z.string().trim().min(2).max(200),
  clientActivity: z.string().max(300).default(''),
  request: z.string().trim().min(10).max(5000),
  scope: z.string().max(5000).default(''),
  duration: z.string().max(200).default(''),
  budget: z.string().max(300).default(''),
  payment: z.string().max(1000).default(''),
  exclusions: z.string().max(2000).default(''),
});

const OFFICE_CONTEXT = `شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس. الخدمات: أعمال المحاماة، أعمال التوثيق، أعمال الإفلاس، أعمال التسجيل العيني. الموقع: المملكة العربية السعودية، القصيم - بريدة. العملة: الريال السعودي.`;

const styleNames = { formal: 'رسمي وقانوني', premium: 'فاخر واستشاري', brief: 'مختصر ومباشر' } as const;

export async function GET() {
  try {
    const user = await requireUser();
    const quotes = await prisma.quote.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, clientName: true, request: true, content: true, createdAt: true, budget: true, duration: true },
    });
    return ok({ quotes });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`office-quote:${user.id}`, 10, 60_000)) return fail('عدد كبير من المحاولات. انتظر قليلاً.', 429);
    const input = requestSchema.parse(await request.json());
    const cfg = env();
    const prompt = `أنت المحرر النهائي لعرض سعر مهني. أنشئ وثيقة عرض سعر عربية واحدة فقط، وليس تحليلًا قانونيًا أو إجابات متعددة. ممنوع تمامًا إظهار عبارة Panel responses أو أسماء النماذج أو المقارنة بين الإجابات أو قول «إليك الإجابة». ابدأ مباشرة بعنوان العرض وانتهِ بقسم الاعتماد. أنشئ عرض سعر احترافيًا بالعربية لهذا المكتب. لا تخترع أسعارًا أو مددًا؛ استخدم المعطيات كما هي، وضع [يحتاج تأكيد] عند النقص. افصل بوضوح بين نطاق العمل والمخرجات والاستثناءات والافتراضات. لا تقدم ضمانًا لنتيجة قانونية. الأسلوب المطلوب: ${styleNames[input.style]}.\n\nبيانات المكتب: ${OFFICE_CONTEXT}\nبيانات العميل: ${JSON.stringify(input, null, 2)}\n\nأخرج وثيقة عرض سعر جاهزة للإرسال، لا تقريرًا ولا تحليلًا ولا نصائح عامة. التزم بهذا الترتيب والعناوين: 1) رقم العرض والتاريخ وصلاحية العرض، 2) عنوان «عرض سعر» وموضوع الخدمة، 3) «مقدم إلى السادة / اسم العميل — المحترمين»، 4) مقدمة خطابية قصيرة، 5) «نطاق العمل» في نقاط عملية دقيقة، 6) «الأتعاب المهنية» في جدول Markdown بعمود البيان وعمود المبلغ (ر.س)، 7) افصل ضريبة القيمة المضافة 15% والإجمالي إذا كانت البيانات تسمح، 8) «جدول الدفعات» أو «استحقاق الأتعاب» في جدول بالنسب والمبالغ، 9) «شروط وأحكام» مرقمة، 10) «مقدم العرض» و«الموافقة على العرض» في نهاية الوثيقة. استخدم صياغة مكتب محاماة سعودية رسمية. لا تضع عناوين مثل فهم الاحتياج أو الخطوة التالية إلا إذا كانت موجودة في القالب. إذا نقصت قيمة، ضع [يحتاج تأكيد] داخل الجدول أو النص. لا تذكر أنك نموذج ذكاء اصطناعي ولا أسماء النماذج ولا Panel responses. اجعل الناتج صفحة واحدة قدر الإمكان ومناسبًا للطباعة على A4.`;

    if (!cfg.OPENROUTER_API_KEY) {
      const content = fallbackQuote(input);
      const quote = await saveQuote(user.id, input, content);
      return ok({ content, quote, provider: 'draft', warning: 'لم يُضبط مفتاح OpenRouter بعد؛ هذه مسودة أولية.' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://redwan.cloud', 'X-Title': 'Mizan Office Manager' },
      body: JSON.stringify({ model: 'openrouter/fusion', messages: [{ role: 'user', content: prompt }], max_tokens: 6000 }),
    });
    if (!response.ok) return fail(`تعذّر الاتصال بـ Fusion (${response.status}).`, 502);
    const data = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    let content = data.choices?.[0]?.message?.content?.trim();
    if (!content) return fail('أعاد Fusion نتيجة فارغة.', 502);
    content = cleanFusionOutput(content);
    const quote = await saveQuote(user.id, input, content);
    return ok({ content, quote, provider: 'openrouter/fusion' });
  } catch (error) {
    return handleError(error);
  }
}

async function saveQuote(userId: string, input: z.infer<typeof requestSchema>, content: string) {
  return prisma.quote.create({
    data: {
      userId,
      clientName: input.clientName,
      request: input.request,
      style: input.style,
      duration: input.duration || null,
      budget: input.budget || null,
      content,
    },
    select: { id: true, clientName: true, createdAt: true },
  });
}

function cleanFusionOutput(content: string) {
  const withoutPanelTitle = content.replace(/^\s*#+\s*Panel responses[\s\S]*?\n/i, '').trim();
  return withoutPanelTitle.replace(/^###\s*~[^\n]+\n/gm, '').trim() || content;
}

function fallbackQuote(input: z.infer<typeof requestSchema>) {
  return `# عرض سعر — ${input.clientName}\n\n## مقدم من\nشركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس\nالمملكة العربية السعودية — القصيم، بريدة\n\n## موضوع العرض\n${input.request}\n\n## فهم الاحتياج\nاستنادًا إلى المعطيات الأولية، يقترح المكتب تقديم خدمات مهنية منظمة لتحقيق الهدف الموضح أعلاه، على أن يتم تثبيت النطاق النهائي بعد مراجعة التفاصيل والمستندات.\n\n## نطاق العمل المبدئي\n${input.scope || '[يحتاج تحديد نطاق العمل بالتفصيل]'}\n\n## المدة\n${input.duration || '[يحتاج تأكيد]'}\n\n## الأتعاب\n${input.budget || '[يحتاج تحديد الأتعاب]'} ريال سعودي.\n\n## شروط الدفع\n${input.payment || '[يحتاج تحديد شروط الدفع]'}\n\n## لا يشمل العرض\n${input.exclusions || 'أي أعمال أو رسوم أو مصروفات غير مذكورة صراحة في نطاق العمل.'}\n\n## ملاحظات\nهذا العرض مسودة أولية للمراجعة، ولا يُعد التزامًا نهائيًا إلا بعد اعتماده وتوقيعه من الطرفين. صلاحية العرض: 30 يومًا.`;
}
