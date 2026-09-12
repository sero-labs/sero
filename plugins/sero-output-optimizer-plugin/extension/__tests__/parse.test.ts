import { describe, expect, it } from 'vitest';

import { analyzeCommand, containsLossyGitForm, containsSearchCommand, hasBypassMarker, requestsStructuredOutput, rewriteBlockReason } from '../command-analysis';
import { bindRtkInvocations, isBindFailure } from '../binding';
import { collectRtkInvocations, classifyRtkInvocation } from '../rewrite-class';
import { quoteShell, splitTopLevelSegments, tokenizeShellSegment } from '../shell';

describe('shell parsing', () => {
  it('splits top-level separators and keeps quoted ones intact', () => {
    const split = splitTopLevelSegments('git status | grep "a|b" && echo done');
    expect(split.segments.map((segment) => segment.text.trim())).toEqual([
      'git status',
      'grep "a|b"',
      'echo done',
    ]);
    expect(split.hasTopLevelPipe).toBe(true);
  });

  it('does not treat redirection ampersands as separators', () => {
    const split = splitTopLevelSegments('pnpm build 2>&1 | tail -5');
    expect(split.segments).toHaveLength(2);
    expect(split.segments[0]?.text).toContain('2>&1');
  });

  it('tokenises quoted values without the quotes', () => {
    expect(tokenizeShellSegment('git commit -m "hello world"').map((token) => token.value))
      .toEqual(['git', 'commit', '-m', 'hello world']);
  });

  it('quotes values with spaces safely', () => {
    expect(quoteShell("/Applications/My Tools/rtk")).toBe("'/Applications/My Tools/rtk'");
    expect(quoteShell("it's")).toBe("'it'\\''s'");
  });
});

describe('command analysis', () => {
  it('finds a search command inside a pipe', () => {
    expect(containsSearchCommand(analyzeCommand('git status | grep modified'))).toBe(true);
  });

  it('finds a search command inside a compound', () => {
    expect(containsSearchCommand(analyzeCommand('ls && rg foo'))).toBe(true);
  });

  it('does not treat a quoted search word as a search command', () => {
    expect(containsSearchCommand(analyzeCommand('echo "grep is a tool"'))).toBe(false);
  });

  it('finds lossy git forms', () => {
    expect(containsLossyGitForm(analyzeCommand('git log --oneline'))).toBe(true);
    expect(containsLossyGitForm(analyzeCommand('git diff HEAD'))).toBe(true);
    expect(containsLossyGitForm(analyzeCommand('git show HEAD~1'))).toBe(true);
    expect(containsLossyGitForm(analyzeCommand('git status'))).toBe(false);
  });

  it('detects structured output requests', () => {
    expect(requestsStructuredOutput(analyzeCommand('rg --json foo'))).toBe(true);
    expect(requestsStructuredOutput(analyzeCommand('pnpm test --reporter=json'))).toBe(true);
    expect(requestsStructuredOutput(analyzeCommand('git status --porcelain'))).toBe(true);
    expect(requestsStructuredOutput(analyzeCommand('pnpm test'))).toBe(false);
  });

  it('detects the bypass marker conservatively', () => {
    expect(hasBypassMarker('git status # no-opt')).toBe(true);
    expect(hasBypassMarker('echo "# no-opt"')).toBe(true);
    expect(hasBypassMarker('git status')).toBe(false);
  });

  it('blocks a piped command on Windows only', () => {
    expect(rewriteBlockReason('git status | tail -5', analyzeCommand('git status | tail -5'), 'win32'))
      .toBe('windows-pipe');
    expect(rewriteBlockReason('git status | tail -5', analyzeCommand('git status | tail -5'), 'darwin'))
      .toBeNull();
  });
});

describe('rewrite classification', () => {
  it('classifies RTK subcommands', () => {
    expect(classifyRtkInvocation(['git', 'status'])).toBe('git');
    expect(classifyRtkInvocation(['read', 'a.txt'])).toBe('fileReads');
    expect(classifyRtkInvocation(['docker', 'ps'])).toBe('containers');
    expect(classifyRtkInvocation(['gh', 'pr', 'list'])).toBe('github');
    expect(classifyRtkInvocation(['cargo', 'test'])).toBe('tests');
    expect(classifyRtkInvocation(['cargo', 'build'])).toBe('builds');
    expect(classifyRtkInvocation(['pnpm', 'install'])).toBe('packageManagers');
    expect(classifyRtkInvocation(['mystery'])).toBe('other');
  });
});

describe('binding', () => {
  const runtime = {
    executablePath: '/runtime/path/rtk',
    env: { RTK_DB_PATH: '/state/history.db' },
  };

  function bind(command: string) {
    const analysis = analyzeCommand(command);
    const invocations = collectRtkInvocations(analysis.segments);
    expect(invocations).not.toBeNull();
    return bindRtkInvocations(command, analysis.segments, invocations ?? [], runtime);
  }

  it('binds a single invocation with its env', () => {
    const result = bind('rtk git status');
    expect(isBindFailure(result)).toBe(false);
    if (isBindFailure(result)) return;
    expect(result.command).toBe("RTK_DB_PATH='/state/history.db' '/runtime/path/rtk' git status");
  });

  it('binds every invocation in a compound', () => {
    const result = bind('rtk read a.txt && rtk ls');
    expect(isBindFailure(result)).toBe(false);
    if (isBindFailure(result)) return;
    expect(result.command.match(/\/runtime\/path\/rtk/g)).toHaveLength(2);
  });

  it('quotes a runtime path with spaces', () => {
    const analysis = analyzeCommand('rtk ls');
    const invocations = collectRtkInvocations(analysis.segments) ?? [];
    const result = bindRtkInvocations('rtk ls', analysis.segments, invocations, {
      executablePath: '/Applications/My Tools/rtk',
      env: {},
    });
    expect(isBindFailure(result)).toBe(false);
    if (isBindFailure(result)) return;
    expect(result.command).toBe("'/Applications/My Tools/rtk' ls");
  });

  it('discards a command whose rtk token is not command-position', () => {
    const analysis = analyzeCommand('echo rtk');
    expect(collectRtkInvocations(analysis.segments)).toBeNull();
  });
});
