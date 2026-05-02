import { describe, expect, it } from 'vitest';

import {
  extractStatusPath,
  isIgnoredWorkspaceStatusPath,
  syncWorkspaceRootToDefaultBranch,
} from '@electron/features/vcs/worktree/workspace-sync';

describe('extractStatusPath', () => {
  it('extracts a regular porcelain status path', () => {
    expect(extractStatusPath('?? src/App.tsx')).toBe('src/App.tsx');
  });

  it('extracts the destination path for renames', () => {
    expect(extractStatusPath('R  old.ts -> new.ts')).toBe('new.ts');
  });
});

describe('isIgnoredWorkspaceStatusPath', () => {
  it('ignores Sero orchestration state paths', () => {
    expect(isIgnoredWorkspaceStatusPath('.sero/apps/kanban/state.json')).toBe(true);
    expect(isIgnoredWorkspaceStatusPath('.sero/worktrees/card-3/src/App.tsx')).toBe(true);
  });

  it('ignores workspace metadata but keeps real repo files', () => {
    expect(isIgnoredWorkspaceStatusPath('.sero-workspace.json')).toBe(true);
    expect(isIgnoredWorkspaceStatusPath('src/App.tsx')).toBe(false);
  });
});

describe('syncWorkspaceRootToDefaultBranch', () => {
  it('fast-forwards with merge against the fetched remote ref', async () => {
    const commands: string[] = [];
    let headReads = 0;
    const runner = {
      async run(_workspacePath: string, args: string[]) {
        const key = args.join(' ');
        commands.push(key);
        if (key === 'fetch origin') return { stdout: '', stderr: '' };
        if (key === 'symbolic-ref refs/remotes/origin/HEAD') return { stdout: 'refs/remotes/origin/main\n', stderr: '' };
        if (key === 'status --porcelain --untracked-files=all') return { stdout: '', stderr: '' };
        if (key === 'rev-parse --verify refs/remotes/origin/main') return { stdout: 'remote-sha\n', stderr: '' };
        if (key === 'rev-parse --verify refs/heads/main') return { stdout: 'local-sha\n', stderr: '' };
        if (key === 'checkout main') return { stdout: '', stderr: '' };
        if (key === 'rev-parse --verify HEAD') {
          headReads += 1;
          return {
            stdout: headReads < 3 ? 'old-head\n' : 'new-head\n',
            stderr: '',
          };
        }
        if (key === 'rev-parse --verify origin/main') return { stdout: 'new-head\n', stderr: '' };
        if (key === 'merge --ff-only origin/main') return { stdout: '', stderr: '' };
        throw new Error(`Unexpected git command: ${key}`);
      },
    };

    const result = await syncWorkspaceRootToDefaultBranch('/tmp/workspace', runner);

    expect(result).toMatchObject({ synced: true, branch: 'main', headChanged: true });
    expect(commands).toContain('merge --ff-only origin/main');
    expect(commands).not.toContain('pull --ff-only origin main');
  });

  it('reports no head change when already at the remote default branch', async () => {
    const runner = {
      async run(_workspacePath: string, args: string[]) {
        const key = args.join(' ');
        if (key === 'fetch origin') return { stdout: '', stderr: '' };
        if (key === 'symbolic-ref refs/remotes/origin/HEAD') return { stdout: 'refs/remotes/origin/main\n', stderr: '' };
        if (key === 'status --porcelain --untracked-files=all') return { stdout: '', stderr: '' };
        if (key === 'rev-parse --verify HEAD') return { stdout: 'same-head\n', stderr: '' };
        if (key === 'rev-parse --verify refs/remotes/origin/main') return { stdout: 'remote-sha\n', stderr: '' };
        if (key === 'rev-parse --verify refs/heads/main') return { stdout: 'local-sha\n', stderr: '' };
        if (key === 'checkout main') return { stdout: '', stderr: '' };
        if (key === 'rev-parse --verify origin/main') return { stdout: 'same-head\n', stderr: '' };
        throw new Error(`Unexpected git command: ${key}`);
      },
    };

    const result = await syncWorkspaceRootToDefaultBranch('/tmp/workspace', runner);

    expect(result).toMatchObject({ synced: true, branch: 'main', headChanged: false });
  });

  it('skips sync when non-kanban workspace files are dirty', async () => {
    const commands: string[] = [];
    const runner = {
      async run(_workspacePath: string, args: string[]) {
        const key = args.join(' ');
        commands.push(key);
        if (key === 'fetch origin') return { stdout: '', stderr: '' };
        if (key === 'symbolic-ref refs/remotes/origin/HEAD') return { stdout: 'refs/remotes/origin/main\n', stderr: '' };
        if (key === 'status --porcelain --untracked-files=all') return { stdout: '?? package.json\n', stderr: '' };
        throw new Error(`Unexpected git command: ${key}`);
      },
    };

    const result = await syncWorkspaceRootToDefaultBranch('/tmp/workspace', runner);

    expect(result.synced).toBe(false);
    expect(result.reason).toContain('package.json');
    expect(commands).not.toContain('checkout main');
  });
});
