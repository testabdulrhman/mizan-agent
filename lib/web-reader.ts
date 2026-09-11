import { assertPublicUrl, sanitizeText, SsrfError } from './security';
import { env } from './env';

/* ==========================================================================
 * web-reader.ts — قراءة الصفحات العامة فقط.
 *
 * القواعد الثابتة:
 *  - كل رابط يمر بفحص SSRF قبل الطلب، وكل إعادة توجيه تُفحص من جديد.
 *  - مهلة زمنية وحجم أقصى صارمان.
 *  - لا تنفيذ لأي إجراء داخل الصفحة (نقر/نموذج) في هذه النسخة.
 *  - النتيجة تحمل دائماً fetchedWith حتى لا يدّعي الوكيل قراءة لم تحدث.
 *
 * التوسعة لاحقاً (المرحلة الخامسة): BrowserAction في الأسفل يصف الواجهة
 * المخططة للنقر والتنقل وملء النماذج عبر Playwright، وهي غير مفعّلة الآن.
 * ========================================================================== */

export type WebReadResult = {
  ok: true;
  url: string;
  finalUrl: string;
  title: string;
  content: string;
  excerpt: string;
  charCount: number;
  truncated: boolean;
  fetchedWith: 'http' | 'playwright';
  requiresLogin: boolean;
  note?: string;
};

export type WebReadFailure = {
  ok: false;
  url: string;
  error: string;
  code:
    | 'ssrf_blocked'
    | 'timeout'
    | 'http_error'
    | 'unsupported_content'
    | 'too_large'
    | 'login_required'
    | 'empty'
    | 'playwright_unavailable'
    | 'network_error';
};

export type WebReadOutcome = WebReadResult | WebReadFailure;

const MAX_REDIRECTS = 4;
const USER_AGENT =
  'Mozilla/5.0 (compatible; MizanAgent/0.1; +https://example.invalid/mizan-agent-bot)';

/* --------------------------- استخراج النص --------------------------- */

const BLOCK_TAGS =
  /<(script|style|noscript|template|svg|canvas|iframe|form|button|select|object|embed)[\s\S]*?<\/\1>/gi;
const CHROME_TAGS = /<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;

const ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&mdash;': '—',
  '&ndash;': '–',
  '&hellip;': '…',
  '&laquo;': '«',
  '&raquo;': '»',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&[a-z]+;|&#\d+;|&#x[0-9a-f]+;/gi, (m) => {
      const lower = m.toLowerCase();
      if (ENTITIES[lower]) return ENTITIES[lower];
      const dec = m.match(/^&#(\d+);$/);
      if (dec) return String.fromCodePoint(Number(dec[1]));
      const hex = m.match(/^&#x([0-9a-f]+);$/i);
      if (hex) return String.fromCodePoint(parseInt(hex[1], 16));
      return m;
    })
    .replace(/&amp;/g, '&');
}

export function extractTitle(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og?.[1]) return decodeEntities(og[1]).trim();
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t?.[1]) return decodeEntities(t[1]).replace(/\s+/g, ' ').trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1?.[1])
    return decodeEntities(h1[1].replace(/<[^>]+>/g, ''))
      .replace(/\s+/g, ' ')
      .trim();
  return 'بدون عنوان';
}

/**
 * تحويل HTML إلى نص مقروء: يحذف السكربتات والأنماط والقوائم والإعلانات،
 * ويفضّل محتوى <article> أو <main> إن وُجد.
 */
export function htmlToText(html: string): string {
  let doc = html.replace(COMMENTS, '').replace(BLOCK_TAGS, ' ');

  // نفضّل الحاوية الرئيسية إن كانت موجودة وذات حجم معقول.
  const article = doc.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const main = doc.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const candidate = article?.[1] ?? main?.[1];
  if (candidate && candidate.replace(/<[^>]+>/g, '').trim().length > 400) {
    doc = candidate;
  } else {
    doc = doc.replace(CHROME_TAGS, ' ');
  }

  const text = doc
    // فواصل أسطر منطقية قبل إزالة الوسوم
    .replace(/<\/(p|div|section|li|tr|h[1-6]|blockquote|pre)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, ' ');

  return decodeEntities(text)
    .replace(/[ \t ]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l, i, arr) => l.length > 0 || (i > 0 && arr[i - 1].length > 0))
    .join('\n')
    .trim();
}

const LOGIN_MARKERS = [
  'sign in to continue',
  'please log in',
  'log in to continue',
  'create a free account to read',
  'subscribe to read',
  'يجب تسجيل الدخول',
  'سجل الدخول للمتابعة',
  'هذا المحتوى للمشتركين',
];

function looksLikeLoginWall(status: number, text: string): boolean {
  if (status === 401 || status === 403) return true;
  const lower = text.toLowerCase().slice(0, 4000);
  const hit = LOGIN_MARKERS.some((m) => lower.includes(m.toLowerCase()));
  return hit && text.length < 3000;
}

/* ------------------------------ الجلب ------------------------------ */

async function fetchWithLimits(
  startUrl: string,
  timeoutMs: number,
  maxBytes: number,
): Promise<{
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
  truncated: boolean;
}> {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // كل قفزة تُفحص من جديد: إعادة التوجيه مسار شائع لتجاوز حماية SSRF.
    const safe = await assertPublicUrl(currentUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(safe.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'Accept-Language': 'ar,en;q=0.8',
        },
      });
    } finally {
      clearTimeout(timer);
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      if (!location) {
        return {
          status: res.status,
          finalUrl: safe.toString(),
          contentType: res.headers.get('content-type') ?? '',
          body: '',
          truncated: false,
        };
      }
      currentUrl = new URL(location, safe).toString();
      continue;
    }

    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    const declaredLength = Number(res.headers.get('content-length') ?? '0');
    if (declaredLength > maxBytes) {
      throw new WebReadError('too_large', `حجم الصفحة يتجاوز الحد المسموح (${maxBytes} بايت).`);
    }

    // قراءة تدريجية مع قطع عند الحد الأقصى.
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    let truncated = false;

    if (reader) {
      const readTimer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!value) continue;
          total += value.byteLength;
          if (total > maxBytes) {
            chunks.push(value.slice(0, Math.max(0, value.byteLength - (total - maxBytes))));
            truncated = true;
            await reader.cancel().catch(() => {});
            break;
          }
          chunks.push(value);
        }
      } finally {
        clearTimeout(readTimer);
      }
    }

    const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const charset = contentType
      .match(/charset=([^;]+)/)?.[1]
      ?.trim()
      .toLowerCase();
    const decoder = new TextDecoder(charset && isSupportedCharset(charset) ? charset : 'utf-8', {
      fatal: false,
    });

    return {
      status: res.status,
      finalUrl: safe.toString(),
      contentType,
      body: decoder.decode(buffer),
      truncated,
    };
  }

  throw new WebReadError('http_error', 'عدد كبير جداً من عمليات إعادة التوجيه.');
}

function isSupportedCharset(cs: string): boolean {
  try {
    new TextDecoder(cs);
    return true;
  } catch {
    return false;
  }
}

export class WebReadError extends Error {
  code: WebReadFailure['code'];
  constructor(code: WebReadFailure['code'], message: string) {
    super(message);
    this.code = code;
    this.name = 'WebReadError';
  }
}

/* --------------------------- الواجهة العامة --------------------------- */

export type ReadUrlOptions = {
  /** استخدام Playwright بدل fetch (يتطلب PLAYWRIGHT_ENABLED=true وتثبيت الحزمة). */
  usePlaywright?: boolean;
  maxChars?: number;
};

/**
 * يقرأ صفحة عامة ويعيد العنوان والنص. لا يرمي استثناءً: يعيد كائن فشل موصوفاً
 * حتى يتمكن الوكيل من إبلاغ المستخدم بالسبب الحقيقي بدل اختلاق محتوى.
 */
export async function readPublicUrl(
  rawUrl: string,
  options: ReadUrlOptions = {},
): Promise<WebReadOutcome> {
  const cfg = env();
  const maxChars = options.maxChars ?? 20_000;

  try {
    if (options.usePlaywright) {
      return await readWithPlaywright(rawUrl, maxChars);
    }

    const { status, finalUrl, contentType, body, truncated } = await fetchWithLimits(
      rawUrl,
      cfg.WEB_READ_TIMEOUT_MS,
      cfg.WEB_READ_MAX_BYTES,
    );

    if (status === 401 || status === 403) {
      return {
        ok: false,
        url: rawUrl,
        code: 'login_required',
        error: `الصفحة تتطلب تسجيل دخول أو ترفض الوصول الآلي (رمز ${status}). لم أتمكن من قراءة محتواها.`,
      };
    }
    if (status >= 400) {
      return {
        ok: false,
        url: rawUrl,
        code: 'http_error',
        error: `الخادم أعاد رمز ${status}. لم أستطع قراءة الصفحة.`,
      };
    }

    const isHtml = contentType.includes('html') || contentType === '';
    const isText = contentType.includes('text/') || contentType.includes('json');
    if (!isHtml && !isText) {
      return {
        ok: false,
        url: rawUrl,
        code: 'unsupported_content',
        error: `نوع المحتوى (${contentType || 'غير معروف'}) غير مدعوم للقراءة النصية. المدعوم: صفحات HTML والنصوص.`,
      };
    }

    const title = isHtml ? extractTitle(body) : finalUrl;
    const text = isHtml ? htmlToText(body) : body;

    if (looksLikeLoginWall(status, text)) {
      return {
        ok: false,
        url: rawUrl,
        code: 'login_required',
        error:
          'يبدو أن الصفحة محمية بتسجيل دخول أو اشتراك. المحتوى الظاهر لا يكفي للتلخيص، ولا أستطيع تسجيل الدخول نيابة عنك.',
      };
    }
    if (text.trim().length < 40) {
      return {
        ok: false,
        url: rawUrl,
        code: 'empty',
        error:
          'الصفحة لم تُرجع نصاً كافياً عبر الطلب المباشر. قد تعتمد على JavaScript — يمكن تفعيل Playwright لقراءتها.',
      };
    }

    const clipped = sanitizeText(text, maxChars);
    return {
      ok: true,
      url: rawUrl,
      finalUrl,
      title,
      content: clipped,
      excerpt: clipped.slice(0, 400),
      charCount: text.length,
      truncated: truncated || text.length > maxChars,
      fetchedWith: 'http',
      requiresLogin: false,
    };
  } catch (err) {
    return toFailure(rawUrl, err);
  }
}

function toFailure(url: string, err: unknown): WebReadFailure {
  if (err instanceof SsrfError) {
    return { ok: false, url, code: 'ssrf_blocked', error: err.message };
  }
  if (err instanceof WebReadError) {
    return { ok: false, url, code: err.code, error: err.message };
  }
  const e = err as { name?: string; message?: string };
  if (e?.name === 'AbortError' || e?.name === 'TimeoutError') {
    return { ok: false, url, code: 'timeout', error: 'انتهت المهلة الزمنية قبل تحميل الصفحة.' };
  }
  return {
    ok: false,
    url,
    code: 'network_error',
    error: `تعذّر الوصول إلى الرابط: ${e?.message ?? 'خطأ شبكة غير معروف'}`,
  };
}

/* ---------------------- Playwright (اختياري) ---------------------- */

type PlaywrightRoute = {
  request(): { url(): string };
  continue(): Promise<void>;
  abort(): Promise<void>;
};
type PlaywrightPage = {
  goto(url: string, opts: { waitUntil: string; timeout: number }): Promise<unknown>;
  content(): Promise<string>;
  url(): string;
};
type PlaywrightContext = {
  route(pattern: string, handler: (route: PlaywrightRoute) => Promise<void>): Promise<void>;
  newPage(): Promise<PlaywrightPage>;
  close(): Promise<void>;
};
type PlaywrightBrowser = {
  newContext(opts: Record<string, unknown>): Promise<PlaywrightContext>;
  close(): Promise<void>;
};
type PlaywrightChromium = { launch(opts: { headless: boolean }): Promise<PlaywrightBrowser> };

async function readWithPlaywright(rawUrl: string, maxChars: number): Promise<WebReadOutcome> {
  const cfg = env();
  if (!cfg.PLAYWRIGHT_ENABLED) {
    return {
      ok: false,
      url: rawUrl,
      code: 'playwright_unavailable',
      error: 'المتصفح التفاعلي غير مفعّل. فعّل PLAYWRIGHT_ENABLED=true لاستخدامه.',
    };
  }
  const safe = await assertPublicUrl(rawUrl);

  // مواصفات مصغّرة: الحزمة اختيارية وقد لا تكون مثبتة، لذلك لا نستورد أنواعها.
  let chromium: PlaywrightChromium;
  try {
    const moduleName = 'playwright';
    const mod = (await import(moduleName)) as { chromium: PlaywrightChromium };
    chromium = mod.chromium;
  } catch {
    return {
      ok: false,
      url: rawUrl,
      code: 'playwright_unavailable',
      error:
        'حزمة playwright غير مثبتة. ثبّتها بـ: npm install playwright && npx playwright install chromium',
    };
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      javaScriptEnabled: true,
      bypassCSP: false,
    });
    // لا نسمح للصفحة بالتنقل إلى عناوين داخلية عبر إعادة توجيه.
    await context.route('**/*', async (route) => {
      try {
        await assertPublicUrl(route.request().url());
        await route.continue();
      } catch {
        await route.abort();
      }
    });

    const page = await context.newPage();
    await page.goto(safe.toString(), {
      waitUntil: 'domcontentloaded',
      timeout: cfg.WEB_READ_TIMEOUT_MS,
    });
    const html = await page.content();
    const finalUrl = page.url();
    await context.close();

    const title = extractTitle(html);
    const text = htmlToText(html);
    if (text.trim().length < 40) {
      return { ok: false, url: rawUrl, code: 'empty', error: 'الصفحة لم تُرجع نصاً كافياً.' };
    }
    const clipped = sanitizeText(text, maxChars);
    return {
      ok: true,
      url: rawUrl,
      finalUrl,
      title,
      content: clipped,
      excerpt: clipped.slice(0, 400),
      charCount: text.length,
      truncated: text.length > maxChars,
      fetchedWith: 'playwright',
      requiresLogin: false,
    };
  } catch (err) {
    return toFailure(rawUrl, err);
  } finally {
    await browser.close().catch(() => {});
  }
}

/* ---------------------- نقطة التوسعة المستقبلية ---------------------- */

/**
 * واجهة الإجراءات التفاعلية المخططة للمرحلة الخامسة.
 * غير مفعّلة الآن عمداً: أي إجراء خارجي يحتاج موافقة صريحة من المستخدم
 * عبر نظام الموافقات (lib/approvals.ts) قبل تنفيذه.
 */
export type BrowserAction =
  | { type: 'click'; selector: string }
  | { type: 'navigate'; url: string }
  | { type: 'fill'; selector: string; value: string }
  | { type: 'upload'; selector: string; storageKey: string }
  | { type: 'screenshot' };

export async function performBrowserActions(): Promise<never> {
  throw new Error(
    'الإجراءات التفاعلية داخل المتصفح غير مفعّلة في هذه النسخة. تحتاج موافقة صريحة ونظام جلسات متصفح — مخططة للمرحلة الخامسة.',
  );
}
