import { z } from 'zod';

/* ==========================================================================
 * validation.ts — مخططات Zod لكل مدخلات الـ API.
 * لا يمر أي جسم طلب إلى المنطق قبل التحقق منه هنا.
 * ========================================================================== */

const id = z.string().min(1).max(64);

export const registerSchema = z.object({
  name: z.string().trim().min(2, 'الاسم قصير جداً').max(80),
  email: z.string().trim().toLowerCase().email('البريد الإلكتروني غير صالح').max(160),
  password: z
    .string()
    .min(8, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل')
    .max(200, 'كلمة المرور طويلة جداً'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('البريد الإلكتروني غير صالح').max(160),
  password: z.string().min(1, 'كلمة المرور مطلوبة').max(200),
});

export const chatRequestSchema = z.object({
  conversationId: id.optional().nullable(),
  message: z.string().trim().min(1, 'الرسالة فارغة').max(20_000, 'الرسالة طويلة جداً'),
  attachmentIds: z.array(id).max(5).optional(),
});

export const webReadSchema = z.object({
  url: z.string().trim().min(4).max(2048),
  question: z.string().trim().max(2000).optional(),
});

export const codeGenerateSchema = z.object({
  conversationId: id,
  prompt: z.string().trim().min(3).max(10_000),
  projectId: id.optional().nullable(),
});

export const codeRunSchema = z.object({
  projectId: id,
  command: z.string().trim().min(1).max(300),
});

export const approvalDecisionSchema = z.object({
  approvalId: id,
  decision: z.enum(['approve', 'reject']),
});

export const documentAnalyzeQuestion = z.string().trim().max(4000).optional();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
