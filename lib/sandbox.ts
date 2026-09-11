import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { env } from './env';
import { isSafeProjectPath } from './security';

/* ==========================================================================
 * sandbox.ts — تشغيل الكود داخل حاوية معزولة فقط.
 *
 * قاعدة غير قابلة للتفاوض:
 *   لا يُنفَّذ كود المستخدم على الخادم الأساسي إطلاقاً.
 *   إن لم تتوفر بيئة معزولة يُرفض الطلب (fail-closed) ولا يوجد أي مسار بديل.
 *
 * القيود المطبّقة على كل تشغيل:
 *   --network none        منع الشبكة
 *   --memory / --cpus     حد ذاكرة ومعالج
 *   --pids-limit          منع قنابل التفريخ
 *   --read-only + tmpfs   نظام ملفات جذر للقراءة فقط
 *   --user 1000:1000      مستخدم غير root
 *   --cap-drop ALL        إسقاط كل الصلاحيات
 *   no-new-privileges     منع تصعيد الصلاحيات
 *   ulimit fsize          حد حجم الملفات المكتوبة
 *   مهلة زمنية + قتل الحاوية
 *   حذف مجلد العمل بعد الانتهاء
 * ========================================================================== */

export type SandboxFile = { path: string; content: string };

export type SandboxRequest = {
  files: SandboxFile[];
  command: string;
  runtime?: 'node' | 'python';
};

export type SandboxResult = {
  status: 'succeeded' | 'failed' | 'timeout' | 'rejected';
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  sandbox: string;
  /** سبب الرفض عندما تكون الحالة rejected — يُعرض للمستخدم كما هو. */
  rejectionReason?: string;
};

/* ---------------------------- فحص الأوامر ---------------------------- */

const ALLOWED_BINARIES = new Set(['node', 'npm', 'npx', 'tsc', 'vitest']);
const SHELL_METACHARS = /[;&|`$><\n\r\\]/;

export function assertSafeCommand(command: string): string {
  const cmd = command.trim();
  if (!cmd) throw new SandboxRejection('الأمر فارغ.');
  if (cmd.length > 300) throw new SandboxRejection('الأمر طويل جداً.');
  if (SHELL_METACHARS.test(cmd)) {
    throw new SandboxRejection('الأمر يحتوي على رموز صدفة غير مسموح بها (مثل ; أو | أو $).');
  }
  const binary = cmd.split(/\s+/)[0];
  if (!ALLOWED_BINARIES.has(binary)) {
    throw new SandboxRejection(
      `الأمر "${binary}" غير مسموح به. المسموح: ${[...ALLOWED_BINARIES].join(', ')}.`,
    );
  }
  return cmd;
}

export class SandboxRejection extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxRejection';
  }
}

/* ------------------------- التحقق من المشروع ------------------------- */

function validateFiles(files: SandboxFile[]): void {
  if (!files.length) throw new SandboxRejection('لا توجد ملفات لتشغيلها.');
  if (files.length > 100) throw new SandboxRejection('عدد الملفات يتجاوز 100.');

  let total = 0;
  for (const f of files) {
    if (!isSafeProjectPath(f.path)) {
      throw new SandboxRejection(`مسار ملف غير آمن: ${f.path}`);
    }
    total += Buffer.byteLength(f.content, 'utf-8');
  }
  const max = env().SANDBOX_MAX_PROJECT_BYTES;
  if (total > max) {
    throw new SandboxRejection(`حجم المشروع (${total} بايت) يتجاوز الحد ${max} بايت.`);
  }
}

/* --------------------------- توفر المحرك --------------------------- */

export async function sandboxAvailability(): Promise<{
  available: boolean;
  reason?: string;
  engine?: string;
}> {
  const cfg = env();
  if (!cfg.SANDBOX_ENABLED) {
    return {
      available: false,
      reason:
        'تشغيل الكود معطّل في هذا الخادم (SANDBOX_ENABLED=false). لا يوجد تنفيذ بديل على الخادم الأساسي.',
    };
  }
  const bin = cfg.SANDBOX_DOCKER_BIN;
  const probe = await runProcess(bin, ['version', '--format', '{{.Server.Version}}'], 5000);
  if (probe.exitCode !== 0) {
    return {
      available: false,
      reason: `محرك الحاويات (${bin}) غير متاح على هذا الخادم. تشغيل الكود متوقف حتى يتوفر — لن يُنفَّذ أي كود خارج الحاوية.`,
    };
  }
  return { available: true, engine: `${bin} ${probe.stdout.trim()}` };
}

/* ------------------------------ التشغيل ------------------------------ */

export async function runInSandbox(request: SandboxRequest): Promise<SandboxResult> {
  const cfg = env();
  const started = Date.now();
  const base: Omit<SandboxResult, 'status'> = {
    command: request.command,
    stdout: '',
    stderr: '',
    exitCode: null,
    durationMs: 0,
    sandbox: cfg.SANDBOX_IMAGE,
  };

  // 1) رفض مبكر: أوامر أو ملفات غير آمنة.
  let command: string;
  try {
    command = assertSafeCommand(request.command);
    validateFiles(request.files);
    if (request.runtime === 'python') {
      throw new SandboxRejection(
        'تشغيل Python غير مفعّل في هذه النسخة. البنية جاهزة لإضافته عبر صورة حاوية منفصلة.',
      );
    }
  } catch (err) {
    return {
      ...base,
      status: 'rejected',
      durationMs: Date.now() - started,
      rejectionReason: (err as Error).message,
    };
  }

  // 2) لا حاوية = لا تشغيل. لا يوجد fallback على الخادم.
  const availability = await sandboxAvailability();
  if (!availability.available) {
    return {
      ...base,
      status: 'rejected',
      durationMs: Date.now() - started,
      rejectionReason: availability.reason,
    };
  }

  // 3) تجهيز مجلد عمل مؤقت يُحذف في النهاية.
  const workdir = await mkdtemp(path.join(tmpdir(), 'mizan-sbx-'));
  try {
    for (const file of request.files) {
      const target = path.join(workdir, file.path);
      // حارس إضافي ضد الهروب من المجلد رغم فحص المسار.
      if (!target.startsWith(workdir + path.sep)) {
        throw new SandboxRejection(`مسار ملف غير آمن: ${file.path}`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, file.content, 'utf-8');
    }

    const args = buildDockerArgs(workdir, command);
    const exec = await runProcess(
      cfg.SANDBOX_DOCKER_BIN,
      args,
      cfg.SANDBOX_TIMEOUT_MS,
      cfg.SANDBOX_MAX_OUTPUT_BYTES,
    );

    const durationMs = Date.now() - started;
    if (exec.timedOut) {
      return {
        ...base,
        status: 'timeout',
        stdout: exec.stdout,
        stderr: exec.stderr || `تجاوز التنفيذ المهلة (${cfg.SANDBOX_TIMEOUT_MS} مللي ثانية).`,
        exitCode: exec.exitCode,
        durationMs,
        sandbox: availability.engine ?? cfg.SANDBOX_IMAGE,
      };
    }

    return {
      ...base,
      status: exec.exitCode === 0 ? 'succeeded' : 'failed',
      stdout: exec.stdout,
      stderr: exec.stderr,
      exitCode: exec.exitCode,
      durationMs,
      sandbox: availability.engine ?? cfg.SANDBOX_IMAGE,
    };
  } catch (err) {
    return {
      ...base,
      status: 'rejected',
      durationMs: Date.now() - started,
      rejectionReason: (err as Error).message,
    };
  } finally {
    // 4) حذف البيئة دائماً.
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  }
}

export function buildDockerArgs(workdir: string, command: string): string[] {
  const cfg = env();
  const parts = command.split(/\s+/);
  return [
    'run',
    '--rm',
    '--network=none',
    `--memory=${cfg.SANDBOX_MEMORY_MB}m`,
    `--memory-swap=${cfg.SANDBOX_MEMORY_MB}m`,
    `--cpus=${cfg.SANDBOX_CPUS}`,
    `--pids-limit=${cfg.SANDBOX_PIDS_LIMIT}`,
    '--read-only',
    '--tmpfs=/tmp:rw,noexec,nosuid,size=16m',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user=1000:1000',
    '--ulimit=fsize=4194304:4194304',
    '--ulimit=nofile=256:256',
    '--workdir=/workspace',
    '-v',
    `${workdir}:/workspace:rw`,
    '-e',
    'NODE_OPTIONS=--max-old-space-size=192',
    '-e',
    'HOME=/tmp',
    cfg.SANDBOX_IMAGE,
    ...parts,
  ];
}

/* --------------------------- مشغّل العمليات --------------------------- */

type ProcResult = { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean };

/**
 * يشغّل عملية خارجية (docker فقط) بمهلة وحد لحجم المخرجات.
 * ملاحظة: هذه الدالة لا تستقبل أوامر من المستخدم مباشرة — فقط docker وسيطاته.
 */
function runProcess(
  bin: string,
  args: string[],
  timeoutMs: number,
  maxOutputBytes = 200_000,
): Promise<ProcResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const child = spawn(bin, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      // بيئة نظيفة: لا نمرر أسرار الخادم إلى العملية.
      env: {
        PATH: process.env.PATH ?? '/usr/bin:/bin:/usr/local/bin',
      } as unknown as NodeJS.ProcessEnv,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const append = (target: 'out' | 'err', chunk: Buffer) => {
      const current = target === 'out' ? stdout : stderr;
      if (current.length >= maxOutputBytes) return;
      const text = chunk.toString('utf-8');
      const room = maxOutputBytes - current.length;
      const slice = text.length > room ? `${text.slice(0, room)}\n[...تم قطع المخرجات]` : text;
      if (target === 'out') stdout += slice;
      else stderr += slice;
    };

    child.stdout?.on('data', (c: Buffer) => append('out', c));
    child.stderr?.on('data', (c: Buffer) => append('err', c));

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode, timedOut });
    };

    child.on('error', (err) => {
      stderr += `\n${(err as Error).message}`;
      finish(null);
    });
    child.on('close', (code) => finish(code));
  });
}
