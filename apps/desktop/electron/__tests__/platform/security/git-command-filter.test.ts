import { describe, expect, it } from 'vitest';
import { hasMutatingGit, isLikelyReadOnlyBash } from '@electron/platform/security/git-command-filter';

describe('hasMutatingGit', () => {
  describe('global options before the subcommand', () => {
    it('classifies a read-only subcommand by the subcommand, not the option', () => {
      expect(hasMutatingGit('git --no-pager diff')).toBe(false);
      expect(hasMutatingGit('git -P diff')).toBe(false);
      expect(hasMutatingGit('git -C /repo status')).toBe(false);
      expect(hasMutatingGit('git --no-pager -C /repo log --oneline')).toBe(false);
      expect(hasMutatingGit('git --git-dir=/repo/.git status')).toBe(false);
      expect(hasMutatingGit('git --git-dir /repo/.git status')).toBe(false);
      expect(hasMutatingGit('git --work-tree /repo status')).toBe(false);
    });

    it('keeps reporting mutating subcommands that carry a global option', () => {
      expect(hasMutatingGit('git --no-pager commit -m "x"')).toBe(true);
      expect(hasMutatingGit('git -C /repo switch -c other')).toBe(true);
    });

    it('does not trust a read-only subcommand behind a config override', () => {
      expect(hasMutatingGit('git -c core.pager=cat status')).toBe(true);
      expect(hasMutatingGit('git -c diff.external=/bin/sh diff')).toBe(true);
      expect(hasMutatingGit('git --exec-path=/tmp/bin status')).toBe(true);
    });

    it('passes the piped command from the report', () => {
      const command = 'pnpm test 2>&1 | tail -30 && echo "=== git diff ===" && git --no-pager diff';
      expect(hasMutatingGit(command)).toBe(false);
    });
  });

  describe('executable paths', () => {
    it('classifies an absolute-path git invocation', () => {
      expect(hasMutatingGit('/usr/bin/git switch -c other')).toBe(true);
      expect(hasMutatingGit('/usr/bin/git status')).toBe(false);
      expect(hasMutatingGit('sudo /usr/bin/git push')).toBe(true);
    });

    it('classifies git written right after a subshell, group or backslash', () => {
      expect(hasMutatingGit('(git push origin main)')).toBe(true);
      expect(hasMutatingGit('cd repo && (git reset --hard)')).toBe(true);
      expect(hasMutatingGit('\\git push origin main')).toBe(true);
    });
  });

  describe('arguments that only contain git', () => {
    it('does not treat a quoted git search term as a git command', () => {
      expect(hasMutatingGit('rg -n "git" apps/')).toBe(false);
      expect(hasMutatingGit("grep -rn 'git' src/ && pnpm test")).toBe(false);
    });

    it('does not treat a directory named git as a git command', () => {
      expect(hasMutatingGit('grep -r retry apps/desktop/electron/features/git src/')).toBe(false);
      expect(hasMutatingGit('cat docs/git notes.md')).toBe(false);
    });
  });

  describe('subcommand classification', () => {
    it('detects mutating commands anywhere in a command line', () => {
      expect(hasMutatingGit('git push')).toBe(true);
      expect(hasMutatingGit('ls && git commit -m "x"')).toBe(true);
      expect(hasMutatingGit('xargs git push')).toBe(true);
    });

    it('allows read-only commands', () => {
      expect(hasMutatingGit('git status')).toBe(false);
      expect(hasMutatingGit('git log --oneline -5')).toBe(false);
      expect(hasMutatingGit('git --version')).toBe(false);
    });

    it('inspects the flags of context-dependent commands', () => {
      expect(hasMutatingGit('git remote -v')).toBe(false);
      expect(hasMutatingGit('git remote add origin https://example.com/repo.git')).toBe(true);
      expect(hasMutatingGit('git branch -a')).toBe(false);
      expect(hasMutatingGit('git branch -D feature')).toBe(true);
      expect(hasMutatingGit('git config user.name')).toBe(false);
      expect(hasMutatingGit('git config user.name "Ada"')).toBe(true);
      expect(hasMutatingGit('git config --unset user.name')).toBe(true);
    });

    it('keeps blocking nested git through a subshell or shell wrapper', () => {
      expect(hasMutatingGit('bash -c "git push"')).toBe(true);
      expect(hasMutatingGit('echo $(git push)')).toBe(true);
    });
  });
});

describe('isLikelyReadOnlyBash', () => {
  it('treats read-only git commands as non-mutating', () => {
    expect(isLikelyReadOnlyBash('git --no-pager diff')).toBe(true);
    expect(isLikelyReadOnlyBash('git -C /repo status')).toBe(true);
    expect(isLikelyReadOnlyBash('/usr/bin/git status')).toBe(true);
    expect(isLikelyReadOnlyBash('cat README.md')).toBe(true);
  });

  it('treats mutating git commands and other commands as mutating', () => {
    expect(isLikelyReadOnlyBash('git commit -m "x"')).toBe(false);
    expect(isLikelyReadOnlyBash('pnpm test')).toBe(false);
  });
});
