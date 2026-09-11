'use client';

import { useState } from 'react';

/* صندوق كود مع زر نسخ. الاتجاه LTR دائماً حتى داخل واجهة RTL. */

const LANG_LABEL: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JSX',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  tsx: 'TSX',
  typescript: 'TypeScript',
  json: 'JSON',
  bash: 'Terminal',
  sh: 'Terminal',
  shell: 'Terminal',
  python: 'Python',
  py: 'Python',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  yaml: 'YAML',
  md: 'Markdown',
};

export function CopyButton({ value, label = 'نسخ' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // متصفحات بلا Clipboard API: نستخدم عنصر مؤقت.
      const area = document.createElement('textarea');
      area.value = value;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      document.body.removeChild(area);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'تم النسخ' : label}
      className="rounded-lg border border-line bg-canvas-raised px-2 py-1 text-[11px] font-medium text-ink-muted transition hover:bg-canvas-soft hover:text-ink active:scale-95"
    >
      {copied ? 'تم النسخ ✓' : label}
    </button>
  );
}

export default function CodeBlock({ code, language }: { code: string; language?: string }) {
  const lang = (language ?? '').toLowerCase();
  const label = LANG_LABEL[lang] ?? (lang ? lang.toUpperCase() : 'كود');

  return (
    <figure className="my-3 overflow-hidden rounded-xl border border-line bg-[#0F2417]">
      <figcaption className="flex items-center justify-between gap-2 border-b border-white/10 bg-white/5 px-3 py-1.5">
        <span className="text-[11px] font-medium text-white/60">{label}</span>
        <CopyButton value={code} />
      </figcaption>
      <div className="overflow-x-auto">
        <pre dir="ltr" className="min-w-full p-3 text-[12.5px] leading-6 text-[#E6F0E8]">
          <code>{code}</code>
        </pre>
      </div>
    </figure>
  );
}
