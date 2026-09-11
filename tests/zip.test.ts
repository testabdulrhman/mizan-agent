import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildProjectZip, sanitizeName } from '@/lib/zip';

describe('تحزيم المشروع', () => {
  it('ينتج ملف ZIP يحتوي كل الملفات داخل مجلد المشروع', async () => {
    const buffer = await buildProjectZip('My Project', [
      { path: 'index.js', content: 'console.log(1);' },
      { path: 'src/util.js', content: 'export const x = 1;' },
    ]);

    const zip = await JSZip.loadAsync(buffer);
    expect(zip.file('My-Project/index.js')).toBeTruthy();
    expect(zip.file('My-Project/src/util.js')).toBeTruthy();
    expect(await zip.file('My-Project/index.js')?.async('string')).toBe('console.log(1);');
  });

  it('ينظّف اسم المشروع من المحارف الخطرة', () => {
    expect(sanitizeName('../../etc/passwd')).toBe('etc-passwd');
    expect(sanitizeName('')).toBe('mizan-project');
  });
});
