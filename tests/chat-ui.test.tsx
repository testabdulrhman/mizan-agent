// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import ChatShell from '@/components/ChatShell';
import ChatMessage from '@/components/ChatMessage';

/* اختبار الواجهة على مقاس الجوال (390px): محادثة واحدة بلا تبويبات وبلا شريط جانبي. */

const user = { id: 'u1', name: 'أحمد', email: 'ahmed@example.com' };

beforeEach(() => {
  window.innerWidth = 390;
  window.innerHeight = 844;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

describe('واجهة المحادثة على الجوال', () => {
  it('تعرض واجهة محادثة واحدة بلا تبويبات وبلا شريط جانبي', () => {
    render(<ChatShell user={user} />);

    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('تعرض مربع كتابة واحداً وزري الإرفاق والإرسال', () => {
    render(<ChatShell user={user} />);

    const boxes = screen.getAllByRole('textbox');
    expect(boxes).toHaveLength(1);
    expect(boxes[0]).toHaveAttribute('placeholder');
    expect(screen.getByLabelText('إرفاق ملف')).toBeInTheDocument();
    expect(screen.getByLabelText('إرسال')).toBeInTheDocument();
  });

  it('تعرض زر محادثة جديدة وسجل المحادثات', () => {
    render(<ChatShell user={user} />);
    expect(screen.getByTitle('محادثة جديدة')).toBeInTheDocument();
    expect(screen.getByLabelText('سجل المحادثات')).toBeInTheDocument();
  });

  it('تعرض بطاقات الاقتراحات وتحذير النسخة التجريبية في البداية', () => {
    render(<ChatShell user={user} />);
    expect(screen.getByText('كيف أساعدك اليوم؟')).toBeInTheDocument();
    expect(screen.getByText(/لخّص صفحة/)).toBeInTheDocument();
    expect(screen.getByText(/لا ترفع معلومات حساسة/)).toBeInTheDocument();
  });

  it('تملأ الاقتراح في مربع الكتابة عند الضغط عليه', async () => {
    const actor = userEvent.setup();
    render(<ChatShell user={user} />);

    await actor.click(screen.getByText('اكتب كوداً'));
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(box.value).toContain('Node.js');
  });

  it('لا يمكن الإرسال والمربع فارغ', () => {
    render(<ChatShell user={user} />);
    expect(screen.getByLabelText('إرسال')).toBeDisabled();
  });
});

describe('عرض رسائل الوكيل', () => {
  const message = {
    id: 'm1',
    role: 'assistant' as const,
    content: [
      '## العنوان',
      '',
      'نص **عريض** مع [رابط](https://example.com).',
      '',
      '```js',
      'console.log("مرحبا");',
      '```',
    ].join('\n'),
    createdAt: new Date().toISOString(),
    metadata: {
      kindLabel: 'مهمة برمجية',
      effects: [{ type: 'source' as const, url: 'https://example.com', title: 'مصدر' }],
      toolLog: [{ name: 'read_public_url', ok: true, summary: 'تمت القراءة' }],
    },
  };

  it('تعرض Markdown مع صندوق كود وزر نسخ', () => {
    render(<ChatMessage message={message} />);

    expect(screen.getByRole('heading', { name: 'العنوان' })).toBeInTheDocument();
    expect(screen.getByText('عريض')).toBeInTheDocument();
    expect(screen.getByText(/console\.log/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نسخ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نسخ الرد' })).toBeInTheDocument();
  });

  it('تعرض المصادر التي قُرئت فعلياً ونوع المهمة', () => {
    render(<ChatMessage message={message} />);
    expect(screen.getByText('مهمة برمجية')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'مصدر' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });

  it('تعرض خطوات التنفيذ عند طلبها', async () => {
    const actor = userEvent.setup();
    render(<ChatMessage message={message} />);

    await actor.click(screen.getByText(/خطوات التنفيذ/));
    expect(screen.getByText('قراءة رابط')).toBeInTheDocument();
    expect(screen.getByText('تمت القراءة')).toBeInTheDocument();
  });

  it('تعرض رسالة المستخدم مع مرفقاتها', () => {
    const userMessage = {
      id: 'm0',
      role: 'user' as const,
      content: 'حلل هذا العقد',
      createdAt: new Date().toISOString(),
      metadata: { attachments: [{ id: 'a1', filename: 'contract.pdf' }] },
    };
    const { container } = render(<ChatMessage message={userMessage} />);
    expect(within(container).getByText('contract.pdf')).toBeInTheDocument();
  });
});
