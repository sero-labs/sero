/**
 * Workspace inference — scores a user message against open workspaces
 * to determine the best match. Extracted from WorkspaceManager.
 */

import type { WorkspaceInfo } from '@/types/ipc';

/**
 * Score a message against a workspace's metadata.
 * Returns a numeric score — higher = better match.
 */
function scoreWorkspace(ws: WorkspaceInfo, messageText: string): number {
  let score = 0;

  // Check name
  if (messageText.includes(ws.name.toLowerCase())) score += 3;

  // Check ID
  if (messageText.includes(ws.id)) score += 2;

  // Check tags
  for (const tag of ws.tags ?? []) {
    if (tag !== 'default' && messageText.includes(tag.toLowerCase())) score += 2;
  }

  // Check context hints
  for (const hint of ws.contextHints ?? []) {
    const words = hint.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      if (messageText.includes(word)) score += 1;
    }
  }

  // Check description
  if (ws.description) {
    const words = ws.description.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    for (const word of words) {
      if (messageText.includes(word)) score += 1;
    }
  }

  return score;
}

/**
 * Infer the best workspace for a given message.
 * Checks keywords against contextHints, tags, and names of open workspaces.
 * Returns workspace ID or 'global' if no match.
 */
export function inferWorkspaceFromMessage(
  message: string,
  openWorkspaces: WorkspaceInfo[],
): string {
  const messageText = message.toLowerCase();

  let bestId = 'global';
  let bestScore = 0;

  for (const ws of openWorkspaces) {
    // Skip global in scoring — it's the default fallback already
    if (ws.id === 'global') continue;

    const score = scoreWorkspace(ws, messageText);
    if (score > bestScore) {
      bestScore = score;
      bestId = ws.id;
    }
  }

  // Only return a match if we have a meaningful score
  return bestScore >= 2 ? bestId : 'global';
}
