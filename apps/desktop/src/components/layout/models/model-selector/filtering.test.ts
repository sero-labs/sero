import { describe, expect, it } from 'vitest';
import type { AvailableModelGroup } from '@/types/ipc';
import { filterGroups } from './filtering';

const groups: AvailableModelGroup[] = [{
  provider: 'openai-codex',
  displayName: 'OpenAI Codex',
  logo: '',
  models: [{ provider: 'openai-codex', modelId: 'gpt-5', name: 'GPT-5', reasoning: true }],
}];

describe('filterGroups', () => {
  it('matches a provider name as well as model names and IDs', () => {
    expect(filterGroups(groups, 'codex')).toEqual(groups);
    expect(filterGroups(groups, 'gpt-5')).toEqual(groups);
    expect(filterGroups(groups, 'missing')).toEqual([]);
  });
});
