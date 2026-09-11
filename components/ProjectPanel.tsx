'use client';

import { useMemo, useState } from 'react';
import CodeBlock from './CodeBlock';
import type { ProjectView } from '@/lib/types';

/* مساحة برمجية مصغّرة داخل المحادثة:
   عرض الملفات + نسخ الكود + تنزيل ZIP + تشغيل داخل الحاوية المعزولة. */

type RunState = {
  status: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs?: number;
  sandbox?: string;
  rejectionReason?: string | null;
  executed: boolean;
};

function guessLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    json: 'json',
    md: 'md',
    css: 'css',
    html: 'html',
    yml: 'yaml',
    yaml: 'yaml',
    sh: 'bash',
    py: 'python',
    sql: 'sql',
  };
  return map[ext] ?? '';
}

function defaultCommand(files: { path: string }[]): string {
  const entry =
    files.find((f) => f.path === 'index.js') ??
    files.find((f) => f.path === 'src/index.js') ??
    files.find((f) => f.path.endsWith('.js'));
  return entry ? `node ${entry.path}` : 'node index.js';
}

export default function ProjectPanel({ project }: { project: ProjectView }) {
  const [activePath, setActivePath] = useState(project.files[0]?.path ?? '');
  const [command, setCommand] = useState(() => defaultCommand(project.files));
  const [run, setRun] = useState<RunState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeFile = useMemo(
    () => project.files.find((f) => f.path === activePath) ?? project.files[0],
    [project.files, activePath],
  );

  async function execute() {
    setBusy(true);
    setError(null);
    setRun(null);
    try {
      const res = await fetch('/api/code/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, command }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRun({
          status: data.status ?? 'rejected',
          stdout: '',
          stderr: '',
          exitCode: null,
          rejectionReason: data.error,
          executed: false,
        });
        return;
      }
      setRun(data as RunState);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!project.files.length) return null;

  return (
    <section className="mizan-card animate-fade-up overflow-hidden" aria-label="ملفات المشروع">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas-soft px-3 py-2">
        <div className="min-w-0">
          <h3 className="truncate text-[13px] font-bold text-ink">{project.name}</h3>
          <p className="text-[11px] text-ink-faint">{project.files.length} ملف</p>
        </div>
        <a
          href={`/api/projects/${project.id}/download`}
          className="mizan-btn-ghost text-[12px]"
          download
        >
          تنزيل ZIP
        </a>
      </header>

      <nav
        className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2"
        aria-label="ملفات"
      >
        {project.files.map((f) => (
          <button
            key={f.path}
            type="button"
            onClick={() => setActivePath(f.path)}
            className={`shrink-0 rounded-lg px-2 py-1 text-[11.5px] transition ${
              f.path === activeFile?.path
                ? 'bg-brand-500 text-white'
                : 'bg-canvas-soft text-ink-muted hover:bg-line'
            }`}
            dir="ltr"
          >
            {f.path}
          </button>
        ))}
      </nav>

      <div className="px-3 pb-1">
        {activeFile && (
          <CodeBlock code={activeFile.content} language={guessLanguage(activeFile.path)} />
        )}
      </div>

      <div className="border-t border-line bg-canvas-soft px-3 py-2.5">
        <label htmlFor={`cmd-${project.id}`} className="text-[11.5px] font-semibold text-ink-muted">
          تشغيل داخل حاوية معزولة (بلا شبكة، بحدود ذاكرة ووقت)
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            id={`cmd-${project.id}`}
            dir="ltr"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-line bg-canvas-raised px-2.5 py-2 font-mono text-[12px] text-ink"
          />
          <button type="button" onClick={execute} disabled={busy} className="mizan-btn-primary">
            {busy ? 'جارٍ…' : 'تشغيل'}
          </button>
        </div>

        {error && <p className="mt-2 text-[12px] text-danger-600">{error}</p>}

        {run && (
          <div className="mt-2.5 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span
                className={`mizan-chip ${
                  run.status === 'succeeded'
                    ? 'border-brand-200 bg-brand-50 text-brand-700'
                    : 'border-danger-500/30 bg-danger-100 text-danger-600'
                }`}
              >
                {run.status === 'succeeded'
                  ? 'نجح التشغيل'
                  : run.status === 'timeout'
                    ? 'تجاوز المهلة'
                    : run.status === 'rejected'
                      ? 'رُفض التشغيل'
                      : 'فشل التشغيل'}
              </span>
              {run.executed && run.exitCode !== null && (
                <span className="mizan-chip">exit {run.exitCode}</span>
              )}
              {run.durationMs !== undefined && (
                <span className="mizan-chip">{run.durationMs}ms</span>
              )}
            </div>

            {run.rejectionReason && (
              <p className="rounded-xl bg-danger-100 px-3 py-2 text-[12px] leading-6 text-danger-600">
                {run.rejectionReason}
              </p>
            )}
            {run.stdout && <CodeBlock code={run.stdout} language="bash" />}
            {run.stderr && <CodeBlock code={run.stderr} language="bash" />}
            {run.executed && !run.stdout && !run.stderr && (
              <p className="text-[12px] text-ink-faint">انتهى التشغيل بلا مخرجات.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
