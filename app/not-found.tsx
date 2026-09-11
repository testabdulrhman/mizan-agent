import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
      <h1 className="text-lg font-bold text-ink">الصفحة غير موجودة</h1>
      <Link href="/" className="mizan-btn-primary">
        العودة إلى المحادثة
      </Link>
    </main>
  );
}
