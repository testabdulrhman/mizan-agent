import { describe, it, expect, afterEach } from 'vitest';
import { hashPassword, verifyPassword, createSessionToken, readSessionToken } from '@/lib/auth';
import { resetEnvCache } from '@/lib/env';

describe('كلمات المرور', () => {
  it('لا تُخزَّن كنص صريح ويمكن التحقق منها', async () => {
    const hash = await hashPassword('super-secret-123');
    expect(hash).not.toContain('super-secret-123');
    expect(await verifyPassword('super-secret-123', hash)).toBe(true);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});

describe('جلسات JWT', () => {
  const user = { id: 'u1', email: 'a@example.com', name: 'أحمد' };

  it('تُنشأ وتُقرأ بنفس البيانات', async () => {
    const token = await createSessionToken(user);
    const session = await readSessionToken(token);
    expect(session).toEqual(user);
  });

  it('ترفض التوكن المزوّر', async () => {
    const token = await createSessionToken(user);
    const tampered = `${token.slice(0, -3)}abc`;
    expect(await readSessionToken(tampered)).toBeNull();
    expect(await readSessionToken('not-a-token')).toBeNull();
  });
});

describe('رفض المفاتيح الضعيفة', () => {
  const original = process.env.AUTH_SECRET;

  afterEach(() => {
    process.env.AUTH_SECRET = original;
    resetEnvCache();
  });

  it('يرفض القيمة التوضيحية المنسوخة من env.example', async () => {
    process.env.AUTH_SECRET = 'ضع-هنا-مفتاحاً-عشوائياً-طوله-32-حرفاً-على-الأقل';
    resetEnvCache();
    await expect(createSessionToken({ id: 'u1', email: 'a@b.co', name: 'x' })).rejects.toThrow(
      /القيمة التوضيحية/,
    );
  });

  it('يرفض المفتاح القصير', async () => {
    process.env.AUTH_SECRET = 'short';
    resetEnvCache();
    await expect(createSessionToken({ id: 'u1', email: 'a@b.co', name: 'x' })).rejects.toThrow(
      /32 حرفاً/,
    );
  });

  it('يرفض المفتاح منخفض التنوّع مهما طال', async () => {
    process.env.AUTH_SECRET = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    resetEnvCache();
    await expect(createSessionToken({ id: 'u1', email: 'a@b.co', name: 'x' })).rejects.toThrow(
      /ضعيف/,
    );
  });

  it('يقبل مفتاحاً عشوائياً حقيقياً', async () => {
    process.env.AUTH_SECRET = 'pS+BWq3Zk9Lx7NcR2hVtYuE4mJgD8sAfQbOwXi1TlKn5Cz0PdMrGeH6vUyIa';
    resetEnvCache();
    await expect(createSessionToken({ id: 'u1', email: 'a@b.co', name: 'x' })).resolves.toBeTypeOf(
      'string',
    );
  });
});
