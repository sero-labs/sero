/**
 * Canonical junk/secret patterns for Sero workspaces (gitignore syntax).
 *
 * Single source of truth for every feature that bootstraps or scans a
 * workspace: .gitignore bootstrap, worktree hygiene, and knowledge-graph
 * indexing (graphify). Add new Sero-generated workspace artifacts here —
 * never in per-feature copies.
 */
export const WORKSPACE_COMMON_IGNORES = [
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
  'graphify-out/',
  '.graphifyignore',
  '__pycache__/',
  '*.pyc',
  'target/',
  '.next/',
  '.nuxt/',
  '.turbo/',
  '.pnpm-store/',
];
