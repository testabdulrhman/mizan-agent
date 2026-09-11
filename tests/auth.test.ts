import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, createSessionToken, readSessionToken } from '@/lib/auth';

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
