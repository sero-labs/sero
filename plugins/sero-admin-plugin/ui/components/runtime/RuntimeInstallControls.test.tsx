import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { BrowserPackStatusIPC, ToolchainProgressIPC, ToolchainStatusIPC } from '../../hooks/host';
import { InstallDetail } from './RuntimeInstallControls';

const readyBrowserStatus: BrowserPackStatusIPC = {
  state: 'ready',
  manifestVersion: 'browser-pack-2026-08-24-r1234-f1011-mf1011-agent-0.27.3',
};

describe('runtime install details', () => {
  it('shows update versions instead of the required-pack error', () => {
    const browserStatus: BrowserPackStatusIPC = {
      state: 'installable',
      manifestVersion: 'browser-pack-2026-08-24-r1234-f1011-mf1011-agent-0.27.3',
      previousManifestVersion: 'browser-pack-2026-08-23-r1233-f1011-mf1011-agent-0.27.2',
      error: {
        code: 'BROWSER_PACK_REQUIRED',
        message: 'Host browser automation pack is not installed.',
        retryable: true,
        installable: true,
      },
    };

    const html = renderToStaticMarkup(
      <InstallDetail
        coreStatus={null}
        browserStatus={browserStatus}
        error={null}
      />,
    );

    expect(html).toContain('Update available from');
    expect(html).not.toContain('Host browser automation pack is not installed.');
  });

  it('shows core install progress when the browser pack is ready', () => {
    const coreStatus: ToolchainStatusIPC = {
      state: 'installing',
      tools: [],
    };
    const coreProgress: ToolchainProgressIPC = {
      tool: 'node',
      phase: 'downloading',
      artifactKey: 'node-darwin-arm64',
      manifestVersion: 'toolchain-2026-08-24',
    };

    const html = renderToStaticMarkup(
      <InstallDetail
        coreStatus={coreStatus}
        browserStatus={readyBrowserStatus}
        coreProgress={coreProgress}
        error={null}
      />,
    );

    expect(html).toContain('Install progress: downloading');
    expect(html).not.toContain('is installed.');
  });
});
