import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  buildQuery,
  canonicalRoot,
  isIndexableRoot,
  normalizeExcludes,
  normalizePathConstraint,
  PathOutsideWorkspaceError,
} from '../path-policy';

const ROOT = path.resolve('/workspace/repo');

describe('normalizePathConstraint', () => {
  it('drops constraints that mean the whole workspace', () => {
    expect(normalizePathConstraint('.', ROOT)).toBeNull();
    expect(normalizePathConstraint('./', ROOT)).toBeNull();
    expect(normalizePathConstraint('**', ROOT)).toBeNull();
    expect(normalizePathConstraint('**/*', ROOT)).toBeNull();
    expect(normalizePathConstraint('   ', ROOT)).toBeNull();
    expect(normalizePathConstraint(ROOT, ROOT)).toBeNull();
  });

  it('turns a bare directory into the prefix form the parser expects', () => {
    expect(normalizePathConstraint('src', ROOT)).toBe('src/');
    expect(normalizePathConstraint('src/features', ROOT)).toBe('src/features/');
    expect(normalizePathConstraint('./src', ROOT)).toBe('src/');
  });

  it('keeps filenames and globs as written', () => {
    expect(normalizePathConstraint('main.ts', ROOT)).toBe('main.ts');
    expect(normalizePathConstraint('src/**/*.ts', ROOT)).toBe('src/**/*.ts');
    expect(normalizePathConstraint('{src,lib}/**/*.ts', ROOT)).toBe('{src,lib}/**/*.ts');
  });

  it('collapses a trailing recursive glob on a hidden directory to a prefix', () => {
    expect(normalizePathConstraint('.agents/**', ROOT)).toBe('.agents/');
    expect(normalizePathConstraint('.agents/**/*', ROOT)).toBe('.agents/');
  });

  it('rebases an absolute path that is inside the workspace', () => {
    expect(normalizePathConstraint(path.join(ROOT, 'src/app.ts'), ROOT)).toBe('src/app.ts');
    expect(normalizePathConstraint(path.join(ROOT, 'src'), ROOT)).toBe('src/');
  });

  it('rejects an absolute path outside the workspace', () => {
    expect(() => normalizePathConstraint('/etc/passwd', ROOT)).toThrow(PathOutsideWorkspaceError);
    expect(() => normalizePathConstraint(path.resolve('/workspace/other'), ROOT))
      .toThrow(PathOutsideWorkspaceError);
  });

  it('rejects home-relative paths', () => {
    expect(() => normalizePathConstraint('~', ROOT)).toThrow(PathOutsideWorkspaceError);
    expect(() => normalizePathConstraint('~/projects', ROOT)).toThrow(PathOutsideWorkspaceError);
  });

  it('rejects relative traversal that leaves the workspace', () => {
    expect(() => normalizePathConstraint('..', ROOT)).toThrow(PathOutsideWorkspaceError);
    expect(() => normalizePathConstraint('../other-project', ROOT)).toThrow(PathOutsideWorkspaceError);
    expect(() => normalizePathConstraint('src/../../etc', ROOT)).toThrow(PathOutsideWorkspaceError);
  });

  it('allows traversal that stays inside the workspace', () => {
    expect(normalizePathConstraint('src/../lib', ROOT)).toBe('src/../lib/');
  });

  it('names the workspace root and the bash fallback in the rejection', () => {
    expect(() => normalizePathConstraint('/etc', ROOT)).toThrow(/outside this session's workspace root/);
    expect(() => normalizePathConstraint('/etc', ROOT)).toThrow(/rg/);
  });
});

describe('normalizeExcludes', () => {
  it('splits comma and space separated lists into negated constraints', () => {
    expect(normalizeExcludes('test/, *.min.js', ROOT)).toEqual(['!test/', '!*.min.js']);
  });

  it('accepts an array and tolerates an already-negated entry', () => {
    expect(normalizeExcludes(['!vendor/', 'dist'], ROOT)).toEqual(['!vendor/', '!dist/']);
  });

  it('rejects an exclusion that escapes the workspace', () => {
    expect(() => normalizeExcludes('../secrets/', ROOT)).toThrow(PathOutsideWorkspaceError);
  });

  it('returns nothing for an empty exclusion', () => {
    expect(normalizeExcludes(undefined, ROOT)).toEqual([]);
    expect(normalizeExcludes('  ', ROOT)).toEqual([]);
  });
});

describe('buildQuery', () => {
  it('orders the query as path, exclusions, then pattern', () => {
    expect(buildQuery('src', 'useState', 'test/', ROOT)).toBe('src/ !test/ useState');
  });

  it('omits a path constraint that means the whole workspace', () => {
    expect(buildQuery('.', 'useState', undefined, ROOT)).toBe('useState');
  });

  it('returns the bare pattern when nothing constrains it', () => {
    expect(buildQuery(undefined, 'useState', undefined, ROOT)).toBe('useState');
  });
});

describe('isIndexableRoot', () => {
  const env = { SERO_HOME: '/profile/.sero-ui' } as NodeJS.ProcessEnv;

  it('accepts an ordinary workspace or worktree root', () => {
    expect(isIndexableRoot('/workspace/repo', env)).toBe(true);
    expect(isIndexableRoot('/workspace/repo/.worktrees/feature', env)).toBe(true);
  });

  it('refuses the filesystem root and the home directory', () => {
    expect(isIndexableRoot(path.parse(process.cwd()).root, env)).toBe(false);
    expect(isIndexableRoot(os.homedir(), env)).toBe(false);
  });

  it('refuses the agent directory, where internal sessions run', () => {
    expect(isIndexableRoot('/profile/.sero-ui/agent', env)).toBe(false);
    expect(isIndexableRoot('/profile/.sero-ui/agent/sessions', env)).toBe(false);
  });

  it('does not confuse a sibling of the agent directory for it', () => {
    expect(isIndexableRoot('/profile/.sero-ui/agent-notes', env)).toBe(true);
  });
});

describe('canonicalRoot', () => {
  it('resolves a real directory through its symlinks', () => {
    expect(canonicalRoot(process.cwd())).toBe(fs.realpathSync.native(process.cwd()));
  });

  it('falls back to the lexical path for a worktree that has gone away', () => {
    const missing = path.join(process.cwd(), 'deleted-worktree-that-never-existed');
    expect(canonicalRoot(missing)).toBe(missing);
  });
});
