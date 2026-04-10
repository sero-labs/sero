import { promises as fs } from 'fs';
import path from 'path';

const WORKSPACE_BOOTSTRAP_GITIGNORE_PATTERNS = [
  'node_modules/',
  'dist/',
  'build/',
  '.DS_Store',
  '*.log',
  '.env',
  '.env.local',
  'coverage/',
  '.sero/',
  '.sero-workspace.json',
  '__pycache__/',
  '*.pyc',
  'target/',
  '.next/',
  '.nuxt/',
  '.turbo/',
];

export async function ensureBootstrapGitignore(workspacePath: string): Promise<void> {
  const gitignorePath = path.join(workspacePath, '.gitignore');
  const content = await fs.readFile(gitignorePath, 'utf8').catch(() => '');
  const missing = WORKSPACE_BOOTSTRAP_GITIGNORE_PATTERNS.filter((pattern) => !content.includes(pattern));

  if (missing.length === 0) return;

  const separator = content && !content.endsWith('\n') ? '\n' : '';
  await fs.writeFile(gitignorePath, content + separator + missing.join('\n') + '\n', 'utf8');
}
