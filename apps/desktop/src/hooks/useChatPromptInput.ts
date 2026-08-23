/**
 * Hook encapsulating slash-command menu, @-file-reference menu,
 * tab-completion, and prompt submission logic for ChatPanel.
 *
 * Extracted to keep ChatPanel under 500 LOC.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useFocusedCommands } from '@/stores/agent-selectors';
import { useWorkspaceFiles, fuzzyMatchFiles } from '@/hooks/useWorkspaceFiles';
import type { SeroSlashCommandInfo, ChatAttachment, ChatComposerPrefill } from '@/types/ipc';
import type { PromptInputMessage } from '@sero-ai/ui/ai-elements/prompt-input';

/** Built-in commands handled client-side (not sent to the agent). */
const BUILTIN_COMMANDS: SeroSlashCommandInfo[] = [
  { name: 'login', description: 'Login with OAuth provider', source: 'extension' },
  { name: 'logout', description: 'Logout from OAuth provider', source: 'extension' },
];

type BuiltinCommandMode = 'login' | 'logout';

function getBuiltinCommandMode(nameOrText: string): BuiltinCommandMode | null {
  if (nameOrText === 'login' || nameOrText === '/login' || nameOrText.startsWith('/login ')) {
    return 'login';
  }
  if (nameOrText === 'logout' || nameOrText === '/logout' || nameOrText.startsWith('/logout ')) {
    return 'logout';
  }
  return null;
}

interface UseChatPromptInputOptions {
  sessionId: string | null;
  isStreaming: boolean;
  focusedWorkspaceId: string | null;
  sendPrompt: (sessionId: string, text: string, attachments?: ChatAttachment[]) => void;
  steerAgent: (sessionId: string, text: string) => void;
  messageQueue: { enqueue: (text: string, attachments?: ChatAttachment[]) => void };
  onLoginRequest: (mode: BuiltinCommandMode) => void;
  externalDraft?: ChatComposerPrefill | null;
  onExternalDraftApplied?: (draft: ChatComposerPrefill) => void;
}

export function useChatPromptInput({
  sessionId,
  isStreaming,
  focusedWorkspaceId,
  sendPrompt,
  steerAgent,
  messageQueue,
  onLoginRequest,
  externalDraft,
  onExternalDraftApplied,
}: UseChatPromptInputOptions) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modifierRef = useRef(false);
  const lastAppliedDraftIdRef = useRef<string | null>(null);
  const commands = useFocusedCommands();
  const { files: workspaceFiles } = useWorkspaceFiles(focusedWorkspaceId);

  useEffect(() => {
    lastAppliedDraftIdRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    if (!externalDraft) return;
    if (lastAppliedDraftIdRef.current === externalDraft.requestId) return;

    lastAppliedDraftIdRef.current = externalDraft.requestId;
    setInput(externalDraft.text);
    onExternalDraftApplied?.(externalDraft);
    requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = externalDraft.text.length;
      textarea.setSelectionRange(end, end);
    });
  }, [externalDraft, onExternalDraftApplied]);

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

  const handleBuiltinCommand = useCallback(
    (nameOrText: string) => {
      const mode = getBuiltinCommandMode(nameOrText);
      if (!mode) return false;
      setInput('');
      onLoginRequest(mode);
      return true;
    },
    [onLoginRequest],
  );

  const handleSlashSelect = useCallback(
    (cmd: SeroSlashCommandInfo) => {
      if (handleBuiltinCommand(cmd.name)) {
        return;
      }
      setInput(`/${cmd.name} `);
    },
    [handleBuiltinCommand],
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

      if (handleBuiltinCommand(text)) {
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

      sendPrompt(sessionId, text, attachments);
    },
    [input, sessionId, slashMenuOpen, fileMenuOpen, isStreaming, sendPrompt, steerAgent, messageQueue, handleBuiltinCommand],
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
