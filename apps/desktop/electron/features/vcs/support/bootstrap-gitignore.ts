import { promises as fs } from 'fs';
import path from 'path';
import { WORKSPACE_COMMON_IGNORES } from '@sero-ai/common';

const WORKSPACE_BOOTSTRAP_GITIGNORE_PATTERNS = WORKSPACE_COMMON_IGNORES;

export async function ensureBootstrapGitignore(workspacePath: string): Promise<void> {
  const gitignorePath = path.join(workspacePath, '.gitignore');
  const content = await fs.readFile(gitignorePath, 'utf8').catch(() => '');
  const missing = WORKSPACE_BOOTSTRAP_GITIGNORE_PATTERNS.filter((pattern) => !content.includes(pattern));

  if (missing.length === 0) return;

  const separator = content && !content.endsWith('\n') ? '\n' : '';
  await fs.writeFile(gitignorePath, content + separator + missing.join('\n') + '\n', 'utf8');
}
