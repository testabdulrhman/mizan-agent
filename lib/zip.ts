import JSZip from 'jszip';

/* ==========================================================================
 * zip.ts — تحزيم ملفات المشروع للتنزيل.
 * ========================================================================== */

export async function buildProjectZip(
  projectName: string,
  files: { path: string; content: string }[],
): Promise<Buffer> {
  const zip = new JSZip();
  const root = zip.folder(sanitizeName(projectName)) ?? zip;
  for (const file of files) {
    root.file(file.path, file.content);
  }
  const content = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  return content;
}

export function sanitizeName(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 60);
  return cleaned || 'mizan-project';
}
