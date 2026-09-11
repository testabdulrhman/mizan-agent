'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Markdown from '@/components/Markdown';

type Module = { id: string; label: string; description: string; icon: string; prompt: string };
type Artifact = { id: string; module: string; title: string; content: string; updatedAt: string };
type SavedQuote = { id: string; clientName: string; request: string; content: string; createdAt: string; budget?: string | null; duration?: string | null };

const modules: Module[] = [
  { id: 'profile', label: 'الملف التعريفي', description: 'هوية المكتب وخدماته', icon: '✦', prompt: 'أنشئ الملف التعريفي المعتمد للمكتب: النبذة، الرسالة، الخدمات، وعناصر التميز.' },
  { id: 'strategy', label: 'التخطيط الاستراتيجي', description: 'الرؤية والأهداف والأولويات', icon: '◈', prompt: 'أنشئ التخطيط الاستراتيجي للمكتب مع رؤية وأهداف وأولويات ومؤشرات قياس.' },
  { id: 'marketing', label: 'الخطة التسويقية', description: 'الجمهور والقنوات والرسائل', icon: '◎', prompt: 'أنشئ خطة تسويقية متسقة مع رؤية المكتب وخطة نموه، وحدد الجمهور والقنوات والرسائل.' },
  { id: 'content', label: 'المحتوى والموقع', description: 'الموقع وخطة النشر', icon: '⌘', prompt: 'صمم هيكل موقع المكتب وخطة محتوى شهرية متسقة مع الخدمات والجمهور المستهدف.' },
  { id: 'quotes', label: 'عروض الأسعار', description: 'وثائق العملاء والأتعاب', icon: '▤', prompt: '' },
  { id: 'growth', label: 'خطة النمو', description: 'الخدمات والفرص والتوسع', icon: '↗', prompt: 'حلل فرص نمو المكتب واقترح خدمات وتوسعات متسقة مع الرؤية والقدرات الحالية.' },
];
const officeContext = 'شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس. الخدمات: أعمال المحاماة، التوثيق، الإفلاس، التسجيل العيني. الموقع: القصيم - بريدة، المملكة العربية السعودية. العملة: الريال السعودي.';

export default function OfficeClient() {
  const [active, setActive] = useState('strategy');
  const [request, setRequest] = useState('');
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [savedQuotes, setSavedQuotes] = useState<SavedQuote[]>([]);
  const selected = useMemo(() => modules.find((item) => item.id === active) ?? modules[1], [active]);

  useEffect(() => {
    fetch('/api/office/plan').then((r) => r.ok ? r.json() : { artifacts: [] }).then((d) => setArtifacts(d.artifacts ?? [])).catch(() => {});
    fetch('/api/office/quote').then((r) => r.ok ? r.json() : { quotes: [] }).then((d) => setSavedQuotes(d.quotes ?? [])).catch(() => {});
  }, []);

  function choose(item: Module) {
    setActive(item.id); setResult(''); setRequest(item.prompt);
    const artifact = artifacts.find((a) => a.module === item.id);
    if (artifact) setResult(artifact.content);
  }

  async function generate() {
    if (!request.trim()) return;
    setBusy(true); setResult('');
    try {
      if (active === 'quotes') {
        const response = await fetch('/api/office/quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ style: 'premium', clientName: 'من المحادثة', request, clientActivity: '', scope: '', duration: '', budget: '', payment: '', exclusions: '' }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'تعذر إنشاء العرض.');
        setResult(data.content); if (data.quote) setSavedQuotes((old) => [{ ...data.quote, content: data.content, request, createdAt: String(data.quote.createdAt) }, ...old]);
      } else {
        const response = await fetch('/api/office/plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module: active, request, officeContext, existingArtifacts: artifacts }) });
        const data = await response.json(); if (!response.ok) throw new Error(data.error ?? 'تعذر إنشاء مخرج المشروع.');
        setResult(data.content); setArtifacts((old) => [{ ...data.artifact, updatedAt: String(data.artifact.updatedAt) }, ...old.filter((a) => a.module !== active)]);
      }
    } catch (error) { setResult(`تعذر إنشاء المخرج: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`); }
    finally { setBusy(false); }
  }

  return <main className="office-project min-h-[100dvh] bg-canvas text-ink" dir="rtl">
    <header className="office-project-topbar"><div className="flex items-center gap-3"><Link href="/" className="office-icon-btn" aria-label="العودة للمحادثة">←</Link><span className="office-mark">م</span><div><p className="text-sm font-bold">مشروع المكتب</p><p className="text-[11px] text-ink-muted">شركة المشيقح للمحاماة وإدارة إجراءات الإفلاس</p></div></div><div className="office-project-status"><span className="office-status-dot" /> مشروع خاص <span className="hidden sm:inline">· سياق مترابط</span></div></header>
    <div className="office-project-layout">
      <aside className="office-project-sidebar"><div className="mb-5"><p className="text-[10px] uppercase tracking-[.18em] text-ink-faint">المشروع</p><h1 className="mt-2 text-lg font-bold">إدارة المكتب</h1><p className="mt-1 text-xs leading-5 text-ink-muted">كل ما ينشئه مِيزان هنا يُستخدم لفهم المخرجات التالية.</p></div><button className="office-new-chat" onClick={() => { setResult(''); setRequest(''); }}>+ محادثة جديدة</button><p className="my-5 text-[10px] font-semibold text-ink-faint">مساحات المشروع</p><nav className="space-y-1">{modules.map((item) => <button key={item.id} onClick={() => choose(item)} className={`office-project-nav ${active === item.id ? 'active' : ''}`}><span>{item.icon}</span><span className="min-w-0 text-start"><b>{item.label}</b><small>{artifacts.some((a) => a.module === item.id) ? 'محدّث في سياق المشروع' : item.description}</small></span></button>)}</nav></aside>
      <section className="office-project-main"><div className="office-project-heading"><div><p className="text-[11px] font-medium tracking-[.16em] text-brand-600">PROJECTS / OFFICE</p><h2>{selected.label}</h2><p>{selected.description} · يعمل فوق سياق المشروع الكامل.</p></div><span className="office-context-badge">Fusion + سياق المشروع</span></div>
        {!result ? <div className="office-chat-card"><div className="office-chat-empty"><span className="office-chat-symbol">{selected.icon}</span><h3>ماذا ننجز في {selected.label}؟</h3><p>اكتب طلبك كما تفعل في Claude Projects أو ChatGPT Projects. سيقرأ مِيزان معلومات المكتب والمخرجات السابقة، وينبهك إذا وجد تعارضًا.</p></div><textarea value={request} onChange={(e) => setRequest(e.target.value)} rows={6} placeholder="اكتب طلب عرض السعر بطريقتك، مثل: أحتاج عرضًا لشركة ..." className="office-project-composer" /><div className="flex items-center justify-between gap-3"><span className="text-[11px] text-ink-muted">السياق والملفات والمخرجات السابقة تُستخدم تلقائيًا.</span><button onClick={generate} disabled={busy || !request.trim()} className="office-gold-btn">{busy ? 'يقرأ سياق المشروع…' : 'إرسال'} ↑</button></div></div> : <div className="office-project-result"><div className="mb-5 flex items-center justify-between border-b border-line pb-4 office-output-toolbar"><div><p className="text-[10px] tracking-[.15em] text-brand-600">PROJECT OUTPUT</p><h3>{selected.label}</h3></div><button onClick={() => setResult('')} className="office-icon-btn">×</button></div>{active === 'quotes' && <div className="office-quote-letterhead"><div className="office-quote-brand"><span className="office-quote-emblem">م</span><div><b>شركة عبدالرحمن بن رضوان المشيقح</b><small>للمحاماة وإدارة إجراءات الإفلاس</small></div></div><div className="office-quote-type"><b>عرض سعر</b><small>وثيقة مهنية سرية</small></div></div>}{result.includes('تنبيه اتساق') && <div className="office-conflict-alert"><b>تنبيه اتساق</b><span>راجع هذا التنبيه قبل اعتماد المخرج؛ توجد نقطة تحتاج قرارًا بين مخرجات المشروع.</span></div>}<article className="office-prose"><Markdown content={result} /></article><div className="mt-8 flex flex-wrap gap-2 office-output-actions"><button onClick={() => window.print()} className="office-outline-btn">طباعة / حفظ PDF</button><button onClick={() => setResult('')} className="office-gold-btn">محادثة جديدة</button></div></div>}
      </section>
      <aside className="office-project-context"><div className="office-context-section"><div className="flex items-center justify-between"><h3>التعليمات</h3><span>✎</span></div><p>أنت تعمل على مشروع شركة عبدالرحمن بن رضوان المشيقح للمحاماة وإدارة إجراءات الإفلاس. حافظ على الاتساق واللغة المهنية السعودية.</p></div><div className="office-context-section"><div className="flex items-center justify-between"><h3>الذاكرة</h3><span className="office-lock">خاص</span></div><p>يحفظ مِيزان مخرجات الوحدات الست ويراجعها قبل إنشاء مخرج جديد.</p></div><div className="office-context-section"><div className="flex items-center justify-between"><h3>ملفات المشروع</h3><button className="office-plus">+</button></div><div className="office-file-drop">أضف ملفات المكتب وملفات الهوية وعروض الأسعار المرجعية هنا.</div></div><div className="office-context-section"><h3>حالة الاتساق</h3><div className="office-coherence"><span className="office-status-dot" /><b>{artifacts.length ? 'السياق يعمل' : 'بانتظار أول مخرج'}</b><small>{artifacts.length} وحدات محفوظة من 6 · {savedQuotes.length} عروض محفوظة</small></div></div></aside>
    </div>
  </main>;
}
