'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { SessionUserView } from '@/lib/types';

/* رأس بسيط: اسم التطبيق + محادثة جديدة + سجل + الحساب. بلا تبويبات وبلا شريط جانبي. */

export default function Header({
  user,
  onNewChat,
  onOpenHistory,
}: {
  user: SessionUserView;
  onNewChat: () => void;
  onOpenHistory: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  }

  const initial = user.name.trim().charAt(0) || 'م';

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-3xl items-center justify-between gap-2 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-[13px] font-bold text-white"
            aria-hidden
          >
            م
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-[15px] font-bold leading-5 text-ink">ميزان</h1>
            <p className="truncate text-[10.5px] leading-4 text-ink-faint">وكيل ذكاء عام</p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="سجل المحادثات"
            title="سجل المحادثات"
            className="rounded-xl px-2.5 py-2 text-[15px] text-ink-muted transition hover:bg-canvas-soft hover:text-ink"
          >
            🕘
          </button>

          <Link
            href="/office"
            className="rounded-xl px-2.5 py-2 text-[13px] font-medium text-brand-600 transition hover:bg-canvas-soft"
            title="إدارة المكتب"
          >
            إدارة المكتب
          </Link>

          <button
            type="button"
            onClick={onNewChat}
            className="mizan-btn-ghost gap-1 px-2.5 text-[12.5px]"
            title="محادثة جديدة"
          >
            <span aria-hidden>＋</span>
            <span className="xs:inline hidden sm:inline">محادثة جديدة</span>
          </button>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="الحساب"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-canvas-soft text-[12px] font-bold text-brand-600 transition hover:bg-line"
            >
              {initial}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute end-0 top-10 z-40 w-56 overflow-hidden rounded-xl border border-line bg-canvas-raised shadow-card"
              >
                <div className="border-b border-line px-3 py-2.5">
                  <p className="truncate text-[13px] font-semibold text-ink">{user.name}</p>
                  <p className="truncate text-[11.5px] text-ink-faint" dir="ltr">
                    {user.email}
                  </p>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={logout}
                  className="w-full px-3 py-2.5 text-start text-[13px] text-danger-600 transition hover:bg-canvas-soft"
                >
                  تسجيل الخروج
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
