'use client';

import { memo, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import CodeBlock from './CodeBlock';

/* عرض Markdown آمن: بلا HTML خام، مع صناديق أكواد قابلة للنسخ وجداول قابلة للتمرير. */

type NodeLike = {
  children?: NodeLike[];
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
};

function nodeToText(node: NodeLike | undefined): string {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  return (node.children ?? []).map(nodeToText).join('');
}

function extractLanguage(node: NodeLike | undefined): string | undefined {
  const codeChild = node?.children?.find((c) => c.tagName === 'code');
  const className = codeChild?.properties?.className;
  const list = Array.isArray(className) ? (className as string[]) : [];
  const match = list.find((c) => c.startsWith('language-'));
  return match?.replace('language-', '');
}

function Markdown({ content }: { content: string }) {
  return (
    <div className="mizan-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ node, children }) {
            const raw = nodeToText(node as NodeLike).replace(/\n$/, '');
            if (!raw.trim()) return <>{children as ReactNode}</>;
            return <CodeBlock code={raw} language={extractLanguage(node as NodeLike)} />;
          },
          a({ href, children }) {
            return (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {children}
              </a>
            );
          },
          table({ children }) {
            return (
              <div className="mizan-table-wrap">
                <table>{children}</table>
              </div>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export default memo(Markdown);
