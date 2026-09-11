'use client';

/* بطاقات اقتراحات تظهر في بداية المحادثة فقط. */

const SUGGESTIONS: { title: string; hint: string; prompt: string; icon: string }[] = [
  {
    icon: '🔗',
    title: 'لخّص صفحة',
    hint: 'ألصق رابطاً عاماً وسأقرأه فعلياً',
    prompt: 'لخّص لي هذه الصفحة في نقاط: https://',
  },
  {
    icon: '📄',
    title: 'حلّل مستنداً',
    hint: 'PDF أو DOCX: التزامات، تواريخ، أطراف',
    prompt: 'سأرفق عقداً. استخرج الأطراف والالتزامات والمواعيد في جدول، واذكر النواقص.',
  },
  {
    icon: '🧩',
    title: 'اكتب كوداً',
    hint: 'ملفات كاملة + أوامر تشغيل',
    prompt: 'اكتب سكربت Node.js يقرأ ملف CSV ويطبع أعلى 5 قيم، مع ملف package.json.',
  },
  {
    icon: '💬',
    title: 'اسأل سؤالاً',
    hint: 'شرح، مقارنة، أو خطة عمل',
    prompt: 'اشرح لي الفرق بين المصادقة بالجلسات والمصادقة بالتوكن، مع جدول مقارنة.',
  },
];

export default function SuggestionCards({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="animate-fade-up">
      <div className="mb-5 text-center">
        <div
          className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-lg font-bold text-white"
          aria-hidden
        >
          م
        </div>
        <h2 className="text-lg font-bold text-ink">كيف أساعدك اليوم؟</h2>
        <p className="mx-auto mt-1.5 max-w-[34ch] text-[13px] leading-6 text-ink-muted">
          اكتب طلبك بحرية. سأحدد نوع المهمة تلقائياً: قراءة رابط، تحليل مستند، كتابة كود، أو إجابة
          مباشرة.
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <li key={s.title}>
            <button
              type="button"
              onClick={() => onPick(s.prompt)}
              className="mizan-card w-full px-3 py-3 text-start transition hover:border-brand-200 hover:bg-canvas-soft active:scale-[0.99]"
            >
              <span className="flex items-center gap-2">
                <span aria-hidden className="text-[15px]">
                  {s.icon}
                </span>
                <span className="text-[13.5px] font-semibold text-ink">{s.title}</span>
              </span>
              <span className="mt-1 block text-[12px] leading-5 text-ink-muted">{s.hint}</span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-4 rounded-xl border border-accent-200 bg-accent-100/60 px-3 py-2.5 text-[11.5px] leading-5 text-accent-600">
        نسخة تجريبية: لا ترفع معلومات حساسة أو بيانات شخصية أو أسراراً تجارية. التحليل القانوني
        مسوّدة للمراجعة البشرية وليس استشارة نهائية.
      </p>
    </div>
  );
}
