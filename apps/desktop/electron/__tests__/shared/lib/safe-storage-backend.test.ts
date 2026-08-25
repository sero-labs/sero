import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * These cover a security check, so the cases that matter most are the ones
 * where `isEncryptionAvailable()` returns true and the data is still exposed.
 */

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true });
}

async function loadWith(options: {
  platform: NodeJS.Platform;
  available: boolean;
  backend?: string | (() => string);
  /** Omit to leave the opt-in API absent, as on older Electron builds. */
  setPlainText?: (use: boolean) => void;
}) {
  vi.resetModules();
  setPlatform(options.platform);

  const safeStorage: Record<string, unknown> = {
    isEncryptionAvailable: () => options.available,
  };
  if (options.setPlainText !== undefined) {
    safeStorage.setUsePlainTextEncryption = options.setPlainText;
  }
  if (options.backend !== undefined) {
    safeStorage.getSelectedStorageBackend = typeof options.backend === 'function'
      ? options.backend
      : () => options.backend as string;
  }

  vi.doMock('electron', () => ({ safeStorage }));
  return import('@electron/shared/lib/safe-storage-backend');
}

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
  vi.doUnmock('electron');
  vi.resetModules();
});

describe('isUnprotectedBackend', () => {
  it('flags the Linux basic_text backend', async () => {
    const mod = await loadWith({ platform: 'linux', available: true, backend: 'basic_text' });
    expect(mod.isUnprotectedBackend()).toBe(true);
  });

  it('accepts a real Linux keyring', async () => {
    const mod = await loadWith({ platform: 'linux', available: true, backend: 'gnome_libsecret' });
    expect(mod.isUnprotectedBackend()).toBe(false);
  });

  it('never flags macOS or Windows, where the backend getter is absent', async () => {
    const mac = await loadWith({ platform: 'darwin', available: true });
    expect(mac.isUnprotectedBackend()).toBe(false);

    const win = await loadWith({ platform: 'win32', available: true });
    expect(win.isUnprotectedBackend()).toBe(false);
  });

  it('treats a throwing backend getter as protected, so a working keyring is never broken', async () => {
    const mod = await loadWith({
      platform: 'linux',
      available: true,
      backend: () => { throw new Error('not implemented'); },
    });
    expect(mod.isUnprotectedBackend()).toBe(false);
  });
});

describe('hasRealEncryption', () => {
  it('is false under basic_text even though isEncryptionAvailable() is true', async () => {
    const mod = await loadWith({ platform: 'linux', available: true, backend: 'basic_text' });
    // The whole point of the check: Electron says yes, we say no.
    expect(mod.hasRealEncryption()).toBe(false);
  });

  it('is true with a real keyring', async () => {
    const mod = await loadWith({ platform: 'linux', available: true, backend: 'kwallet6' });
    expect(mod.hasRealEncryption()).toBe(true);
  });

  it('is false when encryption is unavailable outright', async () => {
    const mod = await loadWith({ platform: 'linux', available: false, backend: 'basic_text' });
    expect(mod.hasRealEncryption()).toBe(false);
  });
});

describe('describeStorageWeakness', () => {
  it('returns null when protection is real', async () => {
    const mod = await loadWith({ platform: 'darwin', available: true });
    expect(mod.describeStorageWeakness()).toBeNull();
  });

  it('explains the constant key rather than claiming base64', async () => {
    const mod = await loadWith({ platform: 'linux', available: true, backend: 'basic_text' });
    const reason = mod.describeStorageWeakness();
    expect(reason).toContain('constant');
    expect(reason).not.toContain('base64');
  });

  it('reports the unavailable case separately', async () => {
    const mod = await loadWith({ platform: 'linux', available: false });
    expect(mod.describeStorageWeakness()).toContain('unavailable');
  });
});

describe('describeStorageRemedy', () => {
  it('names the Linux fix when the backend is weak', async () => {
    const mod = await loadWith({ platform: 'linux', available: true, backend: 'basic_text' });
    expect(mod.describeStorageRemedy()).toContain('gnome-keyring');
  });

  it('offers nothing when protection is already real', async () => {
    const mod = await loadWith({ platform: 'linux', available: true, backend: 'kwallet6' });
    expect(mod.describeStorageRemedy()).toBeNull();
  });

  it('offers nothing on macOS or Windows, where there is nothing to install', async () => {
    const mac = await loadWith({ platform: 'darwin', available: true });
    expect(mac.describeStorageRemedy()).toBeNull();

    const win = await loadWith({ platform: 'win32', available: true });
    expect(win.describeStorageRemedy()).toBeNull();
  });
});

describe('enablePlainTextFallback', () => {
  it('accepts the weak backend when Linux cannot encrypt at all', async () => {
    const setPlainText = vi.fn();
    const mod = await loadWith({
      platform: 'linux', available: false, backend: 'basic_text', setPlainText,
    });

    expect(mod.enablePlainTextFallback()).toBe(true);
    expect(setPlainText).toHaveBeenCalledWith(true);
  });

  it('never downgrades a working keyring', async () => {
    const setPlainText = vi.fn();
    const mod = await loadWith({
      platform: 'linux', available: true, backend: 'gnome_libsecret', setPlainText,
    });

    expect(mod.enablePlainTextFallback()).toBe(false);
    expect(setPlainText).not.toHaveBeenCalled();
  });

  it('does nothing on macOS or Windows', async () => {
    const setPlainText = vi.fn();
    const mac = await loadWith({ platform: 'darwin', available: false, setPlainText });
    expect(mac.enablePlainTextFallback()).toBe(false);

    const win = await loadWith({ platform: 'win32', available: false, setPlainText });
    expect(win.enablePlainTextFallback()).toBe(false);
    expect(setPlainText).not.toHaveBeenCalled();
  });

  it('reports failure when the opt-in API is absent', async () => {
    const mod = await loadWith({ platform: 'linux', available: false, backend: 'basic_text' });
    expect(mod.enablePlainTextFallback()).toBe(false);
  });

  it('reports failure when the opt-in throws, rather than crashing startup', async () => {
    const mod = await loadWith({
      platform: 'linux',
      available: false,
      backend: 'basic_text',
      setPlainText: () => { throw new Error('nope'); },
    });
    expect(mod.enablePlainTextFallback()).toBe(false);
  });
});
