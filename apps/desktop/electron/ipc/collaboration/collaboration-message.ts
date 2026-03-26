/**
 * Shared helpers for collaboration wrapper prompts.
 */

const COLLAB_INJECTION_RE = /^A multi-agent collaboration team[\s\S]*?<user-query>([\s\S]*?)<\/user-query>/;

/**
 * If the input is a collaboration injection prompt, return the original user query.
 * Otherwise, return the input unchanged.
 */
export function extractOriginalCollaborationQuery(text: string): string {
  const match = text.match(COLLAB_INJECTION_RE);
  return match ? match[1].trim() : text;
}
