import path from 'path';

import { describe, expect, it } from 'vitest';

import { createBrowserRuntimeAdapter } from '@electron/features/workspace/runtime/browser-pack/adapter';
import { getBrowserPackManifest } from '@electron/features/workspace/runtime/browser-pack/manifest';
import type { BrowserPackManifest } from '@electron/features/workspace/runtime/browser-pack/types';

const manifest: BrowserPackManifest = {
  version: 'adapter-test',
  artifacts: {
    mac: artifact('darwin', 'arm64', ['chromium/chrome-mac/Chromium.app/Contents/MacOS/Chromium'], ['ffmpeg/ffmpeg-mac-arm64'], ['agent-browser/bin/agent-browser']),
    linux: artifact('linux', 'x64', ['chromium/chrome-linux/chrome'], ['ffmpeg/ffmpeg-linux'], ['agent-browser/bin/agent-browser']),
    windows: artifact('win32', 'x64', ['chromium/chrome-win/chrome.exe'], ['ffmpeg/ffmpeg-win64.exe'], ['agent-browser/bin/agent-browser.cmd']),
  },
};

describe('BrowserRuntimeAdapter', () => {
  it('creates macOS candidates and PLAYWRIGHT_BROWSERS_PATH env', () => {
    const adapter = createBrowserRuntimeAdapter({ manifest, platform: 'darwin', arch: 'arm64', tempRoot: '/tmp/browser' });

    expect(adapter.browsersPath).toContain(path.join('toolchains', 'adapter-test', 'browser'));
    expect(adapter.chromiumExecutableCandidates[0]).toContain(path.join('browser', 'chromium/chrome-mac/Chromium.app/Contents/MacOS/Chromium'));
    expect(adapter.ffmpegCandidates[0]).toContain(path.join('browser', 'ffmpeg/ffmpeg-mac-arm64'));
    expect(adapter.agentBrowserCandidates[0]).toContain(path.join('toolchains', 'adapter-test', 'browser', 'agent-browser/bin/agent-browser'));
    expect(adapter.pathPrefixes[0]).toContain(path.join('browser', 'agent-browser/bin'));
    expect(adapter.pathPrefixes[1]).toContain(path.join('browser', 'ffmpeg'));
    expect(adapter.env.PLAYWRIGHT_BROWSERS_PATH).toBe(adapter.browsersPath);
    expect(adapter.tempDir).toBe('/tmp/browser');
  });

  it('creates Linux browser and ffmpeg candidates', () => {
    const adapter = createBrowserRuntimeAdapter({ manifest, platform: 'linux', arch: 'x64', tempRoot: '/tmp/browser' });

    expect(adapter.chromiumExecutableCandidates[0]).toMatch(/chrome-linux[/\\]chrome$/);
    expect(adapter.ffmpegCandidates[0]).toMatch(/ffmpeg-linux$/);
    expect(adapter.agentBrowserCandidates[0]).toMatch(/agent-browser[/\\]bin[/\\]agent-browser$/);
    expect(adapter.pathPrefixes).toContain(path.dirname(adapter.agentBrowserCandidates[0]));
    expect(adapter.env.SERO_BROWSER_PACK_PATH).toBe(adapter.browsersPath);
  });

  it('maps generated metadata candidates directly under the activated browser root', () => {
    const generatedManifest = getBrowserPackManifest();
    const [artifact] = Object.values(generatedManifest.artifacts);
    const adapter = createBrowserRuntimeAdapter({ manifest: generatedManifest, platform: artifact.platform, arch: artifact.arch, tempRoot: '/tmp/browser' });

    expect(adapter.chromiumExecutableCandidates).toEqual(artifact.chromiumExecutableCandidates.map((candidate) => path.join(adapter.browsersPath, candidate)));
    expect(adapter.ffmpegCandidates).toEqual(artifact.ffmpegCandidates.map((candidate) => path.join(adapter.browsersPath, candidate)));
    expect(adapter.agentBrowserCandidates).toEqual(artifact.agentBrowserCandidates.map((candidate) => path.join(adapter.browsersPath, candidate)));
    expect(adapter.agentBrowserCandidates[0]).toContain(path.join('browser', 'agent-browser/bin/agent-browser'));
    expect(adapter.agentBrowserCandidates[0]).not.toContain(path.join('browser', 'browser', 'agent-browser'));
  });

  it('creates Windows browser and ffmpeg candidates', () => {
    const adapter = createBrowserRuntimeAdapter({ manifest, platform: 'win32', arch: 'x64', tempRoot: 'C:\\Temp\\sero-browser' });

    expect(adapter.chromiumExecutableCandidates[0]).toMatch(/chrome-win[/\\]chrome\.exe$/);
    expect(adapter.ffmpegCandidates[0]).toMatch(/ffmpeg-win64\.exe$/);
    expect(adapter.agentBrowserCandidates[0]).toMatch(/agent-browser[/\\]bin[/\\]agent-browser\.cmd$/);
    expect(adapter.pathPrefixes).toContain(path.dirname(adapter.ffmpegCandidates[0]));
    expect(adapter.env.TEMP).toBe('C:\\Temp\\sero-browser');
    expect(adapter.env.TMP).toBe('C:\\Temp\\sero-browser');
  });
});

function artifact(
  platform: 'darwin' | 'linux' | 'win32',
  arch: 'x64' | 'arm64',
  chromiumExecutableCandidates: string[],
  ffmpegCandidates: string[],
  agentBrowserCandidates: string[],
) {
  return {
    platform,
    arch,
    url: `https://downloads.example.test/${platform}-${arch}.tgz`,
    sha256: '0'.repeat(64),
    unpackTo: 'browser' as const,
    playwrightVersion: '1.52.0',
    chromiumRevision: '1169',
    ffmpegRevision: '1011',
    chromiumExecutableCandidates,
    ffmpegCandidates,
    agentBrowserCandidates,
  };
}
