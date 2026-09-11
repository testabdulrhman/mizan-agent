import { prisma } from '@/lib/db';
import { setSessionCookie, verifyPassword } from '@/lib/auth';
import { loginSchema } from '@/lib/validation';
import { fail, handleError, ok, rateLimit } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'local';
    if (!rateLimit(`login:${ip}`, 10, 10 * 60_000)) {
      return fail('محاولات كثيرة. حاول بعد قليل.', 429);
    }

    const body = loginSchema.parse(await request.json());
    const user = await prisma.user.findUnique({ where: { email: body.email } });

    // رسالة واحدة للحالتين حتى لا نكشف البريد المسجّل من غيره.
    const invalid = fail('البريد الإلكتروني أو كلمة المرور غير صحيحة.', 401);
    if (!user) return invalid;

    const valid = await verifyPassword(body.password, user.passwordHash);
    if (!valid) return invalid;

    const session = { id: user.id, name: user.name, email: user.email };
    await setSessionCookie(session);
    return ok({ user: session });
  } catch (err) {
    return handleError(err);
  }
}
