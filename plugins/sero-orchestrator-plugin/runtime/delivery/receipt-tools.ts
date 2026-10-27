import type { AppRuntimeToolchainsApi, AppRuntimeWorkspaceApi } from '@sero-ai/common';

export interface ReceiptTools { node: string; git: string; gh: string }

/** Host installs are shared and system-first; containers own their pinned tools. */
export async function prepareReceiptTools(
  workspaceId: string,
  destination: 'pr' | 'saved-artifact',
  resolveRuntime: AppRuntimeWorkspaceApi['resolveRuntime'],
  ensure: AppRuntimeToolchainsApi['ensure'],
): Promise<ReceiptTools> {
  const runtime = await resolveRuntime(workspaceId);
  if (runtime.actualRuntime !== 'host') return { node: 'node', git: 'git', gh: 'gh' };
  const node = (await ensure('node')).path;
  if (destination === 'saved-artifact') return { node, git: 'git', gh: 'gh' };
  const [git, gh] = await Promise.all([ensure('git'), ensure('gh')]);
  return { node, git: git.path, gh: gh.path };
}
