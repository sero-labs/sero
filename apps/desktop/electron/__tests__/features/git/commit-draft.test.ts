/**
 * The commit-message draft: what the model is shown, and what survives of what
 * it says (git-ux §10).
 *
 * The parsing matters more than it looks. The message goes straight into an
 * editable field, so a stray code fence or a "Commit message:" label lands in
 * the history verbatim — and an invented fallback is worse still, because it
 * reads plausibly enough to commit without looking.
 */

import { describe, expect, it, vi } from 'vitest';

import { buildCommitDraftContext } from '@electron/features/git/core/commit-draft';
import {
  buildCommitMessagePrompt,
  parseCommitMessage,
} from '@electron/features/agent/assistants/commit-message';
import type { GitRunner } from '@electron/features/git/core/git-runner';

function runnerFor(replies: Record<string, string>): GitRunner {
  const run = vi.fn(async (_ws: string, args: string[]) => {
    const key = Object.keys(replies).find((prefix) => args.join(' ').startsWith(prefix));
    return key === undefined
      ? { exitCode: 1, stdout: '', stderr: 'no reply configured' }
      : { exitCode: 0, stdout: replies[key]!, stderr: '' };
  });
  return { run } as unknown as GitRunner;
}

describe('parseCommitMessage', () => {
  it('keeps a plain conventional message', () => {
    expect(parseCommitMessage('feat(git): draft commit messages'))
      .toBe('feat(git): draft commit messages');
  });

  it('strips code fences, labels and wrapping quotes', () => {
    expect(parseCommitMessage('```\nfix(diff): stop dropping renames\n```'))
      .toBe('fix(diff): stop dropping renames');
    expect(parseCommitMessage('Commit message: fix(diff): stop dropping renames'))
      .toBe('fix(diff): stop dropping renames');
    expect(parseCommitMessage('"fix(diff): stop dropping renames"'))
      .toBe('fix(diff): stop dropping renames');
  });

  it('keeps a body, separated by one blank line', () => {
    const parsed = parseCommitMessage(
      'refactor(git): split the resolver\n\n\nIt had grown past the file-size rule.',
    );
    expect(parsed).toBe('refactor(git): split the resolver\n\nIt had grown past the file-size rule.');
  });

  it('truncates an over-long subject rather than wrapping it', () => {
    const subject = parseCommitMessage(`feat(git): ${'x'.repeat(100)}`);
    expect(subject).toHaveLength(72);
    expect(subject.endsWith('...')).toBe(true);
  });

  // A fabricated "chore: update files" is worse than no suggestion at all.
  it('returns nothing rather than inventing a message', () => {
    expect(parseCommitMessage('')).toBe('');
    expect(parseCommitMessage('   \n  ')).toBe('');
    expect(parseCommitMessage('```\n\n```')).toBe('');
  });
});

describe('buildCommitDraftContext', () => {
  it('describes the staged set when the Git app asks', async () => {
    const runner = runnerFor({
      'diff --cached --name-status': 'M\tsrc/parse.ts',
      'diff --cached -M': 'diff --git a/src/parse.ts b/src/parse.ts',
    });

    const ctx = await buildCommitDraftContext(runner, 'ws', 'staged');
    expect(ctx.fileSummary).toBe('M\tsrc/parse.ts');
    expect(ctx.patch).toContain('src/parse.ts');
  });

  // The popover commits everything it lists, including files git has never
  // seen — so a new file has to reach the model as one.
  it('includes untracked files when the popover asks', async () => {
    const runner = runnerFor({
      'status --porcelain=v1': '?? src/new.ts\n M src/edited.ts',
      'rev-parse --verify HEAD': 'abc1234',
      'diff HEAD -M': 'diff --git a/src/edited.ts b/src/edited.ts',
    });

    const ctx = await buildCommitDraftContext(runner, 'ws', 'all');
    expect(ctx.fileSummary).toBe('A\tsrc/new.ts\nM\tsrc/edited.ts');
  });

  it('falls back to a plain diff in a repository with no commits', async () => {
    const runner = runnerFor({
      'status --porcelain=v1': '?? README.md',
      'diff': '',
    });

    const ctx = await buildCommitDraftContext(runner, 'ws', 'all');
    expect(ctx.fileSummary).toBe('A\tREADME.md');
    expect(ctx.patch).toBe('');
  });

  it('refuses to draft when there is nothing to describe', async () => {
    const runner = runnerFor({ 'diff --cached': '' });
    await expect(buildCommitDraftContext(runner, 'ws', 'staged')).rejects.toThrow(/Nothing is staged/);
  });
});

describe('buildCommitMessagePrompt', () => {
  it('asks for the message alone, and shows both the summary and the patch', () => {
    const prompt = buildCommitMessagePrompt('M\tsrc/parse.ts', 'diff --git a/src/parse.ts');
    expect(prompt).toContain('Output only the commit message');
    expect(prompt).toContain('M\tsrc/parse.ts');
    expect(prompt).toContain('diff --git a/src/parse.ts');
  });
});
