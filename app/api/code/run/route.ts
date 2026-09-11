import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { codeRunSchema } from '@/lib/validation';
import { fail, handleError, ok, rateLimit } from '@/lib/http';
import { runInSandbox, sandboxAvailability } from '@/lib/sandbox';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/code/run
 * ينفّذ الأمر داخل حاوية معزولة فقط. إن لم تتوفر الحاوية يُرفض الطلب،
 * ولا يوجد أي مسار تنفيذ بديل على الخادم الأساسي.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (!rateLimit(`run:${user.id}`, 10, 10 * 60_000)) {
      return fail('عدد كبير من عمليات التشغيل. انتظر قليلاً.', 429);
    }

    const body = codeRunSchema.parse(await request.json());

    const project = await prisma.project.findFirst({
      where: { id: body.projectId, userId: user.id },
      include: { files: { orderBy: { path: 'asc' } } },
    });
    if (!project) return fail('المشروع غير موجود.', 404);

    const availability = await sandboxAvailability();
    if (!availability.available) {
      const execution = await prisma.execution.create({
        data: {
          projectId: project.id,
          status: 'rejected',
          command: body.command,
          error: availability.reason,
          finishedAt: new Date(),
        },
      });
      return fail(availability.reason ?? 'البيئة المعزولة غير متاحة.', 503, {
        executionId: execution.id,
        status: 'rejected',
        executed: false,
      });
    }

    const record = await prisma.execution.create({
      data: { projectId: project.id, status: 'running', command: body.command },
    });

    const result = await runInSandbox({
      files: project.files.map((f) => ({ path: f.path, content: f.content })),
      command: body.command,
      runtime: 'node',
    });

    const execution = await prisma.execution.update({
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

    return ok({
      executionId: execution.id,
      status: result.status,
      command: result.command,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      sandbox: result.sandbox,
      rejectionReason: result.rejectionReason ?? null,
      executed: result.status !== 'rejected',
    });
  } catch (err) {
    return handleError(err);
  }
}
