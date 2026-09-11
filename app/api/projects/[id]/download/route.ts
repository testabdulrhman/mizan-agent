import { prisma } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { fail, handleError } from '@/lib/http';
import { buildProjectZip, sanitizeName } from '@/lib/zip';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** GET /api/projects/:id/download — ملف ZIP لمشروع يملكه المستخدم الحالي. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const project = await prisma.project.findFirst({
      where: { id, userId: user.id },
      include: { files: { orderBy: { path: 'asc' } } },
    });
    if (!project) return fail('المشروع غير موجود.', 404);
    if (!project.files.length) return fail('لا توجد ملفات في هذا المشروع.', 400);

    const zip = await buildProjectZip(
      project.name,
      project.files.map((f) => ({ path: f.path, content: f.content })),
    );
    const filename = `${sanitizeName(project.name)}.zip`;

    return new Response(new Uint8Array(zip), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zip.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
