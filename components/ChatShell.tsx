'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Header from './Header';
import ChatMessage from './ChatMessage';
import ChatComposer, { type PendingAttachment } from './ChatComposer';
import SuggestionCards from './SuggestionCards';
import ApprovalCard from './ApprovalCard';
import ProjectPanel from './ProjectPanel';
import ConversationsSheet from './ConversationsSheet';
import type { ApprovalView, ChatMessageView, ProjectView, SessionUserView } from '@/lib/types';

/* ==========================================================================
 * ChatShell — الواجهة الوحيدة للتطبيق: محادثة واحدة، بلا تبويبات وبلا شريط جانبي.
 * ========================================================================== */

const THINKING_STAGES = ['أقرأ طلبك…', 'أحدد نوع المهمة…', 'أشغّل الأدوات المطلوبة…', 'أصيغ الرد…'];

function useThinkingStage(active: boolean) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) {
      setStage(0);
      return;
    }
    const timer = setInterval(() => {
      setStage((s) => Math.min(s + 1, THINKING_STAGES.length - 1));
    }, 2200);
    return () => clearInterval(timer);
  }, [active]);
  return THINKING_STAGES[stage];
}

export default function ChatShell({ user }: { user: SessionUserView }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [projects, setProjects] = useState<ProjectView[]>([]);
  const [approvals, setApprovals] = useState<ApprovalView[]>([]);
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const thinking = useThinkingStage(busy);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, busy]);

  /* ------------------------------ تحميل محادثة ------------------------------ */

  const loadConversation = useCallback(async (id: string) => {
    if (!id) {
      startNewChat();
      return;
    }
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'تعذّر تحميل المحادثة.');

      setConversationId(data.conversation.id);
      setMessages(
        (data.conversation.messages as ChatMessageView[])
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => ({ ...m, createdAt: String(m.createdAt) })),
      );
      setProjects(data.conversation.projects ?? []);
      setApprovals(
        (data.approvals ?? []).map((a: ApprovalView) => ({ ...a, createdAt: String(a.createdAt) })),
      );
      setAttachments([]);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  function startNewChat() {
    setConversationId(null);
    setMessages([]);
    setProjects([]);
    setApprovals([]);
    setAttachments([]);
    setInput('');
    setError(null);
  }

  /* -------------------------------- الإرفاق -------------------------------- */

  async function handleAttach(files: FileList) {
    const list = Array.from(files).slice(0, 3);
    for (const file of list) {
      const localId = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setAttachments((prev) => [
        ...prev,
        {
          localId,
          status: 'uploading',
          view: { id: localId, filename: file.name, mimeType: file.type, size: file.size },
        },
      ]);

      try {
        const form = new FormData();
        form.append('file', file);
        if (conversationId) form.append('conversationId', conversationId);

        const res = await fetch('/api/documents/analyze', { method: 'POST', body: form });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'تعذّر تحليل الملف.');

        // الرفع ينشئ محادثة إن لم تكن موجودة.
        setConversationId((prev) => prev ?? data.conversationId);

        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId
              ? {
                  ...a,
                  status: 'ready',
                  serverId: data.attachment.id,
                  view: { ...a.view, mimeType: data.attachment.mimeType },
                }
              : a,
          ),
        );

        if (data.analysis?.needsOcr) {
          setError(
            `الملف "${file.name}" يبدو ممسوحاً ضوئياً بلا طبقة نصية. يحتاج OCR وهو غير متاح في هذه النسخة.`,
          );
        }
      } catch (err) {
        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === localId ? { ...a, status: 'error', error: (err as Error).message } : a,
          ),
        );
      }
    }
  }

  function removeAttachment(localId: string) {
    setAttachments((prev) => prev.filter((a) => a.localId !== localId));
  }

  /* -------------------------------- الإرسال -------------------------------- */

  async function send() {
    const text = input.trim();
    const ready = attachments.filter((a) => a.status === 'ready' && a.serverId);
    if (!text && !ready.length) return;

    setBusy(true);
    setError(null);

    const optimistic: ChatMessageView = {
      id: `local-${Date.now()}`,
      role: 'user',
      content: text || 'حلّل المرفقات.',
      createdAt: new Date().toISOString(),
      metadata: ready.length
        ? { attachments: ready.map((a) => ({ id: a.serverId!, filename: a.view.filename })) }
        : undefined,
    };
    setMessages((prev) => [...prev, optimistic]);
    setInput('');
    setAttachments([]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          message: optimistic.content,
          attachmentIds: ready.map((a) => a.serverId),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'تعذّر إرسال الرسالة.');

      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev.map((m) => (m.id === optimistic.id ? { ...m, id: data.userMessage.id } : m)),
        { ...data.message, createdAt: String(data.message.createdAt) },
      ]);

      // تحديث المشاريع والموافقات الناتجة عن هذا الرد.
      const effects = data.message.metadata?.effects ?? [];
      if (
        effects.some((e: { type: string }) => e.type === 'project_files' || e.type === 'approval')
      ) {
        await refreshSideState(data.conversationId);
      }
    } catch (err) {
      setError((err as Error).message);
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setInput(text);
    } finally {
      setBusy(false);
    }
  }

  async function refreshSideState(id: string) {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (!res.ok) return;
      setProjects(data.conversation.projects ?? []);
      setApprovals(
        (data.approvals ?? []).map((a: ApprovalView) => ({ ...a, createdAt: String(a.createdAt) })),
      );
    } catch {
      // تحديث ثانوي: تجاهل الفشل بصمت.
    }
  }

  const pendingApprovals = approvals.filter((a) => a.status === 'pending');
  const isEmpty = messages.length === 0 && !busy;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <Header user={user} onNewChat={startNewChat} onOpenHistory={() => setHistoryOpen(true)} />

      <main className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-3 py-4">
          {isEmpty ? (
            <SuggestionCards onPick={(p) => setInput(p)} />
          ) : (
            <div className="space-y-4">
              {messages.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}

              {busy && (
                <div className="flex items-center gap-2 px-1 text-[12.5px] text-ink-muted">
                  <span className="flex gap-1" aria-hidden>
                    <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-400" />
                    <span
                      className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-400"
                      style={{ animationDelay: '150ms' }}
                    />
                    <span
                      className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-brand-400"
                      style={{ animationDelay: '300ms' }}
                    />
                  </span>
                  <span>{thinking}</span>
                </div>
              )}

              {pendingApprovals.map((a) => (
                <ApprovalCard
                  key={a.id}
                  approval={a}
                  onDecided={(id, status) =>
                    setApprovals((prev) =>
                      prev.map((item) => (item.id === id ? { ...item, status } : item)),
                    )
                  }
                />
              ))}

              {projects.map((p) => (
                <ProjectPanel key={p.id} project={p} />
              ))}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-danger-500/30 bg-danger-100 px-3 py-2.5 text-[12.5px] leading-6 text-danger-600"
            >
              {error}
            </p>
          )}

          <div ref={endRef} className="h-2" />
        </div>
      </main>

      <ChatComposer
        value={input}
        onChange={setInput}
        onSubmit={send}
        onAttach={handleAttach}
        onRemoveAttachment={removeAttachment}
        attachments={attachments}
        busy={busy}
      />

      <ConversationsSheet
        open={historyOpen}
        activeId={conversationId}
        onClose={() => setHistoryOpen(false)}
        onSelect={loadConversation}
      />
    </div>
  );
}
