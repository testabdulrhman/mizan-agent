import { mkdir, writeFile, unlink, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { env } from './env';

/* ==========================================================================
 * storage.ts — تخزين اختياري للملفات المرفوعة.
 * الافتراضي: لا يُكتب أي ملف على القرص. الملف يُحلَّل في الذاكرة ثم يُهمل.
 * يُكتب فقط عندما يفعّل المستخدم خيار "احفظ الملف" صراحةً.
 * التخزين محلي (مجلد على القرص). للتوسع: استبدل الدالتين بـ S3 أو ما يكافئه.
 * ========================================================================== */

function baseDir(): string {
  const dir = env().FILE_STORAGE_DIR;
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

export async function storeFile(userId: string, filename: string, data: Buffer): Promise<string> {
  const safeName = filename.replace(/[^\w.-]+/g, '_').slice(-80);
  const key = path.join(userId, `${randomUUID()}-${safeName}`);
  const target = path.join(baseDir(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return key;
}

export async function readStoredFile(key: string): Promise<Buffer> {
  const target = resolveKey(key);
  return readFile(target);
}

export async function deleteStoredFiles(keys: (string | null | undefined)[]): Promise<void> {
  await Promise.all(
    keys
      .filter((k): k is string => Boolean(k))
      .map(async (k) => {
        try {
          await unlink(resolveKey(k));
        } catch {
          // الملف غير موجود أصلاً — لا شيء لفعله.
        }
      }),
  );
}

/** يمنع الخروج من مجلد التخزين عبر مفاتيح ملفات ملتوية. */
function resolveKey(key: string): string {
  const root = baseDir();
  const target = path.resolve(root, key);
  if (!target.startsWith(path.resolve(root) + path.sep)) {
    throw new Error('مفتاح تخزين غير صالح.');
  }
  return target;
}

/** تاريخ انتهاء الاحتفاظ حسب السياسة المعلنة. */
export function retentionExpiry(): Date {
  const days = env().FILE_RETENTION_DAYS;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}
