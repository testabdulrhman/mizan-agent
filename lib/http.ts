import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { UnauthorizedError } from './auth';

/* ==========================================================================
 * http.ts — ردود موحّدة + حد معدل بسيط في الذاكرة.
 * ملاحظة: الحد في الذاكرة يكفي لنسخة واحدة من التطبيق. عند التوسع الأفقي
 * انقله إلى Redis (مسجّل في README ضمن قرارات المعمارية).
 * ========================================================================== */

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status });
}

export function handleError(err: unknown) {
  if (err instanceof UnauthorizedError) {
    return fail('يجب تسجيل الدخول أولاً.', 401);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return fail(first?.message ?? 'مدخلات غير صالحة.', 422, {
      field: first?.path.join('.'),
    });
  }
  const message = (err as Error)?.message ?? 'خطأ غير متوقع';
  // لا نُسرّب تفاصيل داخلية في الإنتاج.
  if (process.env.NODE_ENV === 'production') {
    console.error('[mizan] error:', message);
    return fail('حدث خطأ في الخادم.', 500);
  }
  console.error('[mizan] error:', err);
  return fail(message, 500);
}

/* ------------------------------ حد المعدل ------------------------------ */

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}
