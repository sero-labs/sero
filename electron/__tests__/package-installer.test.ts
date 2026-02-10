import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track the last constructed mock PM instance so tests can inspect calls
let lastMockPMInstance: any = null;

// Mock the PI SDK before importing PackageInstaller
vi.mock('@mariozechner/pi-coding-agent', () => {
  class MockDefaultPackageManager {
    install = vi.fn().mockResolvedValue(undefined);
    remove = vi.fn().mockResolvedValue(undefined);
    update = vi.fn().mockResolvedValue(undefined);
    resolve = vi.fn().mockResolvedValue({
      extensions: [{ path: '/ext/a', enabled: true, metadata: { source: 'npm:ext-a' } }],
      skills: [{ path: '/skill/b', enabled: true, metadata: { source: 'npm:skill-b' } }],
      prompts: [],
      themes: [{ path: '/theme/c', enabled: false, metadata: { source: 'npm:theme-c' } }],
    });
    addSourceToSettings = vi.fn();
    removeSourceFromSettings = vi.fn();
    setProgressCallback = vi.fn();
    _config: any;

    constructor(config: any) {
      this._config = config;
      lastMockPMInstance = this;
    }
  }

  const mockReload = vi.fn();
  const mockGetGlobalSettings = vi.fn().mockReturnValue({ packages: [] });
  const mockGetProjectSettings = vi.fn().mockReturnValue({ packages: [] });

  const MockSettingsManager = {
    create: vi.fn().mockReturnValue({
      reload: mockReload,
      getGlobalSettings: mockGetGlobalSettings,
      getProjectSettings: mockGetProjectSettings,
    }),
  };

  return {
    DefaultPackageManager: MockDefaultPackageManager,
    SettingsManager: MockSettingsManager,
    getAgentDir: vi.fn().mockReturnValue('/mock/.pi/agent'),
  };
});

import { PackageInstaller } from '../package-installer';
import { DefaultPackageManager, SettingsManager, getAgentDir } from '@mariozechner/pi-coding-agent';

function getMockPM() {
  return lastMockPMInstance;
}

function getMockSettings() {
  return (SettingsManager as any).create.mock.results[0]?.value
    ?? (SettingsManager as any).create();
}

describe('PackageInstaller', () => {
  let installer: PackageInstaller;

  beforeEach(() => {
    vi.clearAllMocks();
    installer = new PackageInstaller('/mock/cwd');
  });

  describe('constructor', () => {
    it('creates a SettingsManager with cwd and agentDir', () => {
      expect(SettingsManager.create).toHaveBeenCalledWith('/mock/cwd', '/mock/.pi/agent');
    });

    it('creates a DefaultPackageManager with correct config', () => {
      const pm = getMockPM();
      expect(pm._config).toEqual({
        cwd: '/mock/cwd',
        agentDir: '/mock/.pi/agent',
        settingsManager: expect.anything(),
      });
    });
  });

  describe('install()', () => {
    it('calls packageManager.install and addSourceToSettings on success', async () => {
      const result = await installer.install('npm:@foo/bar');
      const pm = getMockPM();

      expect(pm.install).toHaveBeenCalledWith('npm:@foo/bar', undefined);
      expect(pm.addSourceToSettings).toHaveBeenCalledWith('npm:@foo/bar', undefined);
      expect(result).toEqual({ success: true });
    });

    it('passes options through to install and addSourceToSettings', async () => {
      await installer.install('npm:@foo/bar', { local: true });
      const pm = getMockPM();

      expect(pm.install).toHaveBeenCalledWith('npm:@foo/bar', { local: true });
      expect(pm.addSourceToSettings).toHaveBeenCalledWith('npm:@foo/bar', { local: true });
    });

    it('returns error on failure without throwing', async () => {
      const pm = getMockPM();
      pm.install.mockRejectedValueOnce(new Error('npm failed'));

      const result = await installer.install('npm:bad-pkg');
      expect(result).toEqual({ success: false, error: 'npm failed' });
    });

    it('invalidates resolve cache after install', async () => {
      // Prime the cache
      await installer.resolve();
      // Install should invalidate
      await installer.install('npm:@foo/bar');
      // Next resolve should call packageManager.resolve again
      const pm = getMockPM();
      const callCount = pm.resolve.mock.calls.length;
      await installer.resolve();
      expect(pm.resolve.mock.calls.length).toBe(callCount + 1);
    });
  });

  describe('remove()', () => {
    it('calls packageManager.remove and removeSourceFromSettings on success', async () => {
      const result = await installer.remove('npm:@foo/bar');
      const pm = getMockPM();

      expect(pm.remove).toHaveBeenCalledWith('npm:@foo/bar', undefined);
      expect(pm.removeSourceFromSettings).toHaveBeenCalledWith('npm:@foo/bar', undefined);
      expect(result).toEqual({ success: true });
    });

    it('returns error on failure', async () => {
      const pm = getMockPM();
      pm.remove.mockRejectedValueOnce(new Error('not found'));

      const result = await installer.remove('npm:missing');
      expect(result).toEqual({ success: false, error: 'not found' });
    });

    it('invalidates resolve cache after remove', async () => {
      await installer.resolve();
      await installer.remove('npm:@foo/bar');
      const pm = getMockPM();
      const callCount = pm.resolve.mock.calls.length;
      await installer.resolve();
      expect(pm.resolve.mock.calls.length).toBe(callCount + 1);
    });
  });

  describe('update()', () => {
    it('calls packageManager.update with no source', async () => {
      const result = await installer.update();
      expect(getMockPM().update).toHaveBeenCalledWith(undefined);
      expect(result).toEqual({ success: true });
    });

    it('calls packageManager.update with specific source', async () => {
      await installer.update('npm:@foo/bar');
      expect(getMockPM().update).toHaveBeenCalledWith('npm:@foo/bar');
    });

    it('returns error on failure', async () => {
      getMockPM().update.mockRejectedValueOnce(new Error('network error'));
      const result = await installer.update();
      expect(result).toEqual({ success: false, error: 'network error' });
    });

    it('invalidates resolve cache after update', async () => {
      await installer.resolve();
      await installer.update();
      const pm = getMockPM();
      const callCount = pm.resolve.mock.calls.length;
      await installer.resolve();
      expect(pm.resolve.mock.calls.length).toBe(callCount + 1);
    });
  });

  describe('list()', () => {
    it('reloads settings and returns empty list when no packages', () => {
      const items = installer.list();
      expect(getMockSettings().reload).toHaveBeenCalled();
      expect(items).toEqual([]);
    });

    it('maps global packages correctly', () => {
      const settings = getMockSettings();
      settings.getGlobalSettings.mockReturnValueOnce({
        packages: ['npm:@foo/bar', { source: 'git:github.com/user/repo' }],
      });
      settings.getProjectSettings.mockReturnValueOnce({ packages: [] });

      const items = installer.list();
      expect(items).toEqual([
        { source: 'npm:@foo/bar', scope: 'global' },
        { source: 'git:github.com/user/repo', scope: 'global' },
      ]);
    });

    it('maps project packages correctly', () => {
      const settings = getMockSettings();
      settings.getGlobalSettings.mockReturnValueOnce({ packages: [] });
      settings.getProjectSettings.mockReturnValueOnce({
        packages: ['npm:@local/pkg'],
      });

      const items = installer.list();
      expect(items).toEqual([
        { source: 'npm:@local/pkg', scope: 'project' },
      ]);
    });

    it('combines global and project packages', () => {
      const settings = getMockSettings();
      settings.getGlobalSettings.mockReturnValueOnce({
        packages: ['npm:@global/a'],
      });
      settings.getProjectSettings.mockReturnValueOnce({
        packages: ['npm:@local/b'],
      });

      const items = installer.list();
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({ source: 'npm:@global/a', scope: 'global' });
      expect(items[1]).toEqual({ source: 'npm:@local/b', scope: 'project' });
    });
  });

  describe('resolve()', () => {
    it('returns resolved paths from packageManager', async () => {
      const resolved = await installer.resolve();
      expect(resolved.extensions).toHaveLength(1);
      expect(resolved.skills).toHaveLength(1);
      expect(resolved.themes).toHaveLength(1);
    });

    it('caches results on second call', async () => {
      await installer.resolve();
      await installer.resolve();
      expect(getMockPM().resolve).toHaveBeenCalledTimes(1);
    });

    it('re-resolves after invalidateCache()', async () => {
      await installer.resolve();
      installer.invalidateCache();
      await installer.resolve();
      expect(getMockPM().resolve).toHaveBeenCalledTimes(2);
    });
  });

  describe('getResolvedSkillPaths()', () => {
    it('returns only enabled skill paths', async () => {
      const paths = await installer.getResolvedSkillPaths();
      expect(paths).toEqual(['/skill/b']);
    });
  });

  describe('getResolvedExtensionPaths()', () => {
    it('returns only enabled extension paths', async () => {
      const paths = await installer.getResolvedExtensionPaths();
      expect(paths).toEqual(['/ext/a']);
    });
  });

  describe('getResolvedThemePaths()', () => {
    it('filters out disabled themes', async () => {
      const paths = await installer.getResolvedThemePaths();
      expect(paths).toEqual([]);
    });
  });

  describe('invalidateCache()', () => {
    it('causes next resolve() to call packageManager.resolve', async () => {
      await installer.resolve();
      installer.invalidateCache();
      await installer.resolve();
      expect(getMockPM().resolve).toHaveBeenCalledTimes(2);
    });
  });

  describe('onProgress()', () => {
    it('passes callback to packageManager.setProgressCallback', () => {
      const cb = vi.fn();
      installer.onProgress(cb);
      expect(getMockPM().setProgressCallback).toHaveBeenCalledWith(cb);
    });
  });

  describe('getAgentDir()', () => {
    it('returns the agent directory', () => {
      expect(installer.getAgentDir()).toBe('/mock/.pi/agent');
    });
  });

  describe('getSettingsManager()', () => {
    it('returns the settings manager instance', () => {
      const sm = installer.getSettingsManager();
      expect(sm).toBeDefined();
      expect(sm.reload).toBeDefined();
    });
  });
});
