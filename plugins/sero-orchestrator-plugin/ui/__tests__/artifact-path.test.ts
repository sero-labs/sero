import { describe, expect, it } from 'vitest';
import { resolveArtifactPath } from '../lib/artifact-path';

const member = { worktreePath: '/workspace/.sero/worktrees/conductor' };

describe('resolveArtifactPath', () => {
  it('resolves relative references from the producer worktree', () => {
    expect(resolveArtifactPath('DECISION.md', member)).toBe('/workspace/.sero/worktrees/conductor/DECISION.md');
  });

  it('keeps stored absolute artifact paths', () => {
    expect(resolveArtifactPath('/workspace/.sero/artifacts/report.md', member)).toBe('/workspace/.sero/artifacts/report.md');
  });
});
