import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPlugin } from '@sero/common';

vi.mock('../../../features/plugins/manager', () => ({
  listInstalledPlugins: vi.fn(),
}));

import { searchPlugins } from '../../../features/plugins/discovery';
import { listInstalledPlugins } from '../../../features/plugins/manager';

const mockListInstalledPlugins = vi.mocked(listInstalledPlugins);

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
  } as Response;
}

function createInstalledPlugin(
  overrides: Partial<InstalledPlugin> = {},
): InstalledPlugin {
  return {
    id: 'todo',
    name: 'Todo',
    description: null,
    version: '1.0.0',
    icon: 'box',
    category: 'utilities',
    tags: [],
    source: 'npm:@acme/sero-todo-plugin',
    installedAt: '2026-03-30T00:00:00.000Z',
    packagePath: '/tmp/todo',
    hasUI: true,
    ...overrides,
  };
}

describe('plugin discovery', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    mockListInstalledPlugins.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('merges npm packages whose repository uses git+https URLs', async () => {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('api.github.com')) {
        return jsonResponse({
          items: [
            {
              full_name: 'acme/sero-todo-plugin',
              name: 'sero-todo-plugin',
              description: 'GitHub description',
              html_url: 'https://github.com/acme/sero-todo-plugin',
              stargazers_count: 42,
              owner: { login: 'acme' },
            },
          ],
        });
      }

      if (url.includes('registry.npmjs.org')) {
        return jsonResponse({
          objects: [
            {
              package: {
                name: '@acme/sero-todo-plugin',
                version: '1.2.3',
                description: 'npm description',
                links: {
                  repository: 'git+https://github.com/acme/sero-todo-plugin.git',
                },
                publisher: { username: 'acme' },
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const results = await searchPlugins('todo');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      npmPackage: '@acme/sero-todo-plugin',
      installSource: 'npm:@acme/sero-todo-plugin',
      githubUrl: 'https://github.com/acme/sero-todo-plugin',
      installed: false,
      installedPluginId: null,
    });
  });

  it('marks versioned npm installs as installed', async () => {
    mockListInstalledPlugins.mockResolvedValue([
      createInstalledPlugin({
        source: 'npm:@acme/sero-todo-plugin@latest',
      }),
    ]);

    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = String(input);

      if (url.includes('api.github.com')) {
        return jsonResponse({ items: [] });
      }

      if (url.includes('registry.npmjs.org')) {
        return jsonResponse({
          objects: [
            {
              package: {
                name: '@acme/sero-todo-plugin',
                version: '1.2.3',
                description: 'npm description',
                publisher: { username: 'acme' },
              },
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const results = await searchPlugins('todo');

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      installSource: 'npm:@acme/sero-todo-plugin',
      installed: true,
      installedPluginId: 'todo',
    });
  });
});
