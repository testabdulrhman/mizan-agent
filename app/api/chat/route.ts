import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { chatRequestSchema } from '@/lib/validation';
import { fail, handleError, ok, rateLimit } from '@/lib/http';
import { runAgent, type AgentAttachment } from '@/lib/agent';
import { deriveTitle } from '@/lib/prompt';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/chat
 * يستقبل رسالة المستخدم، يشغّل الوكيل، يحفظ الرسالتين، ويعيد الرد وبياناته.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`chat:${user.id}`, 30, 5 * 60_000)) {
      return fail('عدد كبير من الرسائل خلال وقت قصير. انتظر قليلاً.', 429);
    }

    const body = chatRequestSchema.parse(await request.json());

    // 1) المحادثة: قائمة أو جديدة. شرط userId يمنع الكتابة في محادثة مستخدم آخر.
    let conversation = body.conversationId
      ? await prisma.conversation.findFirst({
          where: { id: body.conversationId, userId: user.id },
        })
      : null;

    if (body.conversationId && !conversation) {
      return fail('المحادثة غير موجودة.', 404);
    }

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, title: deriveTitle(body.message) },
      });
    }

    // 2) المرفقات المطلوبة، ضمن هذه المحادثة فقط.
    const attachments = body.attachmentIds?.length
      ? await prisma.attachment.findMany({
          where: { id: { in: body.attachmentIds }, conversationId: conversation.id },
        })
      : [];

    const agentAttachments: AgentAttachment[] = attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      text: a.textPreview ?? '',
      needsOcr: (a.textPreview ?? '').trim().length === 0,
      kind: a.mimeType,
    }));

    // 3) السجل السابق.
    const history = await prisma.message.findMany({
      where: { conversationId: conversation.id, role: { in: ['user', 'assistant'] } },
      orderBy: { createdAt: 'asc' },
      take: 40,
      select: { role: true, content: true },
    });

    // 4) المشروع المرتبط بالمحادثة إن وُجد.
    const project = await prisma.project.findFirst({
      where: { conversationId: conversation.id, userId: user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    });

    // 5) حفظ رسالة المستخدم قبل التشغيل حتى لا تضيع عند فشل النموذج.
    const userMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: body.message,
        metadata: attachments.length
          ? { attachments: attachments.map((a) => ({ id: a.id, filename: a.filename })) }
          : undefined,
      },
    });

    // 6) تشغيل الوكيل.
    const result = await runAgent({
      userId: user.id,
      conversationId: conversation.id,
      message: body.message,
      history: history.map((h) => ({
        role: h.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: h.content,
      })),
      attachments: agentAttachments,
      projectId: project?.id ?? null,
    });

    // 7) حفظ رد الوكيل مع بياناته.
    const assistantMessage = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: result.text,
        metadata: {
          kind: result.kind,
          kindLabel: result.kindLabel,
          urls: result.urls,
          toolLog: result.toolLog,
          effects: result.effects,
          provider: result.provider,
          warning: result.warning ?? null,
        } as unknown as Prisma.InputJsonObject,
      },
    });

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return ok({
      conversationId: conversation.id,
      title: conversation.title,
      userMessage: { id: userMessage.id, createdAt: userMessage.createdAt },
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: result.text,
        createdAt: assistantMessage.createdAt,
        metadata: {
          kind: result.kind,
          kindLabel: result.kindLabel,
          urls: result.urls,
          toolLog: result.toolLog,
          effects: result.effects,
          provider: result.provider,
        },
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
