import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { codeGenerateSchema } from '@/lib/validation';
import { fail, handleError, ok, rateLimit } from '@/lib/http';
import { runAgent } from '@/lib/agent';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/code/generate
 * ينشئ أو يعدّل ملفات مشروع عبر الوكيل. لا يشغّل أي كود.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`code:${user.id}`, 20, 10 * 60_000)) {
      return fail('طلبات كثيرة. انتظر قليلاً.', 429);
    }

    const body = codeGenerateSchema.parse(await request.json());

    const conversation = await prisma.conversation.findFirst({
      where: { id: body.conversationId, userId: user.id },
    });
    if (!conversation) return fail('المحادثة غير موجودة.', 404);

    const project = body.projectId
      ? await prisma.project.findFirst({ where: { id: body.projectId, userId: user.id } })
      : await prisma.project.findFirst({
          where: { conversationId: conversation.id, userId: user.id },
          orderBy: { updatedAt: 'desc' },
        });

    if (body.projectId && !project) return fail('المشروع غير موجود.', 404);

    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'asc' },
      take: 20,
      select: { role: true, content: true },
    });

    const result = await runAgent({
      userId: user.id,
      conversationId: conversation.id,
      message: body.prompt,
      history: history.map((h) => ({
        role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: h.content,
      })),
      attachments: [],
      projectId: project?.id ?? null,
    });

    const projectEffect = result.effects.find((e) => e.type === 'project_files');
    const finalProjectId =
      projectEffect && projectEffect.type === 'project_files'
        ? projectEffect.projectId
        : (project?.id ?? null);

    const files = finalProjectId
      ? await prisma.projectFile.findMany({
          where: { projectId: finalProjectId, project: { userId: user.id } },
          orderBy: { path: 'asc' },
          select: { path: true, content: true },
        })
      : [];

    return ok({
      explanation: result.text,
      projectId: finalProjectId,
      files,
      toolLog: result.toolLog,
      executed: false,
      note: 'لم يُشغَّل أي كود. استخدم POST /api/code/run للتشغيل داخل الحاوية المعزولة.',
    });
  } catch (err) {
    return handleError(err);
  }
}
