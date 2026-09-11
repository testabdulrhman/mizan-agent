'use client';

import { useState } from 'react';
import Link from 'next/link';

type Style = 'formal' | 'premium' | 'brief';

const styles: { id: Style; title: string; description: string }[] = [
  { id: 'formal', title: 'رسمي وقانوني', description: 'صياغة رسمية مناسبة للجهات والعملاء القانونيين' },
  { id: 'premium', title: 'فاخر واستشاري', description: 'مقترح قيمة يبرز الحل والمخرجات والأثر' },
  { id: 'brief', title: 'مختصر ومباشر', description: 'عرض سريع وواضح للعميل' },
];

const initialForm = {
  clientName: '',
  clientActivity: '',
  request: '',
  scope: '',
  duration: '',
  budget: '',
  payment: '',
  exclusions: '',
};

export default function OfficePage() {
  const [style, setStyle] = useState<Style>('formal');
  const [form, setForm] = useState(initialForm);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function update(key: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function generate() {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = await fetch('/api/office/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ style, ...form }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'تعذّر إنشاء العرض.');
      setResult(data.content);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر إنشاء العرض.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-[100dvh] bg-canvas px-3 py-5 text-ink sm:px-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <Link href="/" className="text-xs text-brand-600 hover:underline">← العودة للمحادثة</Link>
            <h1 className="mt-2 text-2xl font-bold">إدارة المكتب</h1>
            <p className="mt-1 text-sm text-ink-muted">إنشاء عروض أسعار ومقترحات عملاء بصياغة احترافية.</p>
          </div>
          <div className="hidden rounded-2xl bg-brand-500 px-4 py-3 text-center text-white sm:block">
            <div className="text-lg font-bold">م</div>
            <div className="text-[10px]">مِيزان</div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="mizan-card p-4 sm:p-5">
            <h2 className="text-base font-bold">بيانات عرض السعر</h2>
            <p className="mt-1 text-xs leading-5 text-ink-muted">أدخل ما تعرفه، وسيقترح Fusion نطاق العمل والمخرجات والأسئلة الناقصة.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="اسم العميل" value={form.clientName} onChange={(v) => update('clientName', v)} placeholder="مثال: شركة ..." />
              <Field label="نشاط العميل" value={form.clientActivity} onChange={(v) => update('clientActivity', v)} placeholder="مثال: مقاولات" />
            </div>
            <TextField label="طلب العميل أو الهدف" value={form.request} onChange={(v) => update('request', v)} placeholder="ماذا يريد العميل تحديدًا؟" />
            <TextField label="نطاق العمل المبدئي" value={form.scope} onChange={(v) => update('scope', v)} placeholder="اكتب النقاط التي اتفقتم عليها، إن وجدت" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="المدة المتوقعة" value={form.duration} onChange={(v) => update('duration', v)} placeholder="مثال: 30 يومًا" />
              <Field label="الميزانية أو الأتعاب" value={form.budget} onChange={(v) => update('budget', v)} placeholder="مثال: 25,000 ريال" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="شروط الدفع" value={form.payment} onChange={(v) => update('payment', v)} placeholder="مثال: 50% مقدمًا" />
              <Field label="ما لا يشمله العرض" value={form.exclusions} onChange={(v) => update('exclusions', v)} placeholder="مثال: الرسوم الحكومية" />
            </div>

            <h2 className="mt-5 text-sm font-bold">أسلوب العرض</h2>
            <div className="mt-2 grid gap-2">
              {styles.map((item) => (
                <button key={item.id} type="button" onClick={() => setStyle(item.id)} className={`rounded-xl border p-3 text-start transition ${style === item.id ? 'border-brand-500 bg-brand-50' : 'border-line bg-canvas-raised hover:bg-canvas-soft'}`}>
                  <div className="flex items-center justify-between gap-2"><span className="text-sm font-semibold">{item.title}</span><span className="text-xs text-brand-600">{style === item.id ? 'مختار' : 'اختيار'}</span></div>
                  <p className="mt-1 text-xs text-ink-muted">{item.description}</p>
                </button>
              ))}
            </div>

            <button type="button" onClick={generate} disabled={busy || !form.clientName || !form.request} className="mizan-btn-primary mt-5 w-full py-3">
              {busy ? 'يحلّل المعطيات ويصيغ العرض…' : 'أنشئ عرض السعر عبر Fusion'}
            </button>
            {error && <p role="alert" className="mt-3 rounded-xl bg-danger-100 p-3 text-xs text-danger-600">{error}</p>}
          </section>

          <section className="mizan-card min-h-[520px] p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2 border-b border-line pb-3">
              <div><h2 className="text-base font-bold">المعاينة</h2><p className="mt-1 text-xs text-ink-muted">سيظهر العرض هنا لتراجعه قبل التصدير.</p></div>
              {result && <button type="button" onClick={() => window.print()} className="mizan-btn-ghost text-xs">طباعة / حفظ PDF</button>}
            </div>
            {result ? <article className="mizan-prose mt-5 whitespace-pre-wrap">{result}</article> : <div className="flex min-h-[420px] items-center justify-center text-center text-sm text-ink-faint"><div><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-50 text-xl text-brand-600">▤</div><p>أدخل بيانات العميل ثم أنشئ العرض.</p><p className="mt-1 text-xs">يمكنك طباعة المعاينة أو حفظها PDF من المتصفح.</p></div></div>}
          </section>
        </div>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="mt-3 block text-xs font-medium text-ink"><span>{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-1.5 w-full rounded-xl border border-line bg-canvas-raised px-3 py-2.5 text-sm font-normal outline-none transition focus:border-brand-400" /></label>;
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="mt-3 block text-xs font-medium text-ink"><span>{label}</span><textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={3} className="mt-1.5 w-full resize-y rounded-xl border border-line bg-canvas-raised px-3 py-2.5 text-sm font-normal outline-none transition focus:border-brand-400" /></label>;
}
