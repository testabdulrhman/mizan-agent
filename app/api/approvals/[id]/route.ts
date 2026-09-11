import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { fail, handleError, ok } from '@/lib/http';
import { z } from 'zod';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const decisionSchema = z.object({ decision: z.enum(['approve', 'reject']) });

/**
 * POST /api/approvals/:id — قرار المستخدم بشأن عملية مؤثرة.
 * القرار يُسجَّل فقط: التنفيذ الفعلي يتم بعده عبر المسار الخاص بالعملية،
 * ولا يوجد أي إجراء خارجي يُنفَّذ تلقائياً في هذه النسخة.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = decisionSchema.parse(await request.json());

    const approval = await prisma.approval.findFirst({ where: { id, userId: user.id } });
    if (!approval) return fail('طلب الموافقة غير موجود.', 404);
    if (approval.status !== 'pending') {
      return fail(`تم البت في هذا الطلب مسبقاً (${approval.status}).`, 409);
    }

    const updated = await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: body.decision === 'approve' ? 'approved' : 'rejected',
        decidedAt: new Date(),
      },
    });

    return ok({
      approval: {
        id: updated.id,
        action: updated.action,
        status: updated.status,
        decidedAt: updated.decidedAt,
      },
      executed: false,
      note:
        body.decision === 'approve'
          ? 'سُجّلت الموافقة. لم تُنفَّذ العملية تلقائياً: نفّذها الوكيل في الرسالة التالية أو نفّذها أنت يدوياً.'
          : 'أُلغيت العملية ولم يُنفَّذ شيء.',
    });
  } catch (err) {
    return handleError(err);
  }
}
