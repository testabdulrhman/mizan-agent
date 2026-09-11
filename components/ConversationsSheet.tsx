'use client';

import { useEffect, useState } from 'react';
import type { ConversationSummary } from '@/lib/types';

/* سجل المحادثات كلوح منبثق من أسفل الشاشة (وليس شريطاً جانبياً). */

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('ar', { day: 'numeric', month: 'short' });
}

export default function ConversationsSheet({
  open,
  activeId,
  onClose,
  onSelect,
}: {
  open: boolean;
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
}) {
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch('/api/conversations')
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setError(data.error);
        else setItems(data.conversations ?? []);
      })
      .catch((err) => !cancelled && setError((err as Error).message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    if (open) document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  async function remove(id: string) {
    if (!window.confirm('حذف هذه المحادثة نهائياً مع رسائلها ومرفقاتها؟')) return;
    const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setItems((prev) => prev.filter((c) => c.id !== id));
      if (id === activeId) onSelect('');
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
      />

      <div className="relative max-h-[75vh] w-full max-w-3xl overflow-hidden rounded-t-2xl border border-line bg-canvas-raised shadow-card">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[14px] font-bold text-ink">سجل المحادثات</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-ink-faint transition hover:bg-canvas-soft hover:text-ink"
            aria-label="إغلاق"
          >
            ✕
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {loading && (
            <p className="px-3 py-6 text-center text-[13px] text-ink-faint">جارٍ التحميل…</p>
          )}
          {error && <p className="px-3 py-6 text-center text-[13px] text-danger-600">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="px-3 py-6 text-center text-[13px] text-ink-faint">لا توجد محادثات بعد.</p>
          )}

          <ul className="space-y-1">
            {items.map((c) => (
              <li key={c.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(c.id);
                    onClose();
                  }}
                  className={`min-w-0 flex-1 rounded-xl px-3 py-2.5 text-start transition ${
                    c.id === activeId ? 'bg-brand-50' : 'hover:bg-canvas-soft'
                  }`}
                >
                  <span className="block truncate text-[13.5px] font-medium text-ink">
                    {c.title}
                  </span>
                  <span className="block text-[11px] text-ink-faint">
                    {formatDate(c.updatedAt)} · {c.messageCount} رسالة
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => remove(c.id)}
                  aria-label={`حذف ${c.title}`}
                  className="rounded-lg px-2 py-2 text-ink-faint transition hover:bg-danger-100 hover:text-danger-600"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>
        </div>

        <p className="border-t border-line bg-canvas-soft px-4 py-2.5 text-[11px] leading-5 text-ink-faint">
          الحذف نهائي ويشمل الرسائل والمرفقات المحفوظة.
        </p>
      </div>
    </div>
  );
}
