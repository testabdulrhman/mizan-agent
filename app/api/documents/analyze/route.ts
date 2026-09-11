import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { fail, handleError, ok, rateLimit } from '@/lib/http';
import { parseDocument, LEGAL_DISCLAIMER } from '@/lib/document-parser';
import { checkUploadedFile } from '@/lib/security';
import { storeFile, retentionExpiry } from '@/lib/storage';
import { runAgent } from '@/lib/agent';
import { env } from '@/lib/env';
import { deriveTitle } from '@/lib/prompt';

export const runtime = 'nodejs';
export const maxDuration = 120;

/**
 * POST /api/documents/analyze  (multipart/form-data)
 *   file            الملف (PDF أو DOCX أو نص)
 *   conversationId  اختياري — تُنشأ محادثة جديدة إن غاب
 *   question        اختياري — عند وجوده يُشغَّل التحليل ويُحفظ في المحادثة
 *   persist         "true" لحفظ الملف على القرص (افتراضياً لا يُحفظ)
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`docs:${user.id}`, 20, 10 * 60_000)) {
      return fail('عدد كبير من الملفات خلال وقت قصير. انتظر قليلاً.', 429);
    }

    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return fail('لم يُرفق ملف.', 400);
    }

    const declaredSize = file.size;
    const maxBytes = env().MAX_UPLOAD_BYTES;
    if (declaredSize > maxBytes) {
      return fail(
        `حجم الملف يتجاوز الحد المسموح (${(maxBytes / 1048576).toFixed(1)} ميجابايت).`,
        413,
      );
    }

    const precheck = checkUploadedFile({
      filename: file.name,
      mimeType: file.type,
      size: declaredSize,
    });
    if (!precheck.ok) {
      return fail(precheck.reason, 415);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parseDocument({
      filename: file.name,
      mimeType: file.type,
      buffer,
    });

    if (!parsed.ok) {
      const status = parsed.code === 'too_large' ? 413 : parsed.code === 'unsupported' ? 415 : 422;
      return fail(parsed.error, status, { code: parsed.code });
    }

    // المحادثة المرتبطة.
    const conversationId = form.get('conversationId');
    let conversation =
      typeof conversationId === 'string' && conversationId
        ? await prisma.conversation.findFirst({ where: { id: conversationId, userId: user.id } })
        : null;

    if (typeof conversationId === 'string' && conversationId && !conversation) {
      return fail('المحادثة غير موجودة.', 404);
    }
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { userId: user.id, title: deriveTitle(file.name) },
      });
    }

    // الحفظ الدائم اختياري وصريح.
    const persist = form.get('persist') === 'true';
    const storageKey = persist ? await storeFile(user.id, file.name, buffer) : null;

    const attachment = await prisma.attachment.create({
      data: {
        conversationId: conversation.id,
        filename: file.name,
        mimeType: parsed.mimeType,
        size: declaredSize,
        storageKey,
        persisted: persist,
        textPreview: parsed.text,
        expiresAt: persist ? retentionExpiry() : null,
      },
      select: { id: true, filename: true, mimeType: true, size: true, persisted: true },
    });

    const base = {
      conversationId: conversation.id,
      attachment,
      analysis: {
        kind: parsed.kind,
        pageCount: parsed.pageCount ?? null,
        charCount: parsed.charCount,
        truncated: parsed.truncated,
        needsOcr: parsed.needsOcr,
        warnings: parsed.warnings,
        excerpt: parsed.text.slice(0, 600),
      },
      notice: LEGAL_DISCLAIMER,
    };

    const question = form.get('question');
    if (typeof question !== 'string' || !question.trim()) {
      return ok(base);
    }

    // تحليل مباشر داخل نفس المحادثة.
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: question,
        metadata: { attachments: [{ id: attachment.id, filename: attachment.filename }] },
      },
    });

    const result = await runAgent({
      userId: user.id,
      conversationId: conversation.id,
      message: question,
      history: [],
      attachments: [
        {
          id: attachment.id,
          filename: attachment.filename,
          text: parsed.text,
          needsOcr: parsed.needsOcr,
          kind: parsed.kind,
        },
      ],
    });

    const saved = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: result.text,
        metadata: {
          kind: result.kind,
          kindLabel: result.kindLabel,
          toolLog: result.toolLog,
          effects: result.effects,
          provider: result.provider,
        } as unknown as Prisma.InputJsonObject,
      },
    });

    return ok({
      ...base,
      message: {
        id: saved.id,
        role: 'assistant',
        content: result.text,
        createdAt: saved.createdAt,
        metadata: { kind: result.kind, kindLabel: result.kindLabel, effects: result.effects },
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
