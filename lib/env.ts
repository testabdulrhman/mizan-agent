import { z } from 'zod';

/**
 * التحقق من متغيرات البيئة على الخادم فقط.
 * أي مفتاح API يُقرأ هنا ولا يُمرَّر إلى الواجهة إطلاقاً.
 */

const boolish = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const intish = (def: number) =>
  z
    .string()
    .optional()
    .transform((v) => {
      const n = Number(v);
      return v === undefined || v === '' || Number.isNaN(n) ? def : n;
    });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().optional(),

  AUTH_SECRET: z.string().default('mizan-development-secret-change-me-please-32'),
  SESSION_TTL_DAYS: intish(7),

  LLM_PROVIDER: z.enum(['anthropic', 'openai', 'mock']).default('mock'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-5'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4.1'),
  OPENAI_BASE_URL: z.string().default('https://api.openai.com/v1'),

  WEB_READ_TIMEOUT_MS: intish(12_000),
  WEB_READ_MAX_BYTES: intish(2_500_000),
  PLAYWRIGHT_ENABLED: boolish(false),
  WEB_READ_BLOCKED_HOSTS: z.string().default(''),

  MAX_UPLOAD_BYTES: intish(10 * 1024 * 1024),
  FILE_STORAGE_DIR: z.string().default('.data/uploads'),
  FILE_RETENTION_DAYS: intish(30),

  SANDBOX_ENABLED: boolish(false),
  SANDBOX_IMAGE: z.string().default('mizan-sandbox-node:1'),
  SANDBOX_TIMEOUT_MS: intish(15_000),
  SANDBOX_MEMORY_MB: intish(256),
  SANDBOX_CPUS: z.string().default('0.5'),
  SANDBOX_PIDS_LIMIT: intish(128),
  SANDBOX_MAX_OUTPUT_BYTES: intish(200_000),
  SANDBOX_MAX_PROJECT_BYTES: intish(2 * 1024 * 1024),
  SANDBOX_DOCKER_BIN: z.string().default('docker'),
});

export type AppEnv = z.infer<typeof schema>;

let cached: AppEnv | null = null;

export function env(): AppEnv {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // لا نطبع القيم، فقط أسماء الحقول، حتى لا تتسرب أسرار في السجلات.
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`متغيرات بيئة غير صالحة: ${fields}`);
  }
  cached = parsed.data;
  return cached;
}

/** لإعادة الضبط داخل الاختبارات بعد تغيير process.env */
export function resetEnvCache() {
  cached = null;
}

export function isProduction() {
  return env().NODE_ENV === 'production';
}
