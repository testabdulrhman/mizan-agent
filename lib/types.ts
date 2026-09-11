/* أنواع مشتركة بين الخادم والواجهة (بلا أي أسرار). */

export type TaskKindName =
  | 'conversation'
  | 'web_research'
  | 'coding'
  | 'document_analysis'
  | 'clarification'
  | 'confirmation_required';

export type ToolLogView = {
  name: string;
  ok: boolean;
  summary: string;
  input?: Record<string, unknown>;
};

export type EffectView =
  | { type: 'project_files'; projectId: string; projectName: string; files: { path: string }[] }
  | { type: 'execution'; executionId: string; status: string }
  | { type: 'approval'; approvalId: string; action: string; summary: string }
  | { type: 'source'; url: string; title: string };

export type MessageMetadata = {
  kind?: TaskKindName;
  kindLabel?: string;
  urls?: string[];
  toolLog?: ToolLogView[];
  effects?: EffectView[];
  provider?: string;
  warning?: string | null;
  attachments?: { id: string; filename: string }[];
};

export type ChatMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  metadata?: MessageMetadata | null;
};

export type ConversationSummary = {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
};

export type ProjectView = {
  id: string;
  name: string;
  description?: string | null;
  files: { path: string; content: string }[];
};

export type ApprovalView = {
  id: string;
  action: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  createdAt: string;
};

export type AttachmentView = {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  persisted?: boolean;
};

export type SessionUserView = { id: string; name: string; email: string };
