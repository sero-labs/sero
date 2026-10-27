import { expect, it, vi } from 'vitest';
import { prepareReceiptTools } from '../delivery/receipt-tools';

it('resolves each Host observation executable through shared toolchains and preserves container execution', async () => {
  const ensure = vi.fn(async (tool: string) => ({ path: `/shared/${tool}/bin/${tool}` }));
  for (const actualRuntime of ['host', 'container'] as const) {
    ensure.mockClear();
    const resolve = async (workspaceId: string) => ({ workspaceId, workspacePath: '/workspace', desiredRuntime: actualRuntime,
      actualRuntime, containerEnabled: actualRuntime === 'container', capabilityAudit: [] });
    const tools = await prepareReceiptTools('workspace', 'pr', resolve, ensure);
    if (actualRuntime === 'host') {
      expect(tools).toEqual({ node: '/shared/node/bin/node', git: '/shared/git/bin/git', gh: '/shared/gh/bin/gh' });
      expect(ensure.mock.calls.map(([tool]) => tool)).toEqual(['node', 'git', 'gh']);
    } else {
      expect(tools).toEqual({ node: 'node', git: 'git', gh: 'gh' });
      expect(ensure).not.toHaveBeenCalled();
    }
  }
});
