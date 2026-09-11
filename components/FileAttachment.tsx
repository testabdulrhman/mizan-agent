'use client';

import type { AttachmentView } from '@/lib/types';

/* بطاقة مرفق داخل مربع الكتابة قبل الإرسال. */

const TYPE_LABEL: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'text/plain': 'نص',
  'text/markdown': 'MD',
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}

export default function FileAttachment({
  attachment,
  status = 'ready',
  error,
  onRemove,
}: {
  attachment: AttachmentView;
  status?: 'uploading' | 'ready' | 'error';
  error?: string;
  onRemove?: (id: string) => void;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-[12px] ${
        status === 'error' ? 'border-danger-500/40 bg-danger-100' : 'border-line bg-canvas-soft'
      }`}
    >
      <span aria-hidden className="text-[14px]">
        {status === 'uploading' ? '⏳' : status === 'error' ? '⚠️' : '📄'}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-ink" title={attachment.filename}>
          {attachment.filename}
        </p>
        <p className="text-[11px] text-ink-faint">
          {status === 'uploading'
            ? 'جارٍ الاستخراج…'
            : status === 'error'
              ? (error ?? 'تعذّر التحليل')
              : `${TYPE_LABEL[attachment.mimeType] ?? 'ملف'} · ${formatBytes(attachment.size)}`}
        </p>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(attachment.id)}
          aria-label={`إزالة ${attachment.filename}`}
          className="rounded-lg px-1.5 py-1 text-ink-faint transition hover:bg-canvas hover:text-danger-600"
        >
          ✕
        </button>
      )}
    </div>
  );
}
