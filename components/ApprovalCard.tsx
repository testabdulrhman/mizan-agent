'use client';

import { useState } from 'react';
import type { ApprovalView } from '@/lib/types';

/* بطاقة موافقة: تعرض العملية وأثرها، ولا يُنفَّذ شيء قبل ضغط "موافقة". */

export default function ApprovalCard({
  approval,
  onDecided,
}: {
  approval: ApprovalView;
  onDecided?: (id: string, status: 'approved' | 'rejected') => void;
}) {
  const [status, setStatus] = useState(approval.status);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/approvals/${approval.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'تعذّر تسجيل القرار.');
      const next = decision === 'approve' ? 'approved' : 'rejected';
      setStatus(next);
      onDecided?.(approval.id, next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="mizan-card animate-fade-up border-accent-300 bg-accent-100/40 px-3.5 py-3"
      aria-label="طلب موافقة"
    >
      <header className="flex items-center gap-2">
        <span aria-hidden>⚠️</span>
        <h3 className="text-[13px] font-bold text-ink">هذه العملية تحتاج موافقتك</h3>
      </header>

      <dl className="mt-2 space-y-1.5 text-[13px]">
        <div className="flex gap-2">
          <dt className="shrink-0 font-semibold text-ink-muted">العملية:</dt>
          <dd className="text-ink">{approval.action}</dd>
        </div>
        <div>
          <dt className="font-semibold text-ink-muted">ما الذي سيحدث:</dt>
          <dd className="mt-0.5 whitespace-pre-wrap break-words leading-6 text-ink">
            {approval.summary}
          </dd>
        </div>
      </dl>

      {status === 'pending' ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('approve')}
            className="mizan-btn-primary flex-1"
          >
            {busy ? 'جارٍ…' : 'موافقة'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => decide('reject')}
            className="mizan-btn-ghost flex-1"
          >
            إلغاء
          </button>
        </div>
      ) : (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-[12.5px] ${
            status === 'approved' ? 'bg-brand-50 text-brand-700' : 'bg-danger-100 text-danger-600'
          }`}
        >
          {status === 'approved'
            ? 'سُجّلت موافقتك. لن يُنفَّذ أي إجراء خارجي تلقائياً في هذه النسخة.'
            : 'أُلغيت العملية ولم يُنفَّذ شيء.'}
        </p>
      )}

      {error && <p className="mt-2 text-[12px] text-danger-600">{error}</p>}

      <p className="mt-2 text-[11px] leading-5 text-ink-faint">
        كل قرار يُسجَّل في سجل العمليات مع وقته.
      </p>
    </section>
  );
}
