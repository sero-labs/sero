/**
 * Message rendering components for the agent chat panel.
 * Includes markdown rendering with syntax-highlighted code blocks.
 */
import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import type { AgentMessage } from '../../../stores/agent-store';

function CodeBlock({ className, children, ...props }: any) {
  const match = /language-(\w+)/.exec(className || '');
  const code = String(children).replace(/\n$/, '');

  if (match) {
    return (
      <div className="agent-code-block">
        <div className="agent-code-header">
          <span className="agent-code-lang">{match[1]}</span>
          <button
            className="agent-code-copy"
            onClick={() => navigator.clipboard.writeText(code)}
          >
            Copy
          </button>
        </div>
        <SyntaxHighlighter
          style={oneDark}
          language={match[1]}
          PreTag="div"
          customStyle={{
            margin: 0,
            borderRadius: '0 0 6px 6px',
            fontSize: '12px',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    );
  }

  return (
    <code className="agent-inline-code" {...props}>
      {children}
    </code>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      remarkPlugins={[remarkGfm]}
      components={{
        code: CodeBlock,
      }}
    >
      {content}
    </Markdown>
  );
}

const roleLabel: Record<string, string> = {
  user: 'You',
  assistant: 'Sero',
  tool: '⚡',
  system: 'System',
};

export function MessageBubble({ message }: { message: AgentMessage }) {
  const isToolMsg = message.role === 'tool';

  return (
    <div className={`agent-msg agent-msg-${message.role} ${message.isError ? 'error' : ''}`}>
      <div className="agent-msg-header">
        <span className="agent-msg-role">{roleLabel[message.role] ?? message.role}</span>
        {message.toolName && (
          <span className="agent-msg-tool">{message.toolName}</span>
        )}
        {message.isStreaming && <span className="agent-msg-streaming">●</span>}
      </div>
      <div className="agent-msg-content">
        {isToolMsg ? (
          <pre className="agent-tool-output">{message.content}</pre>
        ) : message.role === 'assistant' ? (
          <MarkdownContent content={message.content} />
        ) : (
          <p>{message.content}</p>
        )}
      </div>
    </div>
  );
}
