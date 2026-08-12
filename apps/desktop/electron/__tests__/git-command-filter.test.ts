import { describe, expect, it } from 'vitest';
import { hasMutatingGit } from '@electron/platform/security/git-command-filter';

describe('hasMutatingGit', () => {
  it('allows read-only subcommands', () => {
    for (const command of [
      'git status --short',
      'git log --oneline --decorate -10',
      'git diff HEAD~1',
      'git show HEAD',
      'git remote -v',
      'git branch --list',
    ]) {
      expect(hasMutatingGit(command), command).toBe(false);
    }
  });

  it('blocks commands that change the repository', () => {
    for (const command of [
      'git add .',
      'git commit -m "x"',
      'git push origin main',
      'git checkout -b feature',
      'git reset --hard',
      'git clean -fd',
    ]) {
      expect(hasMutatingGit(command), command).toBe(true);
    }
  });

  // Listing tags is how an agent finds the latest release. Blocking it made
  // every release-report build fail on camera.
  it('allows tag listing', () => {
    for (const command of [
      'git tag',
      'git tag --list',
      'git tag -l "v*"',
      'git tag --list --sort=-creatordate',
      'git tag --sort=-creatordate',
      'git tag -n5',
      'git tag --points-at HEAD',
      'git tag --format=%(refname:short)',
      'git status --short && git log --oneline -5 && git tag --list',
    ]) {
      expect(hasMutatingGit(command), command).toBe(false);
    }
  });

  it('still blocks tag writes', () => {
    for (const command of [
      'git tag v1.0.0',
      'git tag -a v1.0.0 -m "release"',
      'git tag -d v1.0.0',
      'git tag --delete v1.0.0',
      'git tag -f v1.0.0 HEAD',
      'git tag -s v1.0.0',
      'git log --oneline && git tag v2.0.0',
    ]) {
      expect(hasMutatingGit(command), command).toBe(true);
    }
  });

  it('treats git inside a subshell or eval as mutating', () => {
    expect(hasMutatingGit('echo $(git tag --list)')).toBe(true);
    expect(hasMutatingGit('sh -c "git tag --list"')).toBe(true);
  });
});
