import type { ImageContent, TextContent } from '@mariozechner/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@mariozechner/pi-coding-agent';

export interface KanbanSessionRuntime {
  sendUserMessage: (
    content: string | (TextContent | ImageContent)[],
    options?: { deliverAs?: 'steer' | 'followUp' },
  ) => void | Promise<void>;
  sendMessage: (
    message: {
      customType: string;
      content: string | (TextContent | ImageContent)[];
      display: boolean;
      details?: unknown;
    },
    options?: { triggerTurn?: boolean; deliverAs?: 'steer' | 'followUp' | 'nextTurn' },
  ) => void | Promise<void>;
}

type RuntimeAwareExtensionContext = ExtensionContext & {
  sessionRuntime?: KanbanSessionRuntime;
};

export function createKanbanSessionRuntime(
  api: Pick<ExtensionAPI, 'sendUserMessage' | 'sendMessage'>,
): KanbanSessionRuntime {
  return {
    sendUserMessage: (content, options) => api.sendUserMessage(content, options),
    sendMessage: (message, options) => api.sendMessage(message, options),
  };
}

export function getKanbanSessionRuntime(
  ctx: ExtensionContext | undefined,
): KanbanSessionRuntime | undefined {
  return (ctx as RuntimeAwareExtensionContext | undefined)?.sessionRuntime;
}
