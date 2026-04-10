/**
 * Global workspace AGENTS.md injection.
 *
 * Reads the global workspace's AGENTS.md and prepends context when
 * injecting into non-global sessions so the agent resolves relative
 * file references (SOUL.md, MEMORY.md, etc.) against the global
 * workspace path, not the current session's workspace.
 */

import { promises as fs } from 'fs';
import path from 'path';

import { workspaceManager } from '@electron/features/workspace/manager';

export async function readGlobalAgentsMd(
  forWorkspaceId: string,
): Promise<{ path: string; content: string } | null> {
  const globalPath = workspaceManager.getPath('global');
  if (!globalPath) return null;

  const filePath = path.join(globalPath, 'AGENTS.md');
  try {
    let content = await fs.readFile(filePath, 'utf8');

    // When injected into a non-global session, prepend context so the agent
    // resolves relative file references (SOUL.md, MEMORY.md, etc.) against
    // the global workspace, not the current session's workspace.
    if (forWorkspaceId !== 'global') {
      const header =
        `> **Note:** The following instructions come from your global workspace ` +
        `at \`${globalPath}\`. Any file references (SOUL.md, USER.md, MEMORY.md, ` +
        `memory/, etc.) should be read from that directory using their full path, ` +
        `e.g. \`${globalPath}/SOUL.md\`. Do NOT look for these files in the ` +
        `current workspace.\n\n`;
      content = header + content;
    }

    return { path: filePath, content };
  } catch {
    return null;
  }
}
