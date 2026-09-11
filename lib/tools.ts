import { prisma } from './db';
import { readPublicUrl } from './web-reader';
import { runInSandbox, sandboxAvailability } from './sandbox';
import { isSafeProjectPath } from './security';
import type { ToolDefinition, ToolCall } from './llm';

/* ==========================================================================
 * tools.ts — تعريف أدوات الوكيل وتنفيذها.
 *
 * كل أداة:
 *  - تُنفَّذ على الخادم فقط.
 *  - تتحقق من ملكية المستخدم للموارد قبل أي قراءة أو كتابة.
 *  - تُعيد نصاً واقعياً للنموذج (نجاحاً كان أو فشلاً) بلا تجميل.
 * ========================================================================== */

export type ToolContext = {
  userId: string;
  conversationId: string;
  /** المرفقات المتاحة في هذه المحادثة: النص مستخرج مسبقاً عند الرفع. */
  attachments: { id: string; filename: string; text: string; needsOcr: boolean }[];
  projectId?: string | null;
};

export type ToolEffect =
  | { type: 'project_files'; projectId: string; projectName: string; files: { path: string }[] }
  | { type: 'execution'; executionId: string; status: string }
  | { type: 'approval'; approvalId: string; action: string; summary: string }
  | { type: 'source'; url: string; title: string };

export type ToolOutcome = {
  content: string;
  isError: boolean;
  effects: ToolEffect[];
};

/* --------------------------- تعريفات الأدوات --------------------------- */

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'read_public_url',
    description:
      'يفتح صفحة ويب عامة ويعيد عنوانها ونصها الرئيسي. للصفحات العامة فقط: لا يسجّل الدخول ولا يتجاوز جدران الاشتراك، والعناوين الداخلية ممنوعة. استخدمه قبل أي حديث عن محتوى رابط.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'الرابط الكامل المراد قراءته (http أو https).' },
        reason: { type: 'string', description: 'سبب مختصر للقراءة يُعرض للمستخدم.' },
      },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'extract_document_text',
    description:
      'يعيد النص المستخرج من مرفق مرفوع في هذه المحادثة (PDF أو DOCX أو نص). استخدم اسم الملف أو معرّفه.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', description: 'اسم الملف كما ظهر في المحادثة.' },
        attachment_id: { type: 'string', description: 'معرّف المرفق إن كان معروفاً.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'list_project_files',
    description: 'يعرض مسارات ملفات مشروع الكود المرتبط بهذه المحادثة قبل تعديلها.',
    inputSchema: {
      type: 'object',
      properties: {
        project_id: { type: 'string', description: 'معرّف المشروع، اتركه فارغاً للمشروع الحالي.' },
      },
      required: [],
      additionalProperties: false,
    },
  },
  {
    name: 'generate_code',
    description:
      'ينشئ مشروع كود جديداً بملفاته كاملة، أو يحدّث المشروع الحالي بعدة ملفات دفعة واحدة. اكتب محتوى كل ملف كاملاً بلا اختصار.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'اسم المشروع بالإنجليزية بصيغة kebab-case.' },
        description: { type: 'string', description: 'وصف قصير لما يفعله المشروع.' },
        runtime: { type: 'string', enum: ['node'], description: 'بيئة التشغيل. حالياً node فقط.' },
        files: {
          type: 'array',
          description: 'قائمة الملفات بمساراتها ومحتواها الكامل.',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'مسار نسبي مثل src/index.js' },
              content: { type: 'string', description: 'محتوى الملف كاملاً.' },
            },
            required: ['path', 'content'],
          },
        },
      },
      required: ['name', 'files'],
      additionalProperties: false,
    },
  },
  {
    name: 'write_project_file',
    description: 'يكتب أو يستبدل ملفاً واحداً في المشروع الحالي.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'مسار نسبي داخل المشروع.' },
        content: { type: 'string', description: 'المحتوى الكامل للملف.' },
        project_id: { type: 'string', description: 'معرّف المشروع، اتركه فارغاً للمشروع الحالي.' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_code_sandboxed',
    description:
      'يشغّل أمراً على ملفات المشروع داخل حاوية معزولة بلا شبكة وبحدود زمن وذاكرة. الأوامر المسموحة تبدأ بـ node أو npm أو npx. إن رفضت الأداة التشغيل فانقل السبب للمستخدم ولا تدّعِ أن الكود اشتُغل.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'الأمر، مثال: node index.js' },
        project_id: { type: 'string', description: 'معرّف المشروع، اتركه فارغاً للمشروع الحالي.' },
      },
      required: ['command'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_user_confirmation',
    description:
      'يطلب موافقة صريحة من المستخدم قبل أي عملية مؤثرة أو خارجية (إرسال بريد، نشر، حذف، تغيير إعدادات، تنفيذ إجراء على موقع). لا تنفّذ العملية قبل وصول الموافقة.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'اسم العملية باختصار، مثال: إرسال بريد.' },
        summary: { type: 'string', description: 'وصف دقيق لما سيحدث عند الموافقة.' },
        details: { type: 'string', description: 'تفاصيل إضافية: المستلم، المحتوى، الأثر.' },
      },
      required: ['action', 'summary'],
      additionalProperties: false,
    },
  },
];

/* ------------------------------ التنفيذ ------------------------------ */

export async function executeTool(call: ToolCall, ctx: ToolContext): Promise<ToolOutcome> {
  try {
    switch (call.name) {
      case 'read_public_url':
        return await toolReadUrl(call.input);
      case 'extract_document_text':
        return toolExtractDocument(call.input, ctx);
      case 'list_project_files':
        return await toolListFiles(call.input, ctx);
      case 'generate_code':
        return await toolGenerateCode(call.input, ctx);
      case 'write_project_file':
        return await toolWriteFile(call.input, ctx);
      case 'run_code_sandboxed':
        return await toolRunSandboxed(call.input, ctx);
      case 'request_user_confirmation':
        return await toolRequestConfirmation(call.input, ctx);
      default:
        return { content: `أداة غير معروفة: ${call.name}`, isError: true, effects: [] };
    }
  } catch (err) {
    return {
      content: `فشل تنفيذ الأداة ${call.name}: ${(err as Error).message}`,
      isError: true,
      effects: [],
    };
  }
}

/* --------------------------- read_public_url --------------------------- */

async function toolReadUrl(input: Record<string, unknown>): Promise<ToolOutcome> {
  const url = String(input.url ?? '').trim();
  if (!url) return { content: 'لم يُمرَّر رابط.', isError: true, effects: [] };

  const result = await readPublicUrl(url);
  if (!result.ok) {
    return {
      content: `تعذّرت قراءة الرابط ${url}\nالسبب (${result.code}): ${result.error}\nلا تفترض محتوى هذه الصفحة.`,
      isError: true,
      effects: [],
    };
  }
  return {
    content: [
      `تمت قراءة الصفحة فعلياً عبر ${result.fetchedWith}.`,
      `الرابط النهائي: ${result.finalUrl}`,
      `العنوان: ${result.title}`,
      `عدد الحروف: ${result.charCount}${result.truncated ? ' (مقتطع)' : ''}`,
      '---',
      result.content,
    ].join('\n'),
    isError: false,
    effects: [{ type: 'source', url: result.finalUrl, title: result.title }],
  };
}

/* ------------------------ extract_document_text ------------------------ */

function toolExtractDocument(input: Record<string, unknown>, ctx: ToolContext): ToolOutcome {
  if (!ctx.attachments.length) {
    return {
      content: 'لا توجد مرفقات في هذه المحادثة. اطلب من المستخدم إرفاق الملف.',
      isError: true,
      effects: [],
    };
  }
  const id = input.attachment_id ? String(input.attachment_id) : '';
  const name = input.filename ? String(input.filename) : '';
  const found =
    ctx.attachments.find((a) => a.id === id) ??
    ctx.attachments.find((a) => a.filename === name) ??
    ctx.attachments.find((a) => name && a.filename.includes(name)) ??
    ctx.attachments[0];

  const ocrNote = found.needsOcr
    ? '\n\nتحذير: هذا الملف لا يحتوي على طبقة نصية كافية (يحتاج OCR غير متاح في هذه النسخة).'
    : '';

  return {
    content: `نص الملف ${found.filename}:\n---\n${found.text}${ocrNote}`,
    isError: false,
    effects: [],
  };
}

/* -------------------------- مشاريع الكود -------------------------- */

async function resolveProject(ctx: ToolContext, explicitId?: string) {
  const id = explicitId || ctx.projectId;
  if (!id) return null;
  // شرط userId يمنع الوصول إلى مشاريع مستخدم آخر.
  return prisma.project.findFirst({
    where: { id, userId: ctx.userId },
    include: { files: { orderBy: { path: 'asc' } } },
  });
}

async function toolListFiles(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const project = await resolveProject(
    ctx,
    input.project_id ? String(input.project_id) : undefined,
  );
  if (!project) {
    return { content: 'لا يوجد مشروع مرتبط بهذه المحادثة بعد.', isError: false, effects: [] };
  }
  const list = project.files.map((f) => `- ${f.path} (${f.content.length} حرف)`).join('\n');
  return {
    content: `مشروع ${project.name}:\n${list || '(لا توجد ملفات)'}`,
    isError: false,
    effects: [],
  };
}

const MAX_FILE_CHARS = 120_000;

async function toolGenerateCode(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const rawFiles = Array.isArray(input.files) ? input.files : [];
  const name = String(input.name ?? 'mizan-project').trim() || 'mizan-project';
  const description = input.description ? String(input.description) : null;

  const files: { path: string; content: string }[] = [];
  for (const f of rawFiles) {
    const item = f as { path?: unknown; content?: unknown };
    const p = String(item.path ?? '').trim();
    const content = String(item.content ?? '');
    if (!isSafeProjectPath(p)) {
      return { content: `مسار غير مقبول: ${p}`, isError: true, effects: [] };
    }
    if (content.length > MAX_FILE_CHARS) {
      return { content: `الملف ${p} يتجاوز الحد المسموح لحجم الملف.`, isError: true, effects: [] };
    }
    files.push({ path: p, content });
  }
  if (!files.length) {
    return { content: 'لم تُمرَّر ملفات.', isError: true, effects: [] };
  }

  const existing = await resolveProject(ctx);
  const project = existing
    ? await prisma.project.update({
        where: { id: existing.id },
        data: { name, description: description ?? existing.description },
      })
    : await prisma.project.create({
        data: {
          userId: ctx.userId,
          conversationId: ctx.conversationId,
          name,
          description,
          runtime: 'node',
        },
      });

  for (const file of files) {
    await prisma.projectFile.upsert({
      where: { projectId_path: { projectId: project.id, path: file.path } },
      create: { projectId: project.id, path: file.path, content: file.content },
      update: { content: file.content },
    });
  }

  return {
    content: `تم حفظ ${files.length} ملفاً في المشروع ${project.name} (معرّف ${project.id}). لم يُشغَّل أي كود بعد.`,
    isError: false,
    effects: [
      {
        type: 'project_files',
        projectId: project.id,
        projectName: project.name,
        files: files.map((f) => ({ path: f.path })),
      },
    ],
  };
}

async function toolWriteFile(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const p = String(input.path ?? '').trim();
  const content = String(input.content ?? '');
  if (!isSafeProjectPath(p)) {
    return { content: `مسار غير مقبول: ${p}`, isError: true, effects: [] };
  }
  if (content.length > MAX_FILE_CHARS) {
    return { content: `الملف ${p} يتجاوز الحد المسموح.`, isError: true, effects: [] };
  }

  let project = await resolveProject(ctx, input.project_id ? String(input.project_id) : undefined);
  if (!project) {
    const created = await prisma.project.create({
      data: {
        userId: ctx.userId,
        conversationId: ctx.conversationId,
        name: 'mizan-project',
        runtime: 'node',
      },
    });
    project = { ...created, files: [] };
  }

  await prisma.projectFile.upsert({
    where: { projectId_path: { projectId: project.id, path: p } },
    create: { projectId: project.id, path: p, content },
    update: { content },
  });

  return {
    content: `تم حفظ الملف ${p} في المشروع ${project.name}.`,
    isError: false,
    effects: [
      {
        type: 'project_files',
        projectId: project.id,
        projectName: project.name,
        files: [{ path: p }],
      },
    ],
  };
}

/* -------------------------- run_code_sandboxed -------------------------- */

async function toolRunSandboxed(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const command = String(input.command ?? '').trim();
  const project = await resolveProject(
    ctx,
    input.project_id ? String(input.project_id) : undefined,
  );
  if (!project) {
    return {
      content: 'لا يوجد مشروع لتشغيله. أنشئ الملفات أولاً عبر generate_code.',
      isError: true,
      effects: [],
    };
  }

  const availability = await sandboxAvailability();
  if (!availability.available) {
    // نسجّل المحاولة المرفوضة أيضاً.
    const execution = await prisma.execution.create({
      data: {
        projectId: project.id,
        status: 'rejected',
        command,
        error: availability.reason,
        finishedAt: new Date(),
      },
    });
    return {
      content: `لم يُشغَّل الكود. ${availability.reason} لا يوجد تنفيذ على الخادم الأساسي بأي حال.`,
      isError: true,
      effects: [{ type: 'execution', executionId: execution.id, status: 'rejected' }],
    };
  }

  const record = await prisma.execution.create({
    data: { projectId: project.id, status: 'running', command },
  });

  const result = await runInSandbox({
    files: project.files.map((f) => ({ path: f.path, content: f.content })),
    command,
    runtime: 'node',
  });

  await prisma.execution.update({
    where: { id: record.id },
    data: {
      status: result.status,
      output: result.stdout.slice(0, 100_000),
      error: (result.rejectionReason ?? result.stderr).slice(0, 100_000),
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      sandbox: result.sandbox,
      finishedAt: new Date(),
    },
  });

  const body =
    result.status === 'rejected'
      ? `رُفض التشغيل: ${result.rejectionReason}`
      : [
          `الحالة: ${result.status} | رمز الخروج: ${result.exitCode ?? 'غير متاح'} | المدة: ${result.durationMs}ms`,
          `البيئة: ${result.sandbox}`,
          result.stdout ? `--- المخرجات ---\n${result.stdout}` : '--- لا توجد مخرجات ---',
          result.stderr ? `--- الأخطاء ---\n${result.stderr}` : '',
        ]
          .filter(Boolean)
          .join('\n');

  return {
    content: body,
    isError: result.status !== 'succeeded',
    effects: [{ type: 'execution', executionId: record.id, status: result.status }],
  };
}

/* ---------------------- request_user_confirmation ---------------------- */

async function toolRequestConfirmation(
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const action = String(input.action ?? 'عملية غير محددة');
  const summary = String(input.summary ?? '');
  const details = input.details ? String(input.details) : null;

  const approval = await prisma.approval.create({
    data: {
      userId: ctx.userId,
      conversationId: ctx.conversationId,
      action,
      summary,
      details: details ? { text: details } : undefined,
      status: 'pending',
    },
  });

  return {
    content: `تم إنشاء طلب موافقة (${approval.id}) للعملية: ${action}. العملية لم تُنفَّذ ولن تُنفَّذ قبل موافقة المستخدم الصريحة. أبلغ المستخدم بذلك واطلب منه الضغط على "موافقة" أو "إلغاء".`,
    isError: false,
    effects: [{ type: 'approval', approvalId: approval.id, action, summary }],
  };
}
