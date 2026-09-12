/** Content-block helpers for the `tool_result` hook. */

export interface TextBlock {
  type: 'text';
  text: string;
}

export function textBlock(text: string): TextBlock {
  return { type: 'text', text };
}

/** Keep only the text blocks of a result; bash results carry no images. */
export function textBlocks(content: readonly { type: string }[]): TextBlock[] {
  return content.filter((item): item is TextBlock => item.type === 'text');
}

export function readPayloadIndex(details: unknown): number {
  if (typeof details === 'object' && details !== null) {
    const blocks = (details as Record<string, unknown>).blocks;
    if (typeof blocks === 'object' && blocks !== null) {
      const payload = (blocks as Record<string, unknown>).payload;
      if (typeof payload === 'number' && Number.isInteger(payload) && payload >= 0) return payload;
    }
  }
  return 0;
}

/** The index of the bash tool's capture report block, when it added one. */
export function readReportIndex(details: unknown): number | undefined {
  if (typeof details !== 'object' || details === null) return undefined;
  const blocks = (details as Record<string, unknown>).blocks;
  if (typeof blocks !== 'object' || blocks === null) return undefined;
  const report = (blocks as Record<string, unknown>).report;
  return typeof report === 'number' && Number.isInteger(report) && report >= 0 ? report : undefined;
}

/** Drop one block by index. An unknown index leaves the content unchanged. */
export function removeBlock(content: readonly TextBlock[], index: number | undefined): TextBlock[] {
  if (index === undefined || index < 0 || index >= content.length) return [...content];
  return content.filter((_block, position) => position !== index);
}

export function replaceBlock(content: readonly TextBlock[], index: number, text: string): TextBlock[] {
  const next = [...content];
  if (index < 0 || index >= next.length) {
    next.push(textBlock(text));
    return next;
  }
  next[index] = textBlock(text);
  return next;
}

export function appendBlocks(content: readonly TextBlock[], texts: readonly string[]): TextBlock[] {
  return [...content, ...texts.map(textBlock)];
}
