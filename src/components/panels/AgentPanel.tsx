import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAgentStore, type AgentMessage } from '../../stores/agent-store';
import './AgentPanel.css';

interface Props {
  projectId: string;
  panelId: string;
}

interface SkillSuggestion {
  name: string;
  description: string;
}

export function AgentPanel({ projectId }: Props) {
  const { getState, addMessage, loadMessages, updateLastAssistantMessage, finishLastAssistantMessage, setStatus, clearMessages } = useAgentStore();
  const agentState = getState(projectId);
  const [input, setInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [chatLoaded, setChatLoaded] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Skill autocomplete state
  const [skillSuggestions, setSkillSuggestions] = useState<SkillSuggestion[]>([]);
  const [showSkillAutocomplete, setShowSkillAutocomplete] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const [allSkills, setAllSkills] = useState<SkillSuggestion[]>([]);

  // Load skills list for autocomplete
  useEffect(() => {
    (async () => {
      try {
        const skills = await window.sero.skills.list(projectId);
        setAllSkills(skills.filter((s) => s.enabled).map((s) => ({ name: s.name, description: s.description })));
      } catch { /* best effort */ }
    })();
  }, [projectId]);

  // Update skill suggestions when input changes
  useEffect(() => {
    const match = input.match(/\/skill:(\S*)$/);
    if (match) {
      const query = match[1].toLowerCase();
      const filtered = query
        ? allSkills.filter((s) => s.name.toLowerCase().includes(query))
        : allSkills;
      setSkillSuggestions(filtered.slice(0, 8));
      setShowSkillAutocomplete(filtered.length > 0);
      setSelectedSuggestionIndex(0);
    } else {
      setShowSkillAutocomplete(false);
    }
  }, [input, allSkills]);

  // Subscribe to agent events from main process
  useEffect(() => {
    const cleanup = window.sero.agent.onEvent((event) => {
      if (event.projectId !== projectId) return;

      const data = event.data as any;

      switch (event.type) {
        case 'agent_start':
          setStatus(projectId, 'thinking');
          break;

        case 'message_start':
          if (data.message?.role === 'assistant') {
            addMessage(projectId, {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: '',
              timestamp: Date.now(),
              isStreaming: true,
            });
          }
          break;

        case 'message_update':
          if (data.assistantMessageEvent?.type === 'text_delta') {
            updateLastAssistantMessage(
              projectId,
              // Build full content from the message
              data.message?.content
                ?.filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('') ?? ''
            );
          }
          break;

        case 'message_end':
          // Mark streaming as done
          if (data.message?.role === 'assistant') {
            const fullContent = data.message.content
              ?.filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('') ?? '';
            finishLastAssistantMessage(projectId, fullContent);
          }
          break;

        case 'tool_execution_start':
          setStatus(projectId, 'tool_executing', data.toolName);
          addMessage(projectId, {
            id: `tool-${data.toolCallId}`,
            role: 'tool',
            content: `Running: ${data.toolName}`,
            timestamp: Date.now(),
            toolName: data.toolName,
          });
          break;

        case 'tool_execution_end':
          // Update the tool message with the result
          const toolContent = data.result?.content
            ?.map((c: any) => c.text)
            .join('\n') ?? '';
          addMessage(projectId, {
            id: `tool-result-${data.toolCallId}`,
            role: 'tool',
            content: toolContent,
            timestamp: Date.now(),
            toolName: data.toolName,
            isError: data.isError,
          });
          break;

        case 'agent_end':
          setStatus(projectId, 'idle');
          setIsSubmitting(false);
          break;

        case 'agent_error':
          addMessage(projectId, {
            id: `error-${Date.now()}`,
            role: 'system',
            content: `Agent error: ${data.message ?? 'Unknown error'}`,
            timestamp: Date.now(),
            isError: true,
          });
          setStatus(projectId, 'idle');
          setIsSubmitting(false);
          break;
      }
    });

    return cleanup;
  }, [projectId, addMessage, updateLastAssistantMessage, setStatus]);

  // Safety timeout — if stuck in thinking/executing for >60s with no new events, reset
  useEffect(() => {
    if (agentState.status === 'idle' || !isSubmitting) return;

    const timeout = setTimeout(() => {
      if (isSubmitting) {
        console.warn('Agent appears stuck — auto-resetting status');
        addMessage(projectId, {
          id: `timeout-${Date.now()}`,
          role: 'system',
          content: 'Agent response timed out. Try again.',
          timestamp: Date.now(),
          isError: true,
        });
        setIsSubmitting(false);
        setStatus(projectId, 'idle');
      }
    }, 90_000); // 90 seconds

    return () => clearTimeout(timeout);
  }, [agentState.status, isSubmitting, agentState.messages.length]);

  // Load persisted chat history on first mount
  useEffect(() => {
    if (chatLoaded) return;
    setChatLoaded(true);
    (async () => {
      try {
        const saved = await window.sero.persistence.loadChatHistory(projectId);
        if (saved && saved.length > 0) {
          loadMessages(projectId, saved);
        }
      } catch (err) {
        console.error('Failed to load chat history:', err);
      }
    })();
  }, [chatLoaded, projectId, loadMessages]);

  // Persist chat after each completed agent turn (status goes back to idle)
  const prevStatusRef = useRef(agentState.status);
  useEffect(() => {
    const wasActive = prevStatusRef.current !== 'idle';
    const nowIdle = agentState.status === 'idle';
    prevStatusRef.current = agentState.status;

    if (wasActive && nowIdle && agentState.messages.length > 0) {
      window.sero.persistence.saveChatHistory(projectId, agentState.messages);
    }
  }, [agentState.status, agentState.messages, projectId]);

  // Also save when user sends a message
  useEffect(() => {
    if (agentState.messages.length > 0) {
      const last = agentState.messages[agentState.messages.length - 1];
      if (last.role === 'user') {
        window.sero.persistence.saveChatHistory(projectId, agentState.messages);
      }
    }
  }, [agentState.messages.length, projectId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentState.messages]);

  const applySkillSuggestion = useCallback((skillName: string) => {
    // Replace the partial /skill:xxx with the full /skill:name
    const newInput = input.replace(/\/skill:\S*$/, `/skill:${skillName} `);
    setInput(newInput);
    setShowSkillAutocomplete(false);
    inputRef.current?.focus();
  }, [input]);

  const handleSubmit = useCallback(async () => {
    const message = input.trim();
    if (!message || isSubmitting) return;

    setInput('');
    setShowSkillAutocomplete(false);
    setIsSubmitting(true);

    // Check for /skill:name command — load the skill content and prepend to prompt
    const skillMatch = message.match(/^\/skill:(\S+)\s*(.*)?$/s);
    let finalMessage = message;

    if (skillMatch) {
      const skillName = skillMatch[1];
      const extraArgs = skillMatch[2]?.trim() ?? '';

      addMessage(projectId, {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      });

      // Load skill content and send it to the agent
      try {
        const skillContent = await window.sero.skills.readContent(skillName);
        if (skillContent) {
          finalMessage = `I'm loading the "${skillName}" skill for you. Follow these instructions:\n\n${skillContent}${extraArgs ? `\n\nUser: ${extraArgs}` : ''}`;
        } else {
          addMessage(projectId, {
            id: `error-${Date.now()}`,
            role: 'system',
            content: `Skill "${skillName}" not found. Use /skill: to see available skills.`,
            timestamp: Date.now(),
            isError: true,
          });
          setIsSubmitting(false);
          return;
        }
      } catch (err) {
        addMessage(projectId, {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Failed to load skill "${skillName}": ${err}`,
          timestamp: Date.now(),
          isError: true,
        });
        setIsSubmitting(false);
        return;
      }
    } else {
      addMessage(projectId, {
        id: `user-${Date.now()}`,
        role: 'user',
        content: message,
        timestamp: Date.now(),
      });
    }

    try {
      await window.sero.agent.prompt(projectId, finalMessage);
    } catch (err) {
      addMessage(projectId, {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `Error: ${err}`,
        timestamp: Date.now(),
        isError: true,
      });
      setIsSubmitting(false);
      setStatus(projectId, 'error');
    }
  }, [input, isSubmitting, projectId, addMessage, setStatus]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Skill autocomplete navigation
      if (showSkillAutocomplete && skillSuggestions.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedSuggestionIndex((i) => Math.min(i + 1, skillSuggestions.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedSuggestionIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
          e.preventDefault();
          applySkillSuggestion(skillSuggestions[selectedSuggestionIndex].name);
          return;
        }
        if (e.key === 'Escape') {
          setShowSkillAutocomplete(false);
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, showSkillAutocomplete, skillSuggestions, selectedSuggestionIndex, applySkillSuggestion]
  );

  const handleAbort = useCallback(async () => {
    try {
      await window.sero.agent.abort(projectId);
    } catch (err) {
      console.error('Abort failed:', err);
    }
    // finishLastAssistantMessage in case one was streaming
    const lastAssistant = [...agentState.messages].reverse().find((m: AgentMessage) => m.role === 'assistant');
    finishLastAssistantMessage(projectId, lastAssistant?.content ?? '');
    setIsSubmitting(false);
    setStatus(projectId, 'idle');
  }, [projectId, setStatus, finishLastAssistantMessage, agentState.messages]);

  const handleClearHistory = useCallback(() => {
    if (isSubmitting) return;
    clearMessages(projectId);
    window.sero.persistence.saveChatHistory(projectId, []);
  }, [projectId, isSubmitting, clearMessages]);

  const handleRetry = useCallback(async () => {
    if (isSubmitting) return;
    // Find last user message
    const lastUserMsg = [...agentState.messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMsg) return;

    setIsSubmitting(true);
    try {
      await window.sero.agent.prompt(projectId, lastUserMsg.content);
    } catch (err) {
      addMessage(projectId, {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `Error: ${err}`,
        timestamp: Date.now(),
        isError: true,
      });
      setIsSubmitting(false);
      setStatus(projectId, 'error');
    }
  }, [isSubmitting, agentState.messages, projectId, addMessage, setStatus]);

  const statusIndicator = () => {
    switch (agentState.status) {
      case 'thinking':
        return <span className="agent-status thinking">Thinking...</span>;
      case 'tool_executing':
        return (
          <span className="agent-status executing">
            Running {agentState.currentToolName}...
          </span>
        );
      case 'error':
        return <span className="agent-status error">Error</span>;
      default:
        return null;
    }
  };

  const hasMessages = agentState.messages.length > 0;
  const hasUserMessage = agentState.messages.some((m) => m.role === 'user');

  return (
    <div className="agent-panel">
      {/* Toolbar */}
      {hasMessages && (
        <div className="agent-toolbar">
          <button
            className="agent-toolbar-btn"
            onClick={handleRetry}
            disabled={isSubmitting || !hasUserMessage}
            title="Retry last message"
          >
            ↻ Retry
          </button>
          <button
            className="agent-toolbar-btn agent-toolbar-btn-danger"
            onClick={handleClearHistory}
            disabled={isSubmitting}
            title="Clear chat history"
          >
            Clear
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="agent-messages">
        {!hasMessages && (
          <div className="agent-empty">
            <p className="agent-empty-title">🤖 Sero Agent</p>
            <p className="agent-empty-hint">
              Ask me to scaffold a project, write code, debug issues, or anything else.
              I execute everything inside your project's sandboxed container.
            </p>
          </div>
        )}

        {agentState.messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* Status */}
      {statusIndicator() && (
        <div className="agent-status-bar">
          {statusIndicator()}
          {isSubmitting && (
            <button className="agent-abort" onClick={handleAbort}>
              Stop
            </button>
          )}
        </div>
      )}

      {/* Input */}
      <div className="agent-input-container">
        {/* Skill autocomplete */}
        {showSkillAutocomplete && (
          <div className="agent-autocomplete">
            {skillSuggestions.map((s, i) => (
              <button
                key={s.name}
                className={`agent-autocomplete-item ${i === selectedSuggestionIndex ? 'selected' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); applySkillSuggestion(s.name); }}
                onMouseEnter={() => setSelectedSuggestionIndex(i)}
              >
                <span className="agent-autocomplete-name">/skill:{s.name}</span>
                <span className="agent-autocomplete-desc">{s.description}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          className="agent-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask Sero anything... (Enter to send, /skill: for skills)"
          rows={1}
          disabled={isSubmitting}
        />
        <button
          className="agent-send"
          onClick={handleSubmit}
          disabled={!input.trim() || isSubmitting}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

/* ── Markdown rendering ────────────────────────────────────── */
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

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

function MessageBubble({ message }: { message: AgentMessage }) {
  const roleLabel: Record<string, string> = {
    user: 'You',
    assistant: 'Sero',
    tool: '⚡',
    system: 'System',
  };

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
