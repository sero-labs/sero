/**
 * "Insert workspace snapshot" — menu item that packages the current
 * workspace's state into a concise markdown block and prefills the chat
 * composer with it. Useful as the opening message of a new turn: "here's
 * where I am, help me from here".
 *
 * What goes in the snapshot:
 *   - Workspace name + root path
 *   - Currently open editor tabs
 *   - Currently open browser tabs (scoped to workspace)
 *
 * What's intentionally NOT in the snapshot:
 *   - Git diff / status — can be arbitrarily huge and the agent can run
 *     `git status` itself if needed.
 *   - Terminal history — not tracked in a reliable per-workspace store yet.
 */

import { FolderTree } from 'lucide-react';
import { PromptInputActionMenuItem } from '@sero-ai/ui/components/ai-elements/prompt-input-elements';
import { useAgentStore } from '@/stores/agent';
import { useAppStore } from '@/stores/app';
import { useBrowserStore } from '@/stores/browser';
import { useSessionStore } from '@/stores/sessions';
import { useWorkspaceStore } from '@/stores/workspace';

function pad<T>(section: string, lines: T[] | undefined, formatter: (entry: T) => string): string {
  if (!lines || lines.length === 0) return `### ${section}\n_(none)_\n`;
  const body = lines.map((entry) => `- ${formatter(entry)}`).join('\n');
  return `### ${section}\n${body}\n`;
}

async function buildSnapshot(workspaceId: string): Promise<string> {
  const workspace = useWorkspaceStore
    .getState()
    .workspaces.find((w) => w.id === workspaceId);

  const browserTabs = useBrowserStore
    .getState()
    .tabs.filter((t) => t.workspaceId === workspaceId);

  let openEditorTabs: string[] = [];
  let activeEditorTab: string | null = null;
  try {
    const state = await window.sero.editor.loadState(workspaceId);
    if (state) {
      openEditorTabs = state.openTabs ?? [];
      activeEditorTab = state.activeTab ?? null;
    }
  } catch {
    // Editor state is best-effort.
  }

  const header = `## Workspace snapshot — ${workspace?.name ?? workspaceId}`;
  const primaryRoot = workspace?.roots?.[0]?.path;
  const rootLine = primaryRoot ? `\n_Root:_ \`${primaryRoot}\`\n` : '\n';

  const editorSection = pad(
    'Open editor tabs',
    openEditorTabs.map((path) => ({ path, active: path === activeEditorTab })),
    (t) => (t.active ? `**${t.path}** _(active)_` : t.path),
  );

  const browserSection = pad(
    'Open browser tabs',
    browserTabs,
    (t) => `[${t.title || t.url}](${t.url})`,
  );

  return [header, rootLine, editorSection, '', browserSection, '\n'].join('\n');
}

export function WorkspaceSnapshotMenuItem({ disabled }: { disabled?: boolean }) {
  const insert = async () => {
    const workspaceId =
      useWorkspaceStore.getState().activeWorkspaceId ?? 'global';
    const sessionId =
      useAgentStore.getState().focusedSessionId ??
      useSessionStore.getState().activeSessionId;
    if (!sessionId) {
      console.warn('[workspace-snapshot] No chat session to insert into.');
      return;
    }

    const snapshot = await buildSnapshot(workspaceId);
    useAgentStore.getState().setComposerPrefill(sessionId, {
      requestId: `snap_${Date.now().toString(36)}`,
      text: snapshot,
      source: 'system',
    });
    if (!useAppStore.getState().chatPanelOpen) {
      useAppStore.getState().setChatPanelOpen(true);
    }
  };

  return (
    <PromptInputActionMenuItem
      onSelect={(e) => {
        e.preventDefault();
        void insert();
      }}
      disabled={disabled}
    >
      <FolderTree className="size-4" />
      Insert workspace snapshot
    </PromptInputActionMenuItem>
  );
}
