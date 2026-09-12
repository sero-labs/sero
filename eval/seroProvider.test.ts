import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import SeroProvider from './seroProvider';
import { seedFixtureAgentDir, startProviderFixture } from '../apps/desktop/electron/__tests__/agent/fixtures/provider-fixture';
import { FIXTURE_MODEL_ID, PROVIDER_SCENARIOS } from '../apps/desktop/electron/__tests__/agent/fixtures/provider-scenarios';

describe('eval provider extension isolation', () => {
  it.each([undefined, 'runtime'] as const)(
    'reaches the model with a broken profile extension in %s mode',
    async (toolMode) => {
      const agentDir = await mkdtemp(join(tmpdir(), 'sero-eval-profile-'));
      const fixture = await startProviderFixture(PROVIDER_SCENARIOS.plainText);
      try {
        await seedFixtureAgentDir(agentDir, { baseUrl: fixture.url });
        await mkdir(join(agentDir, 'extensions'));
        await writeFile(
          join(agentDir, 'extensions', 'broken.ts'),
          'throw new Error("Profile extensions must not load in evals");',
        );
        const provider = new SeroProvider({
          config: { agentDir, model: FIXTURE_MODEL_ID, toolMode },
        });
        const result = await provider.callApi('Say hello.');
        expect(result.error).toBeUndefined();
        expect(result.output).toBe('Hello from the fixture.');
        expect(fixture.requests).toHaveLength(1);
        // The eval-owned prompt extension must still run.
        expect(JSON.stringify(fixture.requests[0].messages)).toContain('## Sero CLI');
        expect(JSON.stringify(fixture.requests[0].tools)).toContain(
          toolMode === 'runtime' ? 'edits' : 'sero-cli',
        );
      } finally {
        await fixture.close();
        await rm(agentDir, { recursive: true, force: true });
      }
    },
  );
});
