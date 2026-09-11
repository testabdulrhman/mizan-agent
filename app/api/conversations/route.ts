import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { handleError, ok } from '@/lib/http';

export const runtime = 'nodejs';

/** GET /api/conversations — محادثات المستخدم الحالي فقط. */
export async function GET() {
  try {
    const user = await requireUser();
    const conversations = await prisma.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    });
    return ok({
      conversations: conversations.map((c) => ({
        id: c.id,
        title: c.title,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c._count.messages,
      })),
    });
  } catch (err) {
    return handleError(err);
  }
}

/** POST /api/conversations — محادثة جديدة فارغة. */
export async function POST() {
  try {
    const user = await requireUser();
    const conversation = await prisma.conversation.create({
      data: { userId: user.id, title: 'محادثة جديدة' },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
    });
    return ok({ conversation }, { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}
