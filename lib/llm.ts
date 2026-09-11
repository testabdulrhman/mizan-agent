import { env } from './env';
import { extractUrls } from './security';

/* ==========================================================================
 * llm.ts — طبقة موحّدة فوق مزوّدي النماذج، تعمل على الخادم فقط.
 *
 * المزوّدون: anthropic (افتراضي) | openai | mock
 * mock مزوّد محلي بلا مفتاح، يُستخدم في الاختبارات وفي التجربة السريعة،
 * ويحترم نفس بروتوكول استدعاء الأدوات حتى لا يختلف المسار بين البيئتين.
 *
 * المفاتيح تُقرأ من متغيرات البيئة ولا تُرسل إلى الواجهة إطلاقاً.
 * ========================================================================== */

export type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
};

export type ToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AgentMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string; isError?: boolean };

export type LlmTurn = {
  text: string;
  toolCalls: ToolCall[];
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number };
};

export type LlmRequest = {
  system: string;
  messages: AgentMessage[];
  tools: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
};

export interface LlmProvider {
  readonly name: string;
  complete(request: LlmRequest): Promise<LlmTurn>;
}

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

/* ------------------------------ Anthropic ------------------------------ */

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

function toAnthropicMessages(messages: AgentMessage[]) {
  const out: { role: 'user' | 'assistant'; content: AnthropicBlock[] }[] = [];

  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: [{ type: 'text', text: m.content }] });
      continue;
    }
    if (m.role === 'assistant') {
      const blocks: AnthropicBlock[] = [];
      if (m.content.trim()) blocks.push({ type: 'text', text: m.content });
      for (const call of m.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
      }
      if (blocks.length) out.push({ role: 'assistant', content: blocks });
      continue;
    }
    // نتائج الأدوات تُرسل في رسالة مستخدم حسب بروتوكول Anthropic.
    const block: AnthropicBlock = {
      type: 'tool_result',
      tool_use_id: m.toolCallId,
      content: m.content,
      is_error: m.isError,
    };
    const last = out[out.length - 1];
    if (last?.role === 'user' && last.content.every((b) => b.type === 'tool_result')) {
      last.content.push(block);
    } else {
      out.push({ role: 'user', content: [block] });
    }
  }
  return out;
}

class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';

  async complete(request: LlmRequest): Promise<LlmTurn> {
    const cfg = env();
    if (!cfg.ANTHROPIC_API_KEY) {
      throw new LlmError('مفتاح ANTHROPIC_API_KEY غير مضبوط على الخادم.');
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY });

    try {
      const response = await client.messages.create({
        model: cfg.ANTHROPIC_MODEL,
        max_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.4,
        system: request.system,
        tools: request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as never,
        })),
        messages: toAnthropicMessages(request.messages) as never,
      });

      let text = '';
      const toolCalls: ToolCall[] = [];
      for (const block of response.content) {
        if (block.type === 'text') text += block.text;
        else if (block.type === 'tool_use') {
          toolCalls.push({
            id: block.id,
            name: block.name,
            input: (block.input ?? {}) as Record<string, unknown>,
          });
        }
      }
      return {
        text,
        toolCalls,
        stopReason: response.stop_reason ?? 'end_turn',
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    } catch (err) {
      const e = err as { status?: number; message?: string };
      throw new LlmError(`فشل الاتصال بمزوّد النموذج: ${e.message ?? 'خطأ غير معروف'}`, e.status);
    }
  }
}

/* -------------------------------- OpenAI -------------------------------- */

type OpenAiMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
};

function toOpenAiMessages(system: string, messages: AgentMessage[]): OpenAiMessage[] {
  const out: OpenAiMessage[] = [{ role: 'system', content: system }];
  for (const m of messages) {
    if (m.role === 'user') {
      out.push({ role: 'user', content: m.content });
    } else if (m.role === 'assistant') {
      out.push({
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls?.length
          ? m.toolCalls.map((c) => ({
              id: c.id,
              type: 'function' as const,
              function: { name: c.name, arguments: JSON.stringify(c.input) },
            }))
          : undefined,
      });
    } else {
      out.push({ role: 'tool', tool_call_id: m.toolCallId, content: m.content });
    }
  }
  return out;
}

/** يستخدم fetch مباشرة بدل حزمة openai: تبعية أقل ونفس النتيجة. */
class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';

  async complete(request: LlmRequest): Promise<LlmTurn> {
    const cfg = env();
    if (!cfg.OPENAI_API_KEY) {
      throw new LlmError('مفتاح OPENAI_API_KEY غير مضبوط على الخادم.');
    }

    const res = await fetch(`${cfg.OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: cfg.OPENAI_MODEL,
        max_completion_tokens: request.maxTokens ?? 4096,
        temperature: request.temperature ?? 0.4,
        messages: toOpenAiMessages(request.system, request.messages),
        tools: request.tools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.inputSchema,
          },
        })),
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new LlmError(
        `فشل الاتصال بمزوّد النموذج (${res.status}): ${detail.slice(0, 300)}`,
        res.status,
      );
    }

    const data = (await res.json()) as {
      choices: {
        message: {
          content: string | null;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
        finish_reason: string;
      }[];
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const choice = data.choices?.[0];
    const toolCalls: ToolCall[] = (choice?.message.tool_calls ?? []).map((c) => ({
      id: c.id,
      name: c.function.name,
      input: safeJsonParse(c.function.arguments),
    }));

    return {
      text: choice?.message.content ?? '',
      toolCalls,
      stopReason: choice?.finish_reason ?? 'stop',
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}

function safeJsonParse(s: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/* --------------------------------- Mock --------------------------------- */

/**
 * مزوّد محلي للتجربة والاختبارات: يتبع نفس البروتوكول ويستدعي الأدوات فعلياً
 * عند الحاجة، لكنه لا يولّد لغة طبيعية ذكية. لا يدّعي أبداً نتائج لم تصله.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';

  async complete(request: LlmRequest): Promise<LlmTurn> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === 'user') as
      { role: 'user'; content: string } | undefined;
    const toolResults = request.messages.filter((m) => m.role === 'tool') as Extract<
      AgentMessage,
      { role: 'tool' }
    >[];
    const text = lastUser?.content ?? '';

    // بعد وصول نتائج الأدوات: نلخّصها نصياً بلا اختلاق.
    if (toolResults.length) {
      const lines = toolResults.map((r) => {
        const body = r.content.length > 600 ? `${r.content.slice(0, 600)}…` : r.content;
        return `**نتيجة الأداة \`${r.name}\`${r.isError ? ' (فشل)' : ''}:**\n\n${body}`;
      });
      return {
        text: [
          '> يعمل الوكيل حالياً بمزوّد `mock` بدون نموذج لغوي حقيقي. النص أدناه هو مخرجات الأدوات كما هي.',
          '',
          ...lines,
        ].join('\n'),
        toolCalls: [],
        stopReason: 'end_turn',
      };
    }

    // استدعاء أداة قراءة الروابط عند وجود رابط في الرسالة.
    // نستخدم نفس مستخرج الروابط المستخدم في التوجيه حتى لا يختلف السلوك.
    const [firstUrl] = extractUrls(text);
    if (firstUrl && request.tools.some((t) => t.name === 'read_public_url')) {
      return {
        text: '',
        toolCalls: [{ id: `mock_${Date.now()}`, name: 'read_public_url', input: { url: firstUrl } }],
        stopReason: 'tool_use',
      };
    }

    return {
      text: [
        '> **وضع التجربة (mock):** لم يُضبط مفتاح نموذج على الخادم، لذلك لا يوجد رد ذكي حقيقي.',
        '',
        'لتشغيل الوكيل فعلياً: اضبط `LLM_PROVIDER=anthropic` و `ANTHROPIC_API_KEY` في ملف `.env` ثم أعد تشغيل الخادم.',
        '',
        `رسالتك المستلمة: ${text.slice(0, 300) || '(فارغة)'}`,
      ].join('\n'),
      toolCalls: [],
      stopReason: 'end_turn',
    };
  }
}

/* ------------------------------- الاختيار ------------------------------- */

export function getProvider(): LlmProvider {
  const cfg = env();
  switch (cfg.LLM_PROVIDER) {
    case 'anthropic':
      return cfg.ANTHROPIC_API_KEY ? new AnthropicProvider() : new MockProvider();
    case 'openai':
      return cfg.OPENAI_API_KEY ? new OpenAiProvider() : new MockProvider();
    default:
      return new MockProvider();
  }
}
