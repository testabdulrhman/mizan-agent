'use client';

/* لوحة الأدوات الأولى: واجهة موحدة تفتح المهمة داخل المحادثة الحالية. */

type ToolCard = {
  title: string;
  hint: string;
  prompt: string;
  icon: string;
  status: 'جاهز' | 'قريبًا';
  tone: string;
};

const TOOLS: ToolCard[] = [
  {
    icon: '▤',
    title: 'الشرائح',
    hint: 'حوّل فكرتك أو مستندك إلى عرض منظم',
    prompt: 'أنشئ لي مخطط عرض شرائح احترافي عن: ',
    status: 'قريبًا',
    tone: 'bg-violet-50 text-violet-700',
  },
  {
    icon: '⌕',
    title: 'بحث عميق',
    hint: 'اجمع معلومات من مصادر متعددة مع خلاصة',
    prompt: 'أجرِ بحثًا عميقًا وموثقًا عن: ',
    status: 'قريبًا',
    tone: 'bg-sky-50 text-sky-700',
  },
  {
    icon: '⌘',
    title: 'موقع إلكتروني',
    hint: 'خطط لموقع أو صفحة هبوط قابلة للتنفيذ',
    prompt: 'صمّم لي موقعًا إلكترونيًا احترافيًا عن: ',
    status: 'قريبًا',
    tone: 'bg-emerald-50 text-emerald-700',
  },
  {
    icon: '◈',
    title: 'توليد الصور',
    hint: 'اكتب وصفًا لصورة أو هوية بصرية',
    prompt: 'أنشئ تصورًا بصريًا لصورة عن: ',
    status: 'قريبًا',
    tone: 'bg-amber-50 text-amber-700',
  },
  {
    icon: '◉',
    title: 'توليد الفيديو',
    hint: 'حوّل الفكرة إلى سيناريو ومشهد مرئي',
    prompt: 'اكتب تصورًا لفيديو قصير عن: ',
    status: 'قريبًا',
    tone: 'bg-rose-50 text-rose-700',
  },
  {
    icon: '◷',
    title: 'المهام المجدولة',
    hint: 'خطط لمهمة تتكرر يوميًا أو أسبوعيًا',
    prompt: 'أريد جدولة مهمة متكررة لتنفيذ: ',
    status: 'قريبًا',
    tone: 'bg-cyan-50 text-cyan-700',
  },
  {
    icon: '◎',
    title: 'متصفح سحابي',
    hint: 'لخّص صفحة عامة واقرأ محتواها',
    prompt: 'افتح هذا الرابط العام واقرأه ثم لخّص أهم النقاط: https://',
    status: 'جاهز',
    tone: 'bg-lime-50 text-lime-700',
  },
  {
    icon: '{}',
    title: 'اكتب كوداً',
    hint: 'أنشئ حلاً برمجياً واضحاً بلغة Node.js',
    prompt: 'اكتب لي حلاً برمجياً بلغة Node.js عن: ',
    status: 'جاهز',
    tone: 'bg-slate-100 text-slate-700',
  },
  {
    icon: '▱',
    title: 'تحليل مستند',
    hint: 'PDF أو DOCX: التزامات وتواريخ وأطراف',
    prompt: 'سأرفق عقدًا. استخرج الأطراف والالتزامات والمواعيد في جدول، واذكر النواقص.',
    status: 'جاهز',
    tone: 'bg-teal-50 text-teal-700',
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
        <p className="mx-auto mt-1.5 max-w-[38ch] text-[13px] leading-6 text-ink-muted">
          اختر أداة أو اكتب طلبك مباشرة، وسأحوّله إلى مهمة واضحة داخل المحادثة.
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between px-1">
        <h3 className="text-[13px] font-semibold text-ink">جرّب الآن</h3>
        <span className="mizan-chip">أدوات مِيزان</span>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {TOOLS.map((tool) => (
          <li key={tool.title}>
            <button
              type="button"
              onClick={() => onPick(tool.prompt)}
              className="mizan-card group w-full px-3.5 py-3.5 text-start transition hover:-translate-y-0.5 hover:border-brand-200 hover:bg-canvas-soft active:scale-[0.99]"
            >
              <span className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base font-semibold ${tool.tone}`}
                >
                  {tool.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-[13.5px] font-semibold text-ink">{tool.title}</span>
                    <span
                      className={`shrink-0 text-[10px] font-medium ${tool.status === 'جاهز' ? 'text-brand-600' : 'text-ink-muted'}`}
                    >
                      {tool.status}
                    </span>
                  </span>
                  <span className="mt-1 block text-[12px] leading-5 text-ink-muted">{tool.hint}</span>
                </span>
              </span>
              <span className="mt-2.5 block text-[11px] font-medium text-brand-600 opacity-0 transition group-hover:opacity-100">
                جرّب الآن ←
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="mt-4 rounded-xl border border-accent-200 bg-accent-100/60 px-3 py-2.5 text-[11.5px] leading-5 text-accent-600">
        نسخة تجريبية: لا ترفع معلومات حساسة أو بيانات شخصية أو أسرارًا تجارية. التحليل القانوني مسوّدة للمراجعة البشرية وليس استشارة نهائية.
      </p>
    </div>
  );
}
