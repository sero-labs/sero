/**
 * Formatting helpers used across the admin UI.
 */

/** Format bytes to human-readable string. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Format an ISO timestamp to a short date/time string. */
export function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Parse a session filename into its parts. */
export function parseSessionFilename(filename: string): {
  timestamp: string;
  sessionId: string;
  dateLabel: string;
} {
  // Format: 2026-02-16T11-45-34-801Z_3ca55310-79f6-4d32-bbb1-2746f7e5ea02.jsonl
  const [tsPart, idPart] = filename.replace('.jsonl', '').split('_');
  const isoTimestamp = tsPart
    .replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, '$1T$2:$3:$4.$5Z');

  return {
    timestamp: isoTimestamp,
    sessionId: idPart || filename,
    dateLabel: formatDate(isoTimestamp),
  };
}

/** Truncate text to maxLen with ellipsis. */
export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}

/** Extract a short preview from a session message data object. */
export function extractPreview(data: Record<string, unknown>): string {
  const msg = data.message as Record<string, unknown> | undefined;
  if (!msg) return truncate(JSON.stringify(data), 80);

  const content = msg.content;
  if (typeof content === 'string') return truncate(content, 120);

  if (Array.isArray(content)) {
    for (const block of content) {
      if (block && typeof block === 'object' && 'text' in block) {
        return truncate(String(block.text), 120);
      }
      if (block && typeof block === 'object' && 'name' in block) {
        return `Tool: ${block.name}`;
      }
    }
  }

  const role = msg.role as string | undefined;
  return role ? `[${role}]` : '[message]';
}
