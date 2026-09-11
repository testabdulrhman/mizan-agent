'use client';

import { useEffect, useRef, useState } from 'react';
import FileAttachment from './FileAttachment';
import type { AttachmentView } from '@/lib/types';

/* مربع الكتابة الثابت أسفل الشاشة: إرفاق + إرسال + إدارة الارتفاع التلقائي. */

export type PendingAttachment = {
  localId: string;
  view: AttachmentView;
  status: 'uploading' | 'ready' | 'error';
  error?: string;
  serverId?: string;
};

const MAX_HEIGHT = 160;

export default function ChatComposer({
  value,
  onChange,
  onSubmit,
  onAttach,
  onRemoveAttachment,
  attachments,
  busy,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onAttach: (files: FileList) => void;
  onRemoveAttachment: (localId: string) => void;
  attachments: PendingAttachment[];
  busy: boolean;
  disabled?: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  const uploading = attachments.some((a) => a.status === 'uploading');
  const canSend =
    !busy &&
    !uploading &&
    (value.trim().length > 0 || attachments.some((a) => a.status === 'ready'));

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter يرسل على الشاشات الكبيرة، Shift+Enter سطر جديد.
    // على الجوال يبقى Enter سطراً جديداً لتفادي الإرسال بالخطأ.
    const isDesktop = window.matchMedia('(min-width: 768px)').matches;
    if (e.key === 'Enter' && !e.shiftKey && isDesktop) {
      e.preventDefault();
      if (canSend) onSubmit();
    }
  }

  return (
    <div
      className="sticky bottom-0 z-20 border-t border-line bg-canvas/95 shadow-composer backdrop-blur"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }}
    >
      <div className="mx-auto w-full max-w-3xl px-3 pt-2.5">
        {attachments.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {attachments.map((a) => (
              <li key={a.localId}>
                <FileAttachment
                  attachment={a.view}
                  status={a.status}
                  error={a.error}
                  onRemove={() => onRemoveAttachment(a.localId)}
                />
              </li>
            ))}
          </ul>
        )}

        <div
          className={`flex items-end gap-1.5 rounded-2xl border bg-canvas-raised px-2 py-1.5 transition ${
            focused ? 'border-brand-300 shadow-card' : 'border-line'
          }`}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) onAttach(e.target.files);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || busy}
            aria-label="إرفاق ملف"
            title="إرفاق PDF أو DOCX"
            className="mb-0.5 shrink-0 rounded-xl px-2 py-2 text-[17px] text-ink-muted transition hover:bg-canvas-soft hover:text-ink disabled:opacity-40"
          >
            📎
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            disabled={disabled}
            rows={1}
            placeholder="اكتب طلبك أو ألصق رابطاً…"
            aria-label="رسالتك"
            className="max-h-40 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-6 text-ink outline-none placeholder:text-ink-faint"
          />

          <button
            type="button"
            onClick={() => canSend && onSubmit()}
            disabled={!canSend}
            aria-label="إرسال"
            className="mb-0.5 shrink-0 rounded-xl bg-brand-500 px-3 py-2 text-white transition hover:bg-brand-600 active:scale-95 disabled:bg-line-strong disabled:text-ink-faint"
          >
            {busy ? (
              <span className="flex gap-0.5" aria-hidden>
                <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white" />
                <span
                  className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white"
                  style={{ animationDelay: '150ms' }}
                />
                <span
                  className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-white"
                  style={{ animationDelay: '300ms' }}
                />
              </span>
            ) : (
              <span aria-hidden className="text-[15px]">
                ↑
              </span>
            )}
          </button>
        </div>

        <p className="px-1 pb-1.5 pt-1.5 text-center text-[10.5px] leading-4 text-ink-faint">
          قد يخطئ الوكيل. تحقق من المعلومات المهمة ولا ترفع بيانات حساسة.
        </p>
      </div>
    </div>
  );
}
