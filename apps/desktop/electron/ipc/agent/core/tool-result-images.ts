import type { ToolResultImage } from '@/types/ipc';

function looksLikeFilePath(value: string): boolean {
  return value.startsWith('/') || value.startsWith('~/') || /^[A-Za-z]:[\\/]/.test(value);
}

export function extractImageFilePath(details: Record<string, unknown> | null | undefined): string | undefined {
  if (!details) return undefined;
  for (const key of ['savedPath', 'filePath', 'path']) {
    const value = details[key];
    if (typeof value === 'string' && looksLikeFilePath(value)) {
      return value;
    }
  }
  return undefined;
}

export function tryParseImageJson(text: string): ToolResultImage | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed?.type === 'image' && typeof parsed.base64 === 'string') {
      const mimeType = parsed.format ? `image/${parsed.format}` : 'image/png';
      return {
        data: parsed.base64,
        mimeType,
        description: parsed.description ?? parsed.message,
        filePath: typeof parsed.path === 'string' ? parsed.path : typeof parsed.filePath === 'string' ? parsed.filePath : undefined,
      };
    }
  } catch {
    /* not JSON — ignore */
  }
  return null;
}

export function summarizeImageJson(text: string): string | null {
  const parsed = tryParseImageJson(text);
  if (!parsed) return null;
  return parsed.description ?? `[image output omitted: ${parsed.mimeType}]`;
}
