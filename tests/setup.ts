import { beforeAll, afterEach, vi } from 'vitest';

/* إعداد مشترك للاختبارات: بيئة ثابتة ولا اتصال بالشبكة أو قاعدة البيانات. */

beforeAll(() => {
  process.env.AUTH_SECRET = 'test-secret-key-that-is-long-enough-32ch';
  process.env.LLM_PROVIDER = 'mock';
  process.env.MAX_UPLOAD_BYTES = String(10 * 1024 * 1024);
  process.env.SANDBOX_ENABLED = 'false';
  process.env.WEB_READ_BLOCKED_HOSTS = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});
