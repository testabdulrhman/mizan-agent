'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import Markdown from '@/components/Markdown';

type Module = { id: string; label: string; description: string; icon: string; accent: string; prompt: string };
type SavedQuote = { id: string; clientName: string; request: string; content: string; createdAt: string; budget?: string | null; duration?: string | null };
const modules: Module[] = [
  { id: 'profile', label: 'الملف التعريفي', description: 'صغ هوية المكتب ونبذته وخدماته', icon: '✦', accent: 'gold', prompt: 'أنشئ ملفًا تعريفيًا احترافيًا للمكتب اعتمادًا على بياناته الحالية.' },
  { id: 'strategy', label: 'التخطيط الاستراتيجي', description: 'الرؤية والأهداف وخطة النمو', icon: '◈', accent: 'blue', prompt: 'ضع خطة استراتيجية عملية للمكتب تشمل الرؤية والأهداف ومؤشرات القياس.' },
  { id: 'marketing', label: 'الخطة التسويقية', description: 'جذب العملاء وبناء الحضور', icon: '◎', accent: 'rose', prompt: 'أنشئ خطة تسويقية متكاملة للمكتب في السعودية مع القنوات والأولويات.' },
  { id: 'content', label: 'المحتوى والموقع', description: 'صفحات الموقع وخطة النشر', icon: '⌘', accent: 'teal', prompt: 'اكتب هيكل موقع المكتب ونصوص الصفحات الأساسية مع خطة محتوى شهرية.' },
  { id: 'quotes', label: 'عروض الأسعار', description: 'نطاق عمل وعرض احترافي للعميل', icon: '▤', accent: 'amber', prompt: '' },
  { id: 'growth', label: 'خطة النمو', description: 'الخدمات والفرص والتوسع', icon: '↗', accent: 'violet', prompt: 'حلل فرص نمو المكتب واقترح خدمات جديدة وشراكات وخطة توسع.' },
];
const officeContext = 'شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس — أعمال المحاماة والتوثيق والإفلاس والتسجيل العيني — القصيم، بريدة — المملكة العربية السعودية.';

export default function OfficeClient() {
  const [active, setActive] = useState('quotes');
  const [menuOpen, setMenuOpen] = useState(false);
  const [request, setRequest] = useState('');
  const [clientName, setClientName] = useState('');
  const [budget, setBudget] = useState('');
  const [duration, setDuration] = useState('');
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([]);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const selected = modules.find((item) => item.id === active) ?? modules[4];

  useEffect(() => {
    fetch('/api/office/quote')
      .then((response) => response.ok ? response.json() : { quotes: [] })
      .then((data) => setSavedQuotes(data.quotes ?? []))
      .catch(() => setSavedQuotes([]));
  }, []);

  async function generate() {
    if (!request.trim()) return;
    setBusy(true); setResult('');
    try {
      const endpoint = active === 'quotes' ? '/api/office/quote' : '/api/office/plan';
      const body = active === 'quotes'
        ? { style: 'premium', clientName: clientName || 'يحتاج إدخال اسم العميل', request, clientActivity: '', scope: '', duration, budget, payment: '', exclusions: '' }
        : { module: active, request, officeContext };
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'تعذر إنشاء المخرج.');
      setResult(data.content);
      if (data.quote) setSavedQuotes((current) => [{ ...data.quote, request, content: data.content, createdAt: String(data.quote.createdAt) }, ...current.filter((item) => item.id !== data.quote.id)]);
    } catch (error) { setResult(`تعذر إنشاء المخرج: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`); }
    finally { setBusy(false); }
  }

  return <main className="office-shell min-h-[100dvh] bg-canvas text-ink" dir="rtl">
    <header className="office-topbar flex h-[70px] items-center justify-between border-b border-white/10 px-4 sm:px-8">
      <div className="flex items-center gap-4"><Link href="/" className="office-icon-btn" aria-label="العودة للمحادثة">←</Link><div className="flex items-center gap-3"><span className="office-mark">م</span><div><p className="text-sm font-bold tracking-wide">إدارة المكتب</p><p className="text-[11px] text-ink-muted">مساحة العمل الاستراتيجية</p></div></div></div>
      <div className="relative"><button onClick={() => setMenuOpen((value) => !value)} className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-ink-muted"><span className="h-2 w-2 rounded-full bg-[#d8ad62]" /> مكتب المشيقح <span className="text-ink-faint">⌄</span></button>{menuOpen && <div className="absolute left-0 top-12 z-20 w-56 rounded-2xl border border-white/10 bg-[#101d30] p-3 text-xs text-ink-muted shadow-2xl"><p className="font-semibold text-ink">شركة عبدالرحمن بن رضوان المشيقح</p><p className="mt-1 leading-5">محاماة وإدارة إجراءات الإفلاس</p></div>}</div>
    </header>
    <div className="mx-auto grid min-h-[calc(100dvh-70px)] max-w-[1440px] lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="hidden border-l border-white/10 p-5 lg:block"><p className="mb-4 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-faint">مساحة المكتب</p><nav className="space-y-1.5">{modules.map((item) => <button key={item.id} onClick={() => { setActive(item.id); setResult(''); setRequest(item.prompt); }} className={`office-nav-item ${active === item.id ? 'is-active' : ''}`}><span className={`office-nav-icon ${item.accent}`}>{item.icon}</span><span className="min-w-0 text-start"><span className="block text-[12px] font-semibold">{item.label}</span><span className="mt-0.5 block truncate text-[10px] text-ink-faint">{item.description}</span></span></button>)}</nav><div className="mt-8 rounded-2xl border border-[#d8ad62]/20 bg-[#d8ad62]/[0.06] p-4"><p className="text-xs font-semibold text-[#e6c37e]">مستشار المكتب</p><p className="mt-2 text-[11px] leading-5 text-ink-muted">يستخدم Fusion في المهام الاستراتيجية، ويحوّل أفكارك إلى مخرجات قابلة للاستخدام.</p></div></aside>
      <section className="px-4 py-6 sm:px-8 lg:px-12 lg:py-10"><div className="mx-auto max-w-5xl"><div className="mb-7 flex items-end justify-between gap-4"><div><p className="mb-2 text-[11px] font-medium tracking-[0.16em] text-[#d8ad62]">MIZAN / OFFICE OS</p><h1 className="office-title text-3xl font-semibold sm:text-4xl">ابنِ مكتبك بوضوح.</h1><p className="mt-3 max-w-xl text-sm leading-6 text-ink-muted">مساحة ذكية لتخطيط المكتب، صياغة مخرجاته، وتحويل القرارات الاستراتيجية إلى خطوات عملية.</p></div><div className="hidden text-left sm:block"><span className="text-[10px] text-ink-faint">اليوم</span><p className="mt-1 text-xs text-ink-muted">مساحة خاصة وآمنة</p></div></div>
        <div className="mb-7 grid grid-cols-2 gap-2 lg:hidden sm:grid-cols-3">{modules.map((item) => <button key={item.id} onClick={() => { setActive(item.id); setResult(''); setRequest(item.prompt); }} className={`rounded-xl border px-3 py-3 text-start ${active === item.id ? 'border-[#d8ad62]/60 bg-[#d8ad62]/10' : 'border-white/10 bg-white/[0.03]'}`}><span className="text-sm">{item.icon}</span><span className="mt-1 block text-[11px] font-semibold">{item.label}</span></button>)}</div>
        {!result ? <><div className="office-hero-card mb-6 rounded-[26px] border border-white/10 p-5 sm:p-7"><div className="flex items-start justify-between gap-4"><div><span className={`office-large-icon ${selected.accent}`}>{selected.icon}</span><p className="mt-5 text-[11px] font-medium tracking-[0.14em] text-ink-faint">المساحة الحالية</p><h2 className="mt-2 text-xl font-semibold">{selected.label}</h2><p className="mt-2 max-w-lg text-sm leading-6 text-ink-muted">{selected.description}. اكتب ما تحتاجه وسيتولى مِيزان تحليل الفكرة وبناء مخرج احترافي.</p></div><span className="hidden rounded-full border border-[#d8ad62]/30 px-3 py-1 text-[10px] text-[#e6c37e] sm:block">Fusion جاهز</span></div>{active === 'quotes' && <div className="mt-7 grid gap-3 sm:grid-cols-3"><input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="اسم العميل" className="office-input" /><input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="الأتعاب / الميزانية" className="office-input" /><input value={duration} onChange={(event) => setDuration(event.target.value)} placeholder="المدة المتوقعة" className="office-input" /></div>}<textarea value={request} onChange={(event) => setRequest(event.target.value)} rows={5} placeholder={active === 'quotes' ? 'اكتب احتياج العميل ونطاق العمل بالتفصيل…' : `ما الذي تريد إنجازه في ${selected.label}؟`} className="office-textarea mt-3 w-full" /><div className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><p className="text-[11px] text-ink-faint">سيتم استخدام سياق المكتب تلقائيًا.</p><button onClick={generate} disabled={busy || !request.trim()} className="office-gold-btn">{busy ? 'يحلّل ويصيغ…' : `ابدأ ${selected.label}`} <span>↗</span></button></div></div>{active === 'quotes' && savedQuotes.length > 0 && <div className="mb-6 rounded-2xl border border-line bg-canvas-raised p-4"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-semibold text-ink">العروض المحفوظة</h3><span className="text-[11px] text-ink-muted">{savedQuotes.length} عرض</span></div><div className="grid gap-2 sm:grid-cols-2">{savedQuotes.slice(0, 6).map((quote) => <button key={quote.id} onClick={() => { setResult(quote.content); setClientName(quote.clientName); setRequest(quote.request); setBudget(quote.budget ?? ''); setDuration(quote.duration ?? ''); }} className="rounded-xl border border-line bg-canvas px-3 py-3 text-start transition hover:border-brand-300"><span className="block text-xs font-semibold text-ink">{quote.clientName}</span><span className="mt-1 block truncate text-[11px] text-ink-muted">{quote.request}</span><span className="mt-2 block text-[10px] text-ink-faint">{new Date(quote.createdAt).toLocaleDateString('ar-SA')}</span></button>)}</div></div>}<div className="grid gap-3 sm:grid-cols-3"><MiniCard title="سياق المكتب" value="مُجهّز" detail="الخدمات والموقع والعملة" /><MiniCard title="أسلوب العمل" value="استشاري" detail="تحليل ثم صياغة ثم مراجعة" /><MiniCard title="المخرجات" value="قابلة للتعديل" detail="نسخ جاهزة للمراجعة" /></div></> : <div className="office-result office-paper rounded-[26px] border border-white/10 p-5 sm:p-8"><div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4"><div><p className="text-[10px] tracking-[0.15em] text-[#d8ad62]">MIZAN / GENERATED OUTPUT</p><h2 className="mt-2 text-xl font-semibold">{selected.label}</h2></div><button onClick={() => setResult('')} className="office-icon-btn">×</button></div><div className="office-document-head"><div><p className="office-document-kicker">شركة عبدالرحمن بن رضوان المشيقح</p><p className="office-document-subtitle">للمحاماة وإدارة إجراءات الإفلاس</p></div><div className="office-document-meta"><span>عرض سعر</span><small>{new Date().toLocaleDateString('ar-SA')}</small></div></div><div className="office-document-recipient">مقدم إلى السادة / <strong>{clientName || 'العميل الكريم'}</strong> — المحترمين</div><article className="office-prose"><Markdown content={result} /></article><div className="mt-8 flex flex-wrap gap-2"><button onClick={() => window.print()} className="office-outline-btn">طباعة / حفظ PDF</button><button onClick={() => setResult('')} className="office-gold-btn">إنشاء نسخة جديدة</button></div></div>}</div></section>
    </div>
  </main>;
}
function MiniCard({ title, value, detail }: { title: string; value: string; detail: string }) { return <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4"><p className="text-[10px] text-ink-faint">{title}</p><p className="mt-2 text-sm font-semibold text-[#e6c37e]">{value}</p><p className="mt-1 text-[11px] text-ink-faint">{detail}</p></div>; }
