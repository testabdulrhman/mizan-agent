import { lookup } from 'node:dns/promises';
import { env } from './env';

/* ==========================================================================
 * security.ts — الطبقة الأمنية المشتركة
 * 1) استخراج الروابط من نص المستخدم.
 * 2) حماية SSRF: منع localhost والشبكات الداخلية وعناوين ما وراء البروكسي.
 * 3) قيود أنواع الملفات وأحجامها.
 * 4) تنقية النصوص قبل تمريرها إلى النموذج.
 * ========================================================================== */

/* --------------------------- استخراج الروابط --------------------------- */

// يلتقط http/https الصريحة و www. المختصرة، مع تجاهل الحروف العربية وعلامات الترقيم الملتصقة.
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"'`؀-ۿݐ-ݿ]+/gi;

// نطاق مكتوب بلا بروتوكول مثل example.com أو redwan.sa/page — شائع جداً في كتابة المستخدمين.
// الاستباق السالب يمنع الالتقاط داخل البريد الإلكتروني أو داخل رابط له بروتوكول أصلاً.
const BARE_DOMAIN_PATTERN =
  /(?<![@\w./-])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24}))(?::\d{2,5})?(?:\/[^\s<>"'`؀-ۿݐ-ݿ]*)?/gi;

const TRAILING_PUNCT = /[.,;:!?)\]}»”"'*_-]+$/;

// امتدادات ملفات تشبه النطاقات: index.js و data.json و report.pdf ليست روابط.
const FILE_EXTENSIONS = new Set([
  'js',
  'mjs',
  'cjs',
  'jsx',
  'ts',
  'tsx',
  'json',
  'md',
  'txt',
  'csv',
  'xml',
  'yml',
  'yaml',
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'py',
  'rb',
  'go',
  'rs',
  'php',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'cc',
  'h',
  'hpp',
  'cs',
  'sh',
  'bash',
  'zsh',
  'bat',
  'ps1',
  'sql',
  'env',
  'lock',
  'log',
  'ini',
  'cfg',
  'conf',
  'toml',
  'bak',
  'tmp',
  'zip',
  'tar',
  'gz',
  'rar',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'mp3',
  'mp4',
  'mov',
  'avi',
  'exe',
  'dll',
  'dmg',
  'iso',
  'apk',
  'jar',
]);

// نطاقات عليا أطول من ثلاثة أحرف نقبلها صراحةً (ما عداها نقبل 2-3 أحرف فقط).
const LONG_TLDS = new Set([
  'info',
  'name',
  'tech',
  'store',
  'online',
  'cloud',
  'email',
  'agency',
  'digital',
  'systems',
  'network',
  'company',
  'today',
  'world',
  'group',
  'live',
  'blog',
  'news',
  'shop',
  'site',
  'space',
  'link',
  'click',
  'page',
  'wiki',
  'host',
  'press',
  'media',
  'studio',
  'design',
  'expert',
  'center',
  'solutions',
  'academy',
  'school',
  'health',
  'legal',
  'finance',
]);

function isPlausibleTld(tld: string): boolean {
  const t = tld.toLowerCase();
  if (FILE_EXTENSIONS.has(t)) return false;
  return t.length <= 3 || LONG_TLDS.has(t);
}

/**
 * يستخرج الروابط الصالحة من رسالة المستخدم بترتيب ظهورها وبدون تكرار.
 * يقبل الروابط الكاملة، و www.، والنطاقات المكتوبة بلا بروتوكول.
 */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];

  const push = (raw: string) => {
    let candidate = raw.replace(TRAILING_PUNCT, '');
    // موازنة الأقواس: نسمح بقوس إغلاق فقط إن كان له قوس فتح مقابل.
    while (candidate.endsWith(')') && countChar(candidate, ')') > countChar(candidate, '(')) {
      candidate = candidate.slice(0, -1);
    }
    if (!candidate) return;
    const withScheme = /^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`;
    try {
      const url = new URL(withScheme);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
      if (!url.hostname.includes('.') && url.hostname !== 'localhost') return;
      // نرفض ما لا يمكن تمثيله كاسم نطاق (حروف غير لاتينية تسربت مثلاً).
      if (/[^a-z0-9.-]/i.test(url.hostname)) return;
      const normalized = url.toString();
      if (!out.includes(normalized)) out.push(normalized);
    } catch {
      // رابط غير صالح — نتجاهله بهدوء.
    }
  };

  for (const raw of text.match(URL_PATTERN) ?? []) push(raw);

  // النطاقات بلا بروتوكول: نتجاهل ما التُقط ضمن رابط كامل أعلاه.
  for (const match of text.matchAll(BARE_DOMAIN_PATTERN)) {
    const whole = match[0];
    const tld = match[2];
    if (!isPlausibleTld(tld)) continue;
    if (out.some((u) => u.includes(match[1].toLowerCase()))) continue;
    push(whole);
  }

  return out;
}

function countChar(s: string, c: string) {
  let n = 0;
  for (const ch of s) if (ch === c) n++;
  return n;
}

/* ------------------------------ حماية SSRF ------------------------------ */

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SsrfError';
  }
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
]);

const BLOCKED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
  '.onion',
];

/** المنافذ المسموح بها فقط — يمنع مسح المنافذ الداخلية عبر الوكيل. */
const ALLOWED_PORTS = new Set(['', '80', '443', '8080', '8443']);

export function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const n = parts.map((p) => Number(p));
  if (n.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return false;
  const [a, b] = n;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // شبكة خاصة
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true; // link-local + بيانات وصف السحابة
  if (a === 172 && b >= 16 && b <= 31) return true; // شبكة خاصة
  if (a === 192 && b === 168) return true; // شبكة خاصة
  if (a === 192 && b === 0) return true; // 192.0.0/24 و 192.0.2/24
  if (a === 198 && (b === 18 || b === 19)) return true; // قياس الأداء
  if (a === 198 && b === 51) return true; // TEST-NET-2
  if (a === 203 && b === 0) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + محجوز + broadcast
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase().split('%')[0]; // إزالة معرّف الواجهة
  if (addr === '::1' || addr === '::') return true;
  // عناوين IPv4 المغلفة داخل IPv6
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  const embedded = addr.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (embedded && (addr.startsWith('::') || addr.startsWith('64:ff9b:'))) {
    return isPrivateIPv4(embedded[1]);
  }
  const head = addr.split(':')[0];
  const first = parseInt(head || '0', 16);
  if (Number.isNaN(first)) return true;
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 محلي فريد
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return ip.includes(':') ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

function extraBlockedHosts(): string[] {
  return env()
    .WEB_READ_BLOCKED_HOSTS.split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * فحص الرابط بدون DNS: البروتوكول، بيانات الاعتماد، المنفذ، اسم المضيف.
 * يُستخدم أيضاً في الاختبارات لأنه لا يحتاج شبكة.
 */
export function assertSafeUrlShape(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SsrfError('الرابط غير صالح.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new SsrfError(`البروتوكول ${url.protocol} غير مسموح به. يُسمح بـ http و https فقط.`);
  }
  if (url.username || url.password) {
    throw new SsrfError('الروابط التي تحتوي على بيانات اعتماد غير مسموح بها.');
  }
  if (!ALLOWED_PORTS.has(url.port)) {
    throw new SsrfError(`المنفذ ${url.port} غير مسموح به.`);
  }

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) throw new SsrfError('اسم المضيف مفقود.');
  if (BLOCKED_HOSTNAMES.has(host)) {
    throw new SsrfError('الوصول إلى المضيف المحلي ممنوع.');
  }
  if (BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
    throw new SsrfError('الوصول إلى النطاقات الداخلية ممنوع.');
  }
  if (extraBlockedHosts().some((h) => host === h || host.endsWith(`.${h}`))) {
    throw new SsrfError('هذا النطاق ضمن القائمة المحظورة.');
  }
  // عنوان IP مكتوب مباشرة في الرابط
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    if (isPrivateAddress(host)) {
      throw new SsrfError('الوصول إلى عناوين الشبكة الداخلية ممنوع.');
    }
  }
  // صيغ رقمية ملتوية مثل http://2130706433/ أو http://0x7f000001/
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    throw new SsrfError('صيغة عنوان المضيف الرقمية غير مسموح بها.');
  }
  return url;
}

/**
 * فحص كامل يشمل استعلام DNS: كل العناوين المُعادة يجب أن تكون عامة.
 * يُستدعى قبل كل طلب شبكة وقبل كل إعادة توجيه.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  const url = assertSafeUrlShape(rawUrl);
  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(':')) {
    return url; // تم فحصه أعلاه كعنوان مباشر
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new SsrfError(`تعذّر تحويل اسم النطاق: ${host}`);
  }
  if (!addresses.length) {
    throw new SsrfError(`لا توجد عناوين IP للنطاق: ${host}`);
  }
  for (const a of addresses) {
    if (isPrivateAddress(a.address)) {
      throw new SsrfError('النطاق يشير إلى عنوان داخلي — الطلب ممنوع.');
    }
  }
  return url;
}

/* ---------------------------- قيود الملفات ---------------------------- */

export const SUPPORTED_DOCUMENT_TYPES = {
  'application/pdf': { ext: ['pdf'], label: 'PDF' },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: ['docx'],
    label: 'DOCX',
  },
  'text/plain': { ext: ['txt'], label: 'نص' },
  'text/markdown': { ext: ['md'], label: 'Markdown' },
} as const;

export type SupportedMime = keyof typeof SUPPORTED_DOCUMENT_TYPES;

// أنواع مخطط لدعمها لاحقاً — نرفضها الآن برسالة واضحة بدل خطأ عام.
const PLANNED_TYPES: Record<string, string> = {
  'application/msword': 'DOC (الصيغة القديمة)',
  'application/rtf': 'RTF',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'image/png': 'الصور (تحتاج OCR)',
  'image/jpeg': 'الصور (تحتاج OCR)',
};

export type FileCheckResult =
  { ok: true; mimeType: SupportedMime; label: string } | { ok: false; reason: string };

export function checkUploadedFile(input: {
  filename: string;
  mimeType: string;
  size: number;
}): FileCheckResult {
  const maxBytes = env().MAX_UPLOAD_BYTES;
  if (input.size <= 0) {
    return { ok: false, reason: 'الملف فارغ.' };
  }
  if (input.size > maxBytes) {
    const mb = (maxBytes / (1024 * 1024)).toFixed(1);
    return { ok: false, reason: `حجم الملف يتجاوز الحد المسموح (${mb} ميجابايت).` };
  }

  const ext = input.filename.split('.').pop()?.toLowerCase() ?? '';
  const declared = input.mimeType.split(';')[0].trim().toLowerCase();

  const entries = Object.entries(SUPPORTED_DOCUMENT_TYPES) as [
    SupportedMime,
    { ext: readonly string[]; label: string },
  ][];
  // نعتمد على الامتداد عندما يرسل المتصفح نوعاً عاماً
  const byExt = entries.find(([, v]) => v.ext.includes(ext));

  if (declared in SUPPORTED_DOCUMENT_TYPES) {
    const key = declared as SupportedMime;
    return { ok: true, mimeType: key, label: SUPPORTED_DOCUMENT_TYPES[key].label };
  }
  if ((declared === 'application/octet-stream' || declared === '') && byExt) {
    return { ok: true, mimeType: byExt[0], label: byExt[1].label };
  }
  if (declared in PLANNED_TYPES) {
    return {
      ok: false,
      reason: `${PLANNED_TYPES[declared]} غير مدعوم في هذه النسخة. المدعوم حالياً: PDF و DOCX والملفات النصية.`,
    };
  }
  return {
    ok: false,
    reason: `نوع الملف غير مدعوم (${declared || ext || 'غير معروف'}). المدعوم حالياً: PDF و DOCX والملفات النصية.`,
  };
}

/* ------------------------- تنقية وتقليم النصوص ------------------------- */

const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

/** يزيل محارف التحكم ويحدّ الطول قبل إرسال النص إلى النموذج. */
export function sanitizeText(text: string, maxChars = 200_000): string {
  const cleaned = text.replace(CONTROL_CHARS, '');
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars)}\n\n[...تم اقتطاع النص عند ${maxChars} حرف]`;
}

/** يمنع مسارات الهروب في ملفات المشاريع (../ أو المسارات المطلقة). */
export function isSafeProjectPath(p: string): boolean {
  if (!p || p.length > 200) return false;
  if (p.startsWith('/') || p.startsWith('\\')) return false;
  if (/^[a-zA-Z]:/.test(p)) return false;
  if (p.includes(' ')) return false;
  const segments = p.split('/');
  if (segments.some((s) => s === '..' || s === '.' || s === '')) return false;
  if (segments.some((s) => s.includes('\\'))) return false;
  return /^[\w.\-/@]+$/.test(p);
}
