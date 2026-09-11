import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { prisma } from './db';
import { env } from './env';

/* ==========================================================================
 * auth.ts — مصادقة بجلسة JWT داخل كوكي httpOnly.
 * لماذا لا NextAuth؟ الاحتياج بسيط (بريد + كلمة مرور)، وهذه الطريقة
 * قابلة للاختبار بالكامل بلا تبعيات إضافية. مسجَّل في README.
 * ========================================================================== */

const COOKIE_NAME = 'mizan_session';
const ALG = 'HS256';

export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

function secretKey(): Uint8Array {
  const secret = env().AUTH_SECRET;
  if (secret.length < 32) {
    throw new Error('AUTH_SECRET يجب أن يكون 32 حرفاً على الأقل.');
  }
  return new TextEncoder().encode(secret);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const days = env().SESSION_TTL_DAYS;
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setIssuer('mizan-agent')
    .setExpirationTime(`${days}d`)
    .sign(secretKey());
}

export async function readSessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: 'mizan-agent' });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      email: String(payload.email ?? ''),
      name: String(payload.name ?? ''),
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await createSessionToken(user);
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: env().SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** المستخدم الحالي أو null. لا يرمي استثناءً. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  const session = await readSessionToken(token);
  if (!session) return null;

  // نتحقق من بقاء المستخدم في قاعدة البيانات حتى لا تبقى جلسة لحساب محذوف.
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, email: true, name: true },
  });
  return user;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('يجب تسجيل الدخول.');
    this.name = 'UnauthorizedError';
  }
}

/** المستخدم الحالي أو استثناء — تستخدمه مسارات الـ API. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
