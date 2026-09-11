import { extractUrls } from './security';

/* ==========================================================================
 * agent-router.ts — تحديد نوع الطلب من نص المستخدم والمرفقات.
 * لا توجد تبويبات في الواجهة: كل شيء يمر من هنا.
 * التوجيه استدلالي وسريع (بدون استدعاء النموذج) ويُمرَّر كتلميح للنموذج،
 * الذي يبقى حراً في اختيار الأداة المناسبة عبر Tool Calling.
 * ========================================================================== */

export const TASK_KINDS = [
  'conversation',
  'web_research',
  'coding',
  'document_analysis',
  'clarification',
  'confirmation_required',
] as const;

export type TaskKind = (typeof TASK_KINDS)[number];

export type RouteInput = {
  message: string;
  hasAttachments?: boolean;
  attachmentNames?: string[];
  /** هل توجد رسائل سابقة في هذه المحادثة؟ يمنع طلب التوضيح لرسائل المتابعة القصيرة. */
  hasHistory?: boolean;
  /** هل يوجد مشروع كود مرتبط بالمحادثة؟ */
  hasProject?: boolean;
};

export type RouteResult = {
  kind: TaskKind;
  confidence: number;
  urls: string[];
  reasons: string[];
  /** سؤال توضيحي واحد فقط عند kind = clarification */
  clarifyingQuestion?: string;
  /** وصف العملية التي تحتاج موافقة عند kind = confirmation_required */
  pendingAction?: string;
};

/* ------------------------------ المفردات ------------------------------ */

const CODING_TERMS = [
  'كود',
  'برمج',
  'اكتب لي دالة',
  'دالة',
  'سكربت',
  'سكريبت',
  'مشروع',
  'خطأ برمجي',
  'باغ',
  'صحح',
  'أصلح',
  'ريفاكتور',
  'اختبار وحدة',
  'API',
  'endpoint',
  'component',
  'function',
  'class',
  'bug',
  'refactor',
  'debug',
  'compile',
  'typescript',
  'javascript',
  'react',
  'next.js',
  'nextjs',
  'node',
  'npm',
  'python',
  'sql',
  'regex',
  'git',
  'docker',
  'css',
  'html',
];

const CODING_STRONG = [
  'اكتب كود',
  'اكتب لي كود',
  'أنشئ مشروع',
  'انشئ مشروع',
  'أصلح الكود',
  'اشرح الكود',
  'write code',
  'fix this code',
  'implement',
  'create a function',
  'build an app',
];

const RESEARCH_TERMS = [
  'ابحث',
  'بحث',
  'اقرأ الرابط',
  'افتح الرابط',
  'لخص الصفحة',
  'لخّص الرابط',
  'ما محتوى',
  'حدث',
  'أخبار',
  'search',
  'look up',
  'browse',
  'read this page',
];

const DOC_TERMS = [
  'المستند',
  'الملف',
  'العقد',
  'الاتفاقية',
  'لخص المستند',
  'استخرج',
  'الأطراف',
  'الالتزامات',
  'المواعيد',
  'التواريخ',
  'قارن بين',
  'pdf',
  'docx',
  'document',
  'contract',
];

// أفعال تُنتج أثراً خارجياً: تحتاج موافقة صريحة قبل التنفيذ.
const ACTION_TERMS: { pattern: RegExp; action: string }[] = [
  {
    pattern: /(أرسل|ارسل|ابعث|send)\s+(بريد|ايميل|إيميل|رسالة|email|mail)/i,
    action: 'إرسال بريد إلكتروني',
  },
  { pattern: /(انشر|أنشر|\bpublish\b|\bpost\b)\s/i, action: 'نشر محتوى' },
  {
    pattern:
      /(احذف|أحذف|امسح|\bdelete\b|\bremove\b)\s+(الملف|الملفات|المحادثة|الحساب|file|account)/i,
    action: 'حذف بيانات',
  },
  {
    pattern: /(غيّر|غير|عدّل|change|update)\s+(الإعدادات|الاعدادات|كلمة المرور|settings|password)/i,
    action: 'تغيير إعدادات',
  },
  {
    pattern: /(شغّل|شغل|نفّذ|نفذ|\brun\b|\bexecute\b)\s+(الأمر|الكود|الأوامر|command)/i,
    action: 'تشغيل كود أو أمر',
  },
  { pattern: /(اشتر|ادفع|حوّل|حول)\s+/i, action: 'عملية مالية' },
];

/* --------------------------- أدوات مساعدة --------------------------- */

function hasAny(haystack: string, needles: string[]): string[] {
  const found: string[] = [];
  for (const n of needles) {
    if (haystack.includes(n.toLowerCase())) found.push(n);
  }
  return found;
}

const CODE_FENCE = /```/;

/** رسائل قصيرة جداً بلا سياق تحتاج توضيحاً. */
const VAGUE_MESSAGES = [
  'ساعدني',
  'ساعدني.',
  'مرحبا',
  'مرحباً',
  'اهلا',
  'أهلاً',
  'السلام عليكم',
  'ابدأ',
  'help',
  'hi',
  'hello',
];

const VAGUE_TASK_HINTS = ['اعمل لي', 'سوي لي', 'اصلحه', 'أصلحه', 'كمل', 'أكمل', 'جربها'];

/* ------------------------------ التوجيه ------------------------------ */

export function routeTask(input: RouteInput): RouteResult {
  const message = (input.message ?? '').trim();
  const lower = message.toLowerCase();
  const urls = extractUrls(message);
  const reasons: string[] = [];

  // نزيل الروابط قبل فحص أفعال العمليات حتى لا يُطابق مسار مثل /post كلمة أمر.
  const withoutUrls = urls
    .reduce((acc, u) => acc.split(u).join(' '), message)
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ');

  // 1) عملية خارجية مؤثرة — الأولوية القصوى، تحتاج موافقة.
  for (const { pattern, action } of ACTION_TERMS) {
    if (pattern.test(withoutUrls)) {
      reasons.push(`طلب يتضمن عملية مؤثرة: ${action}`);
      return {
        kind: 'confirmation_required',
        confidence: 0.9,
        urls,
        reasons,
        pendingAction: action,
      };
    }
  }

  // 2) مرفقات — تحليل مستندات.
  if (input.hasAttachments) {
    reasons.push('توجد مرفقات في الرسالة');
    return { kind: 'document_analysis', confidence: 0.95, urls, reasons };
  }

  const codingStrong = hasAny(
    lower,
    CODING_STRONG.map((t) => t.toLowerCase()),
  );
  const codingTerms = hasAny(
    lower,
    CODING_TERMS.map((t) => t.toLowerCase()),
  );
  const researchTerms = hasAny(
    lower,
    RESEARCH_TERMS.map((t) => t.toLowerCase()),
  );
  const docTerms = hasAny(
    lower,
    DOC_TERMS.map((t) => t.toLowerCase()),
  );
  const hasFence = CODE_FENCE.test(message);

  let codingScore = codingStrong.length * 3 + codingTerms.length + (hasFence ? 2 : 0);
  if (input.hasProject) codingScore += 1;
  const researchScore = researchTerms.length + urls.length * 3;

  // 3) رابط داخل الرسالة => بحث/قراءة ويب، إلا إن كان الطلب برمجياً صريحاً حوله.
  if (urls.length > 0) {
    reasons.push(`تم العثور على ${urls.length} رابط في الرسالة`);
    if (codingStrong.length > 0 && researchTerms.length === 0) {
      reasons.push('الطلب برمجي صريح رغم وجود رابط');
      return { kind: 'coding', confidence: 0.7, urls, reasons };
    }
    return { kind: 'web_research', confidence: 0.92, urls, reasons };
  }

  // 4) طلب بحث بلا رابط.
  if (researchScore >= 2 && researchScore > codingScore) {
    reasons.push('كلمات دالة على البحث أو القراءة');
    return { kind: 'web_research', confidence: 0.6, urls, reasons };
  }

  // 5) طلب برمجي.
  if (codingScore >= 3 || codingStrong.length > 0) {
    reasons.push(`مؤشرات برمجية: ${[...codingStrong, ...codingTerms].slice(0, 5).join(', ')}`);
    return { kind: 'coding', confidence: codingStrong.length ? 0.9 : 0.7, urls, reasons };
  }

  // 6) حديث عن مستند بلا مرفق => توضيح.
  if (docTerms.length >= 2 && !input.hasAttachments) {
    reasons.push('حديث عن مستند بلا مرفق');
    return {
      kind: 'clarification',
      confidence: 0.6,
      urls,
      reasons,
      clarifyingQuestion: 'هل ترفق المستند (PDF أو DOCX) حتى أحلله؟',
    };
  }

  // 7) رسالة مبهمة جداً.
  const isVague =
    VAGUE_MESSAGES.includes(lower) ||
    (message.length < 12 && !input.hasHistory) ||
    (VAGUE_TASK_HINTS.some((h) => lower.startsWith(h)) && message.length < 25 && !input.hasHistory);

  if (isVague) {
    reasons.push('الرسالة قصيرة جداً أو عامة');
    return {
      kind: 'clarification',
      confidence: 0.5,
      urls,
      reasons,
      clarifyingQuestion: 'ما المهمة التي تريد إنجازها بالضبط؟',
    };
  }

  reasons.push('لا توجد مؤشرات على مهمة متخصصة');
  return { kind: 'conversation', confidence: 0.6, urls, reasons };
}

/** وصف عربي مختصر لعرضه في شريط الحالة أعلى رد الوكيل. */
export function describeKind(kind: TaskKind): string {
  switch (kind) {
    case 'web_research':
      return 'قراءة وبحث في الويب';
    case 'coding':
      return 'مهمة برمجية';
    case 'document_analysis':
      return 'تحليل مستند';
    case 'clarification':
      return 'يحتاج توضيحاً';
    case 'confirmation_required':
      return 'يحتاج موافقتك';
    default:
      return 'محادثة';
  }
}
