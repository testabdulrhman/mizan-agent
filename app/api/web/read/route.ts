import { requireUser } from '@/lib/auth';
import { webReadSchema } from '@/lib/validation';
import { fail, handleError, ok, rateLimit } from '@/lib/http';
import { readPublicUrl } from '@/lib/web-reader';
import { extractUrls } from '@/lib/security';
import { env } from '@/lib/env';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/web/read
 * يقرأ صفحة عامة ويعيد العنوان ونصاً مختصراً. محمي بحماية SSRF كاملة.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`web:${user.id}`, 30, 5 * 60_000)) {
      return fail('عدد كبير من طلبات القراءة. انتظر قليلاً.', 429);
    }

    const body = webReadSchema.parse(await request.json());

    // نقبل رابطاً صريحاً أو نستخرجه من نص مرسل.
    const candidate = extractUrls(body.url)[0] ?? body.url;
    const result = await readPublicUrl(candidate, {
      usePlaywright: env().PLAYWRIGHT_ENABLED,
    });

    if (!result.ok) {
      const status = result.code === 'ssrf_blocked' ? 403 : result.code === 'timeout' ? 504 : 422;
      return fail(result.error, status, { code: result.code, url: result.url });
    }

    return ok({
      url: result.url,
      finalUrl: result.finalUrl,
      title: result.title,
      excerpt: result.excerpt,
      content: result.content,
      charCount: result.charCount,
      truncated: result.truncated,
      fetchedWith: result.fetchedWith,
    });
  } catch (err) {
    return handleError(err);
  }
}
