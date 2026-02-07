/**
 * Hook that subscribes to agent events from the main process
 * and dispatches them to the agent store.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useAgentStore, type AgentMessage } from '../../../stores/agent-store';

/**
 * Format a human-readable label for a tool execution start message.
 * Shows the command/path/args so users can see what's happening.
 */
function formatToolLabel(toolName: string, args: Record<string, any> | undefined): string {
  if (!args) return `Running: ${toolName}`;

  switch (toolName) {
    case 'bash': {
      const cmd = args.command ?? '';
      // Truncate very long commands
      const preview = cmd.length > 120 ? cmd.slice(0, 120) + '…' : cmd;
      return `$ ${preview}`;
    }
    case 'read':
      return `Reading: ${args.path ?? 'unknown'}`;
    case 'write':
      return `Writing: ${args.path ?? 'unknown'}`;
    case 'edit':
      return `Editing: ${args.path ?? 'unknown'}`;
    case 'ls':
      return `Listing: ${args.path ?? '/workspace'}`;
    case 'read_terminal':
      return `Reading terminal output`;
    case 'read_skill':
      return `Loading skill: ${args.name ?? 'unknown'}`;
    default:
      return `Running: ${toolName}`;
  }
}

export function useAgentEvents(projectId: string) {
  const {
    getState, addMessage, loadMessages, updateLastAssistantMessage,
    finishLastAssistantMessage, setStatus, clearMessages,
  } = useAgentStore();
  const agentState = getState(projectId);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chatLoaded, setChatLoaded] = useState(false);

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
              data.message?.content
                ?.filter((c: any) => c.type === 'text')
                .map((c: any) => c.text)
                .join('') ?? ''
            );
          }
          break;

        case 'message_end':
          if (data.message?.role === 'assistant') {
            const fullContent = data.message.content
              ?.filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('') ?? '';
            finishLastAssistantMessage(projectId, fullContent);
          }
          break;

        case 'tool_execution_start': {
          setStatus(projectId, 'tool_executing', data.toolName);
          // Include tool arguments in the display for better context
          const toolLabel = formatToolLabel(data.toolName, data.args);
          addMessage(projectId, {
            id: `tool-${data.toolCallId}`,
            role: 'tool',
            content: toolLabel,
            timestamp: Date.now(),
            toolName: data.toolName,
          });
          break;
        }

        case 'tool_execution_end': {
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
        }

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

  // Track the last time we received any agent event (for inactivity timeout)
  const lastEventTimeRef = useRef(Date.now());
  // Update lastEventTime whenever messages change or status changes (i.e., events arrived)
  useEffect(() => {
    if (isSubmitting) {
      lastEventTimeRef.current = Date.now();
    }
  }, [agentState.status, agentState.messages.length, isSubmitting]);

  // Safety timeout — if no new events arrive for 180s while active, assume stuck
  useEffect(() => {
    if (agentState.status === 'idle' || !isSubmitting) return;

    const INACTIVITY_TIMEOUT = 180_000; // 3 minutes of no events
    const CHECK_INTERVAL = 10_000;      // check every 10s

    const interval = setInterval(() => {
      if (!isSubmitting) return;

      const elapsed = Date.now() - lastEventTimeRef.current;
      if (elapsed >= INACTIVITY_TIMEOUT) {
        console.warn(`Agent inactive for ${Math.round(elapsed / 1000)}s — auto-resetting status`);
        addMessage(projectId, {
          id: `timeout-${Date.now()}`,
          role: 'system',
          content: 'Agent response timed out after 3 minutes of inactivity. Try again.',
          timestamp: Date.now(),
          isError: true,
        });
        setIsSubmitting(false);
        setStatus(projectId, 'idle');
      }
    }, CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [agentState.status, isSubmitting, projectId, addMessage, setStatus]);

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

  // Action handlers
  const handleAbort = useCallback(async () => {
    try {
      await window.sero.agent.abort(projectId);
    } catch (err) {
      console.error('Abort failed:', err);
    }
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

  return {
    agentState,
    isSubmitting,
    setIsSubmitting,
    addMessage,
    setStatus,
    finishLastAssistantMessage,
    handleAbort,
    handleClearHistory,
    handleRetry,
  };
}
