'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/* نموذج دخول/تسجيل واحد. كلمات المرور تُرسل إلى الخادم فقط ولا تُخزَّن في المتصفح. */

export default function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRegister = mode === 'register';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isRegister ? { name, email, password } : { email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'تعذّر إتمام العملية.');
      router.replace('/');
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div
            className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-lg font-bold text-white"
            aria-hidden
          >
            م
          </div>
          <h1 className="text-xl font-bold text-ink">ميزان</h1>
          <p className="mt-1 text-[13px] text-ink-muted">
            {isRegister ? 'أنشئ حساباً للبدء' : 'سجّل الدخول للمتابعة'}
          </p>
        </div>

        <form onSubmit={submit} className="mizan-card space-y-3 px-4 py-4">
          {isRegister && (
            <div>
              <label htmlFor="name" className="mb-1 block text-[12.5px] font-medium text-ink-muted">
                الاسم
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                autoComplete="name"
                className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[15px] text-ink outline-none focus:border-brand-300"
              />
            </div>
          )}

          <div>
            <label htmlFor="email" className="mb-1 block text-[12.5px] font-medium text-ink-muted">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[15px] text-ink outline-none focus:border-brand-300"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1 block text-[12.5px] font-medium text-ink-muted"
            >
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={isRegister ? 8 : 1}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              className="w-full rounded-xl border border-line bg-canvas px-3 py-2.5 text-[15px] text-ink outline-none focus:border-brand-300"
            />
            {isRegister && <p className="mt-1 text-[11px] text-ink-faint">8 أحرف على الأقل.</p>}
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl bg-danger-100 px-3 py-2 text-[12.5px] text-danger-600"
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={busy} className="mizan-btn-primary w-full py-2.5">
            {busy ? 'جارٍ…' : isRegister ? 'إنشاء الحساب' : 'دخول'}
          </button>
        </form>

        <p className="mt-4 text-center text-[13px] text-ink-muted">
          {isRegister ? 'لديك حساب بالفعل؟ ' : 'ليس لديك حساب؟ '}
          <Link
            href={isRegister ? '/login' : '/register'}
            className="font-medium text-brand-600 underline underline-offset-4"
          >
            {isRegister ? 'تسجيل الدخول' : 'إنشاء حساب'}
          </Link>
        </p>

        <p className="mt-6 rounded-xl border border-accent-200 bg-accent-100/60 px-3 py-2.5 text-center text-[11px] leading-5 text-accent-600">
          نسخة تجريبية: لا ترفع معلومات حساسة. تُحفظ محادثاتك في قاعدة بيانات الخادم ويمكنك حذفها في
          أي وقت.
        </p>
      </div>
    </main>
  );
}
