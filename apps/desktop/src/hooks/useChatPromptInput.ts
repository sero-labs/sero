/**
 * Hook encapsulating slash-command menu, @-file-reference menu,
 * tab-completion, and prompt submission logic for ChatPanel.
 *
 * Extracted to keep ChatPanel under 500 LOC.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import { useFocusedCommands } from '@/stores/agent-selectors';
import { useWorkspaceFiles, fuzzyMatchFiles } from '@/hooks/useWorkspaceFiles';
import type { SeroSlashCommandInfo, ChatAttachment } from '@/types/ipc';
import type { PromptInputMessage } from '@sero/ui/components/ai-elements/prompt-input';

/** Built-in commands handled client-side (not sent to the agent). */
const BUILTIN_COMMANDS: SeroSlashCommandInfo[] = [
  { name: 'login', description: 'Login with OAuth provider', source: 'extension' },
  { name: 'logout', description: 'Logout from OAuth provider', source: 'extension' },
];

interface UseChatPromptInputOptions {
  sessionId: string | null;
  isStreaming: boolean;
  focusedWorkspaceId: string | null;
  sendPrompt: (sessionId: string, text: string, attachments?: ChatAttachment[]) => void;
  sendCollaborationPrompt: (sessionId: string, text: string) => void;
  collaborationMode: boolean;
  steerAgent: (sessionId: string, text: string) => void;
  messageQueue: { enqueue: (text: string, attachments?: ChatAttachment[]) => void };
  onLoginRequest: (mode: 'login' | 'logout') => void;
}

export function useChatPromptInput({
  sessionId,
  isStreaming,
  focusedWorkspaceId,
  sendPrompt,
  sendCollaborationPrompt,
  collaborationMode,
  steerAgent,
  messageQueue,
  onLoginRequest,
}: UseChatPromptInputOptions) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modifierRef = useRef(false);
  const commands = useFocusedCommands();
  const { files: workspaceFiles } = useWorkspaceFiles(focusedWorkspaceId);

  // ── Slash command menu ──────────────────────────────────────
  const allCommands = useMemo(
    () => [...BUILTIN_COMMANDS, ...commands],
    [commands],
  );

  const slashMenuOpen = useMemo(() => {
    if (!allCommands.length) return false;
    return /^\/[^\s]*$/.test(input);
  }, [input, allCommands]);

  const slashFilter = useMemo(() => {
    if (!slashMenuOpen) return '';
    return input.slice(1);
  }, [input, slashMenuOpen]);

  const handleSlashSelect = useCallback(
    (cmd: SeroSlashCommandInfo) => {
      if (cmd.name === 'login') {
        setInput('');
        onLoginRequest('login');
        return;
      }
      if (cmd.name === 'logout') {
        setInput('');
        onLoginRequest('logout');
        return;
      }
      setInput(`/${cmd.name} `);
    },
    [onLoginRequest],
  );

  const handleSlashClose = useCallback(() => setInput(''), []);

  // ── @ file reference menu ──────────────────────────────────
  const atMatch = useMemo(() => {
    if (slashMenuOpen) return null;
    return input.match(/@([^\s@]*)$/);
  }, [input, slashMenuOpen]);

  const fileMenuOpen = !!atMatch && !!sessionId;
  const fileFilter = atMatch?.[1] ?? '';

  const handleFileSelect = useCallback(
    (filePath: string) => {
      setInput((prev) => prev.replace(/@[^\s@]*$/, `@${filePath} `));
      textareaRef.current?.focus();
    },
    [],
  );

  const handleFileMenuClose = useCallback(() => {
    setInput((prev) => prev.replace(/@[^\s@]*$/, ''));
  }, []);

  // ── Tab path completion + modifier capture ─────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        modifierRef.current = e.ctrlKey || e.metaKey;
      }
      if (e.key === 'Tab' && !e.shiftKey && !slashMenuOpen && !fileMenuOpen) {
        const cursorPos = e.currentTarget.selectionStart ?? input.length;
        const textBefore = input.slice(0, cursorPos);
        const pathMatch = textBefore.match(/@?([^\s@]+)$/);
        if (pathMatch) {
          const partial = pathMatch[1];
          const matches = fuzzyMatchFiles(workspaceFiles, partial, 1);
          if (matches.length > 0) {
            e.preventDefault();
            const completed = matches[0].path;
            const prefix = textBefore.slice(0, textBefore.length - pathMatch[0].length);
            const hasAt = pathMatch[0].startsWith('@');
            const after = input.slice(cursorPos);
            setInput(`${prefix}${hasAt ? '@' : ''}${completed}${after ? '' : ' '}${after}`);
          }
        }
      }
    },
    [input, slashMenuOpen, fileMenuOpen, workspaceFiles],
  );

  // ── Submit ─────────────────────────────────────────────────
  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = (message.text ?? input).trim();
      if ((!text && !message.files?.length) || !sessionId) return;
      if (slashMenuOpen || fileMenuOpen) return;

      if (text === '/login' || text.startsWith('/login ')) {
        setInput('');
        onLoginRequest('login');
        return;
      }
      if (text === '/logout' || text.startsWith('/logout ')) {
        setInput('');
        onLoginRequest('logout');
        return;
      }

      setInput('');

      const attachments: ChatAttachment[] | undefined = message.files?.length
        ? message.files.map((f, i) => ({
            id: `att-${Date.now()}-${i}`,
            filename: f.filename,
            mediaType: f.mediaType,
            url: f.url,
          }))
        : undefined;

      if (isStreaming) {
        const wantsFollowUp = modifierRef.current;
        modifierRef.current = false;
        if (wantsFollowUp) {
          messageQueue.enqueue(text, attachments);
        } else {
          steerAgent(sessionId, text);
        }
        return;
      }

      modifierRef.current = false;

      // Route through 4-agent collaboration framework when enabled
      if (collaborationMode && !attachments?.length) {
        sendCollaborationPrompt(sessionId, text);
      } else {
        sendPrompt(sessionId, text, attachments);
      }
    },
    [input, sessionId, slashMenuOpen, fileMenuOpen, isStreaming, sendPrompt, sendCollaborationPrompt, collaborationMode, steerAgent, messageQueue, onLoginRequest],
  );

  return {
    input,
    setInput,
    textareaRef,
    modifierRef,
    allCommands,
    slashMenuOpen,
    slashFilter,
    handleSlashSelect,
    handleSlashClose,
    fileMenuOpen,
    fileFilter,
    workspaceFiles,
    handleFileSelect,
    handleFileMenuClose,
    handleKeyDown,
    handleSubmit,
  };
}
