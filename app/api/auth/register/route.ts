import { prisma } from '@/lib/db';
import { hashPassword, setSessionCookie } from '@/lib/auth';
import { registerSchema } from '@/lib/validation';
import { fail, handleError, ok, rateLimit } from '@/lib/http';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const ip = request.headers.get('x-forwarded-for') ?? 'local';
    if (!rateLimit(`register:${ip}`, 5, 10 * 60_000)) {
      return fail('محاولات كثيرة. حاول بعد قليل.', 429);
    }

    const body = registerSchema.parse(await request.json());

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) {
      return fail('هذا البريد مسجّل بالفعل.', 409);
    }

    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash: await hashPassword(body.password),
      },
      select: { id: true, name: true, email: true },
    });

    await setSessionCookie(user);
    return ok({ user }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
