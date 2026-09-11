import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ميزان — Mizan Agent',
  description:
    'وكيل ذكاء اصطناعي عام يعمل من محادثة واحدة: يقرأ الروابط، يحلل المستندات، ويكتب الكود.',
  applicationName: 'Mizan Agent',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#F3F6F2',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-[100dvh]">{children}</body>
    </html>
  );
}
