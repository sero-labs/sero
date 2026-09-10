import { describe, expect, it } from 'vitest';
import { resolveTierModel } from '@electron/shared/settings/resolve-tier-model';

describe('provider-qualified worker model selection', () => {
  const available = [{ provider: 'wrong-provider', id: 'shared-name' }, { provider: 'openai-codex', id: 'shared-name' }];
  it('selects the requested provider when IDs overlap and refuses a missing provider', () => {
    expect(resolveTierModel({ prefer: 'openai-codex/shared-name', fallbacks: [] }, {}, available)).toEqual({ provider: 'openai-codex', modelId: 'shared-name' });
    expect(resolveTierModel({ prefer: 'missing/shared-name', fallbacks: [] }, {}, available)).toBeNull();
  });
});
