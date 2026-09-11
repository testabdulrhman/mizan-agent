import { describe, it, expect, beforeEach, vi } from 'vitest';

/* عزل المستخدمين: لا يستطيع مستخدم رؤية أو حذف محادثة مستخدم آخر.
   نقلّد قاعدة البيانات بمخزن يحترم شرط userId تماماً كما يفعل Prisma. */

const store = vi.hoisted(() => ({
  currentUserId: 'user-a',
  conversations: [
    {
      id: 'conv-a',
      userId: 'user-a',
      title: 'محادثة أحمد',
      messages: [],
      attachments: [],
      projects: [],
    },
    {
      id: 'conv-b',
      userId: 'user-b',
      title: 'محادثة سارة',
      messages: [],
      attachments: [],
      projects: [],
    },
  ],
  deleteCalls: [] as string[],
}));

vi.mock('@/lib/auth', () => ({
  requireUser: vi.fn(async () => ({
    id: store.currentUserId,
    email: `${store.currentUserId}@example.com`,
    name: store.currentUserId,
  })),
  UnauthorizedError: class extends Error {},
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    conversation: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => {
        return (
          store.conversations.find((c) => c.id === where.id && c.userId === where.userId) ?? null
        );
      }),
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        store.conversations
          .filter((c) => c.userId === where.userId)
          .map((c) => ({
            ...c,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { messages: 0 },
          })),
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        store.deleteCalls.push(where.id);
        return { id: where.id };
      }),
      create: vi.fn(async () => ({ id: 'new-conv', title: 'محادثة جديدة' })),
      update: vi.fn(async () => ({ id: 'conv-a' })),
    },
    approval: { findMany: vi.fn(async () => []) },
    message: { findMany: vi.fn(async () => []), create: vi.fn(async () => ({ id: 'm1' })) },
    attachment: { findMany: vi.fn(async () => []) },
    project: { findFirst: vi.fn(async () => null) },
  },
}));

vi.mock('@/lib/storage', () => ({ deleteStoredFiles: vi.fn(async () => {}) }));

const { GET, DELETE } = await import('@/app/api/conversations/[id]/route');
const { GET: LIST } = await import('@/app/api/conversations/route');

function params(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  store.currentUserId = 'user-a';
  store.deleteCalls = [];
});

describe('عزل بيانات المستخدمين', () => {
  it('يسمح للمالك بقراءة محادثته', async () => {
    const res = await GET(new Request('http://test/api/conversations/conv-a'), params('conv-a'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.conversation.id).toBe('conv-a');
  });

  it('يمنع مستخدماً من قراءة محادثة مستخدم آخر', async () => {
    store.currentUserId = 'user-b';
    const res = await GET(new Request('http://test/api/conversations/conv-a'), params('conv-a'));
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.conversation).toBeUndefined();
  });

  it('يمنع حذف محادثة مستخدم آخر ولا ينفّذ أي حذف', async () => {
    store.currentUserId = 'user-b';
    const res = await DELETE(new Request('http://test/api/conversations/conv-a'), params('conv-a'));
    expect(res.status).toBe(404);
    expect(store.deleteCalls).toHaveLength(0);
  });

  it('يحذف محادثة المالك فقط', async () => {
    const res = await DELETE(new Request('http://test/api/conversations/conv-a'), params('conv-a'));
    expect(res.status).toBe(200);
    expect(store.deleteCalls).toEqual(['conv-a']);
  });

  it('لا تُدرج إلا محادثات المستخدم الحالي', async () => {
    const res = await LIST();
    const data = await res.json();
    expect(data.conversations).toHaveLength(1);
    expect(data.conversations[0].id).toBe('conv-a');

    store.currentUserId = 'user-b';
    const res2 = await LIST();
    const data2 = await res2.json();
    expect(data2.conversations[0].id).toBe('conv-b');
  });
});
