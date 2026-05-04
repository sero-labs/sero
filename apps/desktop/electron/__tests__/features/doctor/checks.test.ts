import { afterEach, describe, expect, it } from 'vitest';
import {
  __resetRegistryForTests,
  listChecks,
} from '@electron/features/doctor/engine/registry';
import { registerProviderChecks } from '@electron/features/doctor/engine/checks/providers';
import { validateRegistrySchema } from '@electron/features/doctor/engine/checks/profile-registry';

afterEach(() => {
  __resetRegistryForTests();
});

describe('doctor built-in checks', () => {
  it('keeps provider usability available in safe mode', () => {
    registerProviderChecks();
    const ids = listChecks({ category: 'providers', safe: true }).map((c) => c.id);
    expect(ids).toContain('providers.any-usable');
  });

  it('validates profiles.json with the same required entry fields as startup', () => {
    expect(
      validateRegistrySchema({
        version: 1,
        activeProfileId: 'default',
        profiles: [{ id: 'default', name: 'Default', path: '/tmp/sero' }],
      }),
    ).toMatch(/valid profile entries/);

    expect(
      validateRegistrySchema({
        version: 2,
        activeProfileId: 'default',
        profiles: [
          {
            id: 'default',
            name: 'Default',
            path: '/tmp/sero',
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    ).toMatch(/unsupported version/);
  });
});
