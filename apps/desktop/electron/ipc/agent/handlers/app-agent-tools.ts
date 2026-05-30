import type { AgentSession } from '@earendil-works/pi-coding-agent';
import type { AppToolContentBlock, AppToolResult } from '@sero-ai/common';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeToolContent(content: unknown): AppToolContentBlock[] {
  if (!Array.isArray(content)) return [];

  return content.flatMap((block): AppToolContentBlock[] => {
    if (!isRecord(block) || typeof block.type !== 'string') return [];

    if (block.type === 'text' && typeof block.text === 'string') {
      return [{ type: 'text', text: block.text }];
    }

    if (block.type === 'image' && typeof block.data === 'string') {
      return [{
        type: 'image',
        data: block.data,
        mimeType: typeof block.mimeType === 'string' ? block.mimeType : 'image/png',
      }];
    }

    return [];
  });
}

function extractToolText(content: AppToolContentBlock[]): string {
  return content
    .filter((block): block is Extract<AppToolContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function normalizeToolDetails(details: unknown): Record<string, unknown> | null {
  return isRecord(details) ? details : null;
}

function isErrorText(text: string): boolean {
  return text.startsWith('Error:') || text.startsWith('ERROR:');
}

function errorToolResult(message: string): AppToolResult {
  const text = message.startsWith('Error:') ? message : `Error: ${message}`;
  return {
    text,
    content: [{ type: 'text', text }],
    details: null,
    isError: true,
  };
}

export async function invokeAppSessionTool(
  session: AgentSession,
  toolName: string,
  params: Record<string, unknown>,
): Promise<AppToolResult> {
  try {
    const tool = session.extensionRunner?.getToolDefinition(toolName);
    if (!tool) {
      return errorToolResult(`App tool not found: ${toolName}`);
    }

    const toolContext = session.extensionRunner?.createContext();
    if (!toolContext) {
      return errorToolResult(`App tool context unavailable: ${toolName}`);
    }

    const result = await tool.execute('app-tool-bridge', params, undefined, undefined, toolContext);
    const content = normalizeToolContent(isRecord(result) ? result.content : undefined);
    const text = extractToolText(content);

    return {
      text,
      content,
      details: normalizeToolDetails(isRecord(result) ? result.details : null),
      isError: isErrorText(text),
    };
  } catch (error) {
    return errorToolResult(error instanceof Error ? error.message : 'Tool invocation failed');
  }
}
