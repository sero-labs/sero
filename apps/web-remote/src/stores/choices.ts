/**
 * Choices store — questions an agent is waiting on.
 *
 * A choice arrives as a `choice_request` push event and leaves as a
 * `choice_resolved` event. The desktop and every other client see the
 * same two events, so whoever answers first dismisses the card everywhere.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import type { GatewayMessage } from '@/lib/gateway-client';

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

export interface PendingChoice {
  id: string;
  workspaceId?: string;
  title: string;
  body: string;
  options: ChoiceOption[];
  /** ISO 8601. When the choice times out, if it does. */
  expiresAt?: string;
  fallbackLabel?: string;
  source?: string;
}

interface ChoicesStore {
  /** Oldest first, so the longest wait is answered first. */
  choices: PendingChoice[];
  /** Ids sent to the gateway and not yet resolved. */
  answering: string[];
  /** Set when the gateway refused the last answer. */
  error: string | null;
  answer: (id: string, optionId: string) => void;
  dismissError: () => void;
  handleMessage: (msg: GatewayMessage) => void;
}

function readChoice(msg: Record<string, unknown>): PendingChoice | null {
  const { id, title, body, options } = msg;
  if (typeof id !== 'string' || typeof title !== 'string') return null;
  if (!Array.isArray(options) || options.length === 0) return null;

  const parsed = options.flatMap((option) => {
    if (!option || typeof option !== 'object') return [];
    const record = option as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.label !== 'string') return [];
    return [{
      id: record.id,
      label: record.label,
      description: typeof record.description === 'string' ? record.description : undefined,
    }];
  });
  if (parsed.length === 0) return null;

  return {
    id,
    workspaceId: typeof msg.workspaceId === 'string' ? msg.workspaceId : undefined,
    title,
    body: typeof body === 'string' ? body : '',
    options: parsed,
    expiresAt: typeof msg.expiresAt === 'string' ? msg.expiresAt : undefined,
    fallbackLabel: typeof msg.fallbackLabel === 'string' ? msg.fallbackLabel : undefined,
    source: typeof msg.source === 'string' ? msg.source : undefined,
  };
}

export const useChoicesStore = create<ChoicesStore>((set, get) => ({
  choices: [],
  answering: [],
  error: null,

  answer: (id: string, optionId: string) => {
    const client = useConnectionStore.getState().client;
    if (!client) return;
    // The card stays until `choice_resolved` confirms it. An answer that
    // loses a race must not look like it won.
    set((s) => ({ answering: [...s.answering, id], error: null }));
    client.answerChoice(id, optionId);
  },

  dismissError: () => set({ error: null }),

  handleMessage: (msg: GatewayMessage) => {
    if (msg.type === 'choice_request') {
      const choice = readChoice(msg as unknown as Record<string, unknown>);
      if (!choice) return;
      set((s) =>
        s.choices.some((existing) => existing.id === choice.id)
          ? s
          : { choices: [...s.choices, choice] },
      );
      return;
    }

    if (msg.type === 'choice_resolved') {
      const id = (msg as unknown as { id?: unknown }).id;
      if (typeof id !== 'string') return;
      set((s) => ({
        choices: s.choices.filter((choice) => choice.id !== id),
        answering: s.answering.filter((pending) => pending !== id),
      }));
      return;
    }

    if (!('requestType' in msg) || msg.requestType !== 'answer_choice') return;

    if (msg.type === 'error') {
      // The gateway refused it. Free the buttons and say why.
      set({ answering: [], error: msg.message });
    }
  },
}));
