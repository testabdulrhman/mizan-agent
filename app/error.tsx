'use client';

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <h1 className="text-lg font-bold text-ink">حدث خطأ غير متوقع</h1>
      <p className="max-w-sm text-[13px] leading-6 text-ink-muted">
        تعذّر عرض الصفحة. إن تكرر الخطأ فتحقق من اتصال قاعدة البيانات ومتغيرات البيئة في ملف .env
      </p>
      <button type="button" onClick={reset} className="mizan-btn-primary">
        إعادة المحاولة
      </button>
    </main>
  );
}
