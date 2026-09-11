import { getCurrentUser } from '@/lib/auth';
import { handleError, ok } from '@/lib/http';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await getCurrentUser();
    return ok({ user });
  } catch (err) {
    return handleError(err);
  }
}
