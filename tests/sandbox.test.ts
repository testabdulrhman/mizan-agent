import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runInSandbox, assertSafeCommand, buildDockerArgs, SandboxRejection } from '@/lib/sandbox';
import { resetEnvCache } from '@/lib/env';

// نراقب spawn عبر mock كامل للوحدة: أي تشغيل فعلي سيمر من هنا.
const spawnMock = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, spawn: spawnMock };
});

/* الاختبار الأهم: لا يُنفَّذ كود المستخدم على الخادم الأساسي في أي حالة. */

beforeEach(() => {
  resetEnvCache();
  spawnMock.mockReset();
});

describe('التحقق من الأوامر', () => {
  it('يمنع رموز الصدفة', () => {
    expect(() => assertSafeCommand('node index.js; rm -rf /')).toThrow(SandboxRejection);
    expect(() => assertSafeCommand('node a.js && curl http://x')).toThrow(SandboxRejection);
    expect(() => assertSafeCommand('node -e "require(`child_process`)"')).toThrow(SandboxRejection);
    expect(() => assertSafeCommand('cat /etc/passwd > out')).toThrow(SandboxRejection);
  });

  it('يمنع الأوامر خارج القائمة المسموحة', () => {
    expect(() => assertSafeCommand('bash script.sh')).toThrow(SandboxRejection);
    expect(() => assertSafeCommand('rm -rf /')).toThrow(SandboxRejection);
    expect(() => assertSafeCommand('curl http://example.com')).toThrow(SandboxRejection);
  });

  it('يسمح بأوامر node و npm', () => {
    expect(assertSafeCommand('node index.js')).toBe('node index.js');
    expect(assertSafeCommand('npm test')).toBe('npm test');
  });
});

describe('عدم التشغيل على الخادم الأساسي', () => {
  it('يرفض التشغيل عندما تكون البيئة المعزولة معطّلة', async () => {
    process.env.SANDBOX_ENABLED = 'false';
    resetEnvCache();

    const result = await runInSandbox({
      files: [{ path: 'index.js', content: 'console.log("hi")' }],
      command: 'node index.js',
    });

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toContain('الخادم الأساسي');
    expect(result.exitCode).toBeNull();
    expect(result.stdout).toBe('');
  });

  it('لا يستدعي أي عملية نظام عندما تكون البيئة معطّلة', async () => {
    process.env.SANDBOX_ENABLED = 'false';
    resetEnvCache();

    await runInSandbox({
      files: [{ path: 'index.js', content: 'process.exit(0)' }],
      command: 'node index.js',
    });

    // لا spawn إطلاقاً: لا docker ولا node على الخادم الأساسي.
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it('يرفض المسارات الخطرة قبل أي تشغيل', async () => {
    process.env.SANDBOX_ENABLED = 'true';
    resetEnvCache();

    const result = await runInSandbox({
      files: [{ path: '../../etc/passwd', content: 'x' }],
      command: 'node index.js',
    });

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toContain('مسار ملف غير آمن');
  });

  it('يرفض تشغيل Python في هذه النسخة برسالة واضحة', async () => {
    process.env.SANDBOX_ENABLED = 'true';
    resetEnvCache();

    const result = await runInSandbox({
      files: [{ path: 'main.py', content: 'print(1)' }],
      command: 'node index.js',
      runtime: 'python',
    });

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toContain('Python');
  });

  it('يرفض المشروع الذي يتجاوز الحد الأقصى للحجم', async () => {
    process.env.SANDBOX_ENABLED = 'true';
    process.env.SANDBOX_MAX_PROJECT_BYTES = '1024';
    resetEnvCache();

    const result = await runInSandbox({
      files: [{ path: 'big.js', content: 'x'.repeat(5000) }],
      command: 'node big.js',
    });

    expect(result.status).toBe('rejected');
    expect(result.rejectionReason).toContain('حجم المشروع');
    process.env.SANDBOX_MAX_PROJECT_BYTES = String(2 * 1024 * 1024);
    resetEnvCache();
  });
});

describe('قيود الحاوية', () => {
  it('يمرر كل قيود العزل إلى docker run', () => {
    process.env.SANDBOX_ENABLED = 'true';
    resetEnvCache();

    const args = buildDockerArgs('/tmp/mizan-sbx-test', 'node index.js');
    const joined = args.join(' ');

    expect(joined).toContain('--network=none');
    expect(joined).toContain('--read-only');
    expect(joined).toContain('--cap-drop=ALL');
    expect(joined).toContain('--security-opt=no-new-privileges');
    expect(joined).toContain('--user=1000:1000');
    expect(joined).toContain('--memory=');
    expect(joined).toContain('--pids-limit=');
    expect(joined).toContain('--ulimit=fsize=');
    expect(joined).toContain('--rm');
    expect(args).toContain('/tmp/mizan-sbx-test:/workspace:rw');
    // المستخدم لا يستطيع الوصول إلى ملفات الخادم: المجلد الوحيد الممرَّر هو مجلد العمل المؤقت.
    expect(args.filter((a) => a === '-v')).toHaveLength(1);
  });
});
