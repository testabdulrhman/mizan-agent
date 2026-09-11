import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { fail, handleError, ok } from '@/lib/http';
import { deleteStoredFiles } from '@/lib/storage';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** GET /api/conversations/:id — رسائل محادثة يملكها المستخدم الحالي. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: user.id },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        attachments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, filename: true, mimeType: true, size: true, createdAt: true },
        },
        projects: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            description: true,
            files: { select: { path: true, content: true }, orderBy: { path: 'asc' } },
          },
        },
      },
    });

    if (!conversation) return fail('المحادثة غير موجودة.', 404);

    const approvals = await prisma.approval.findMany({
      where: { conversationId: conversation.id, userId: user.id },
      orderBy: { createdAt: 'asc' },
    });

    return ok({ conversation, approvals });
  } catch (err) {
    return handleError(err);
  }
}

/** DELETE /api/conversations/:id — حذف المحادثة ورسائلها ومرفقاتها. */
export async function DELETE(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const conversation = await prisma.conversation.findFirst({
      where: { id, userId: user.id },
      select: { id: true, attachments: { select: { storageKey: true } } },
    });
    if (!conversation) return fail('المحادثة غير موجودة.', 404);

    // حذف الملفات المحفوظة على القرص قبل حذف السجلات.
    await deleteStoredFiles(conversation.attachments.map((a) => a.storageKey));
    await prisma.conversation.delete({ where: { id: conversation.id } });

    return ok({ deleted: true });
  } catch (err) {
    return handleError(err);
  }
}
