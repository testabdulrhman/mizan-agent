'use client';

import { useState } from 'react';
import Markdown from './Markdown';
import { CopyButton } from './CodeBlock';
import type { ChatMessageView, ToolLogView } from '@/lib/types';

/* رسالة واحدة في المحادثة: المستخدم داخل فقاعة، الوكيل بعرض كامل. */

const TOOL_LABELS: Record<string, string> = {
  read_public_url: 'قراءة رابط',
  extract_document_text: 'قراءة مستند',
  generate_code: 'إنشاء ملفات',
  write_project_file: 'كتابة ملف',
  list_project_files: 'عرض الملفات',
  run_code_sandboxed: 'تشغيل معزول',
  request_user_confirmation: 'طلب موافقة',
};

function ToolTrace({ log }: { log: ToolLogView[] }) {
  const [open, setOpen] = useState(false);
  if (!log.length) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-[11px] font-medium text-ink-faint underline underline-offset-4 hover:text-ink-muted"
      >
        {open ? 'إخفاء خطوات التنفيذ' : `خطوات التنفيذ (${log.length})`}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {log.map((entry, i) => (
            <li
              key={`${entry.name}-${i}`}
              className="rounded-xl border border-line bg-canvas-soft px-2.5 py-2 text-[11.5px] leading-5"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    entry.ok ? 'bg-brand-400' : 'bg-danger-500'
                  }`}
                  aria-hidden
                />
                <span className="font-semibold text-ink">
                  {TOOL_LABELS[entry.name] ?? entry.name}
                </span>
                <span className="text-ink-faint">{entry.ok ? 'نجحت' : 'فشلت'}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-ink-muted">{entry.summary}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ChatMessage({ message }: { message: ChatMessageView }) {
  const meta = message.metadata ?? {};
  const sources = (meta.effects ?? []).filter(
    (e): e is Extract<typeof e, { type: 'source' }> => e.type === 'source',
  );

  if (message.role === 'user') {
    return (
      <article className="flex animate-fade-up justify-start">
        <div className="max-w-[88%] rounded-2xl rounded-ss-md bg-brand-500 px-3.5 py-2.5 text-[15px] leading-7 text-white shadow-card">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
          {meta.attachments?.length ? (
            <ul className="mt-2 space-y-1 border-t border-white/20 pt-2">
              {meta.attachments.map((a) => (
                <li key={a.id} className="flex items-center gap-1.5 text-[12px] text-white/85">
                  <span aria-hidden>📎</span>
                  <span className="break-all">{a.filename}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </article>
    );
  }

  return (
    <article className="animate-fade-up">
      <header className="mb-1.5 flex items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-500 text-[11px] font-bold text-white"
          aria-hidden
        >
          م
        </span>
        <span className="text-[12px] font-semibold text-ink">ميزان</span>
        {meta.kindLabel && <span className="mizan-chip">{meta.kindLabel}</span>}
        {meta.provider === 'mock' && (
          <span className="mizan-chip border-accent-300 bg-accent-100 text-accent-600">
            وضع تجريبي
          </span>
        )}
      </header>

      <div className="mizan-card px-3.5 py-3">
        <Markdown content={message.content} />

        {sources.length > 0 && (
          <div className="mt-3 border-t border-line pt-2">
            <p className="mb-1 text-[11px] font-semibold text-ink-muted">
              المصادر التي قُرئت فعلياً
            </p>
            <ul className="space-y-1">
              {sources.map((s) => (
                <li key={s.url}>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="break-all text-[12px] text-brand-600 underline underline-offset-4"
                  >
                    {s.title || s.url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <ToolTrace log={meta.toolLog ?? []} />

        <div className="mt-2 flex justify-end">
          <CopyButton value={message.content} label="نسخ الرد" />
        </div>
      </div>
    </article>
  );
}
