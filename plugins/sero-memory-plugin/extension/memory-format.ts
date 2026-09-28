import { format } from 'date-fns';

/**
 * Metadata lines of the managed profile files (IDENTITY.md, USER.md) and of
 * the old MEMORY.md, which the conversion reads.
 */

export const MEMORY_V2_MARKER = '<!-- v2 format: structured memory entries with ids -->';
export const FILE_UPDATED_PREFIX = '<!-- last updated: ';

const STANDALONE_TIMESTAMP_REGEX = /^<!-- \d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)? -->$/;

export function nowTimestamp(): string {
  return format(new Date(), 'yyyy-MM-dd HH:mm:ss');
}

export function isFileMetadataLine(line: string): boolean {
  return line.startsWith(FILE_UPDATED_PREFIX) || line === MEMORY_V2_MARKER;
}

export function stripManagedFileMetadata(content: string): string {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  let index = 0;

  while (index < lines.length && (isFileMetadataLine(lines[index]!) || lines[index]!.trim() === '')) {
    index++;
  }

  return lines.slice(index).join('\n').trim();
}

export function normalizeManagedMarkdown(content: string, title?: string): string {
  const body = stripManagedFileMetadata(content);
  const cleanedLines = body
    .split('\n')
    .filter((line) => !STANDALONE_TIMESTAMP_REGEX.test(line.trim()))
    .join('\n')
    .trim();

  const timestamp = nowTimestamp();
  if (!cleanedLines) return `<!-- last updated: ${timestamp} -->\n`;

  const titleLine = title ? `${title}\n\n` : '';
  return `<!-- last updated: ${timestamp} -->\n${titleLine}${cleanedLines}\n`;
}
