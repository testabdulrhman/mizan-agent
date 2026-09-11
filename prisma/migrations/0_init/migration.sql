-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateEnum
CREATE TYPE "ExecutionStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed', 'timeout', 'rejected');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'expired');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'محادثة جديدة',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT,
    "persisted" BOOLEAN NOT NULL DEFAULT false,
    "textPreview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "runtime" TEXT NOT NULL DEFAULT 'node',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_files" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "executions" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "status" "ExecutionStatus" NOT NULL DEFAULT 'pending',
    "command" TEXT NOT NULL,
    "output" TEXT,
    "error" TEXT,
    "exitCode" INTEGER,
    "durationMs" INTEGER,
    "sandbox" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversationId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "details" JSONB,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "conversations_userId_updatedAt_idx" ON "conversations"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "messages_conversationId_createdAt_idx" ON "messages"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_conversationId_createdAt_idx" ON "attachments"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "projects_userId_updatedAt_idx" ON "projects"("userId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "project_files_projectId_path_key" ON "project_files"("projectId", "path");

-- CreateIndex
CREATE INDEX "executions_projectId_startedAt_idx" ON "executions"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "approvals_userId_createdAt_idx" ON "approvals"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_files" ADD CONSTRAINT "project_files_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "executions" ADD CONSTRAINT "executions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

