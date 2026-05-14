import { describe, expect, it } from 'vitest';
import {
  assertSafeWorkspaceId,
  ensureUniqueId,
  isSafeWorkspaceId,
  slugify,
} from '@electron/features/workspace/utils';

describe('workspace id invariants', () => {
  it('slugify always produces a colon-free kebab-case id', () => {
    expect(slugify('My:Workspace:With:Colons')).toBe('my-workspace-with-colons');
    expect(slugify('  hello world  ')).toBe('hello-world');
    expect(slugify('a/b\\c,d')).toBe('a-b-c-d');
    expect(slugify('')).toBe('workspace');
    expect(isSafeWorkspaceId(slugify('My:Workspace:With:Colons'))).toBe(true);
  });

  it('isSafeWorkspaceId rejects colons, slashes, and uppercase characters', () => {
    expect(isSafeWorkspaceId('hello')).toBe(true);
    expect(isSafeWorkspaceId('hello-2')).toBe(true);
    expect(isSafeWorkspaceId('hello:world')).toBe(false);
    expect(isSafeWorkspaceId('Hello')).toBe(false);
    expect(isSafeWorkspaceId('-leading-dash')).toBe(false);
    expect(isSafeWorkspaceId('')).toBe(false);
    expect(isSafeWorkspaceId(null)).toBe(false);
  });

  it('assertSafeWorkspaceId throws on unsafe ids', () => {
    expect(() => assertSafeWorkspaceId('valid-id')).not.toThrow();
    expect(() => assertSafeWorkspaceId('with:colon')).toThrow(/Invalid workspace id/);
    expect(() => assertSafeWorkspaceId('UPPER')).toThrow(/Invalid workspace id/);
  });

  it('ensureUniqueId rejects unsafe base ids before suffixing', () => {
    expect(() => ensureUniqueId('with:colon', new Set())).toThrow(/Invalid workspace id/);
    expect(ensureUniqueId('valid', new Set(['valid']))).toBe('valid-2');
  });
});
