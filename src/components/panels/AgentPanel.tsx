import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAgentEvents } from './agent/useAgentEvents';
import { useSkillAutocomplete } from './agent/useSkillAutocomplete';
import { MessageBubble } from './agent/MessageBubble';
import './AgentPanel.css';

interface Props {
  projectId: string;
  panelId: string;
}

export function AgentPanel({ projectId }: Props) {
  const {
    agentState, isSubmitting, setIsSubmitting,
    addMessage, setStatus,
    handleAbort, handleClearHistory, handleRetry,
  } = useAgentEvents(projectId);

  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    skillSuggestions, showSkillAutocomplete,
    selectedSuggestionIndex, setSelectedSuggestionIndex,
    dismiss: dismissAutocomplete,
  } = useSkillAutocomplete(projectId, input);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentState.messages]);

  // Auto-grow textarea up to 5 lines, then scroll
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    // Reset to auto so scrollHeight reflects actual content height
    el.style.height = 'auto';
    // Set to scrollHeight (CSS max-height will clamp at 5 lines)
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const applySkillSuggestion = useCallback((skillName: string) => {
    const newInput = input.replace(/\/skill:\S*$/, `/skill:${skillName} `);
    setInput(newInput);
    dismissAutocomplete();
    inputRef.current?.focus();
  }, [input, dismissAutocomplete]);

  const handleSubmit = useCallback(async () => {
    const message = input.trim();
    if (!message || isSubmitting) return;

    setInput('');
    dismissAutocomplete();
    setIsSubmitting(true);

    // Check for /skill:name command
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
  }, [input, isSubmitting, projectId, addMessage, setStatus, dismissAutocomplete, setIsSubmitting]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
          dismissAutocomplete();
          return;
        }
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, showSkillAutocomplete, skillSuggestions, selectedSuggestionIndex, applySkillSuggestion, dismissAutocomplete]
  );

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
