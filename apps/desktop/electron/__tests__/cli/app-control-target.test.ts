import { describe, expect, it } from 'vitest';

import { resolveAppTarget } from '../../cli/commands/apps/app-control-target';

const APPS = [
  { id: 'calc', name: 'Calculator', icon: 'calc', builtin: true, scope: 'global', hasUI: true },
  { id: 'explorer', name: 'Explorer', icon: 'folder', builtin: true, scope: null, hasUI: true },
  { id: 'notes', name: 'Notes', icon: 'notes', builtin: true, scope: 'global', hasUI: true },
] as const;

describe('resolveAppTarget', () => {
  it('matches exact ids', () => {
    expect(resolveAppTarget([...APPS], 'calc')?.id).toBe('calc');
  });

  it('matches visible app names case-insensitively', () => {
    expect(resolveAppTarget([...APPS], 'Calculator')?.id).toBe('calc');
    expect(resolveAppTarget([...APPS], 'calculator app')?.id).toBe('calc');
  });

  it('matches scope-qualified visible names', () => {
    expect(resolveAppTarget([...APPS], 'notes global')?.id).toBe('notes');
  });

  it('returns null for ambiguous or missing queries', () => {
    expect(resolveAppTarget([...APPS], 'unknown')).toBeNull();
  });
});
