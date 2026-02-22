/**
 * useWorkspaceFiles — fetches and caches the list of project files
 * for a workspace, excluding common build / dependency directories.
 *
 * Used by the FileReferenceMenu (@-mention) and Tab path completion.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

/** Directories excluded from file search results. */
const EXCLUDED_DIRS = [
  'node_modules',
  '.git',
  '.turbo',
  'dist',
  'build',
  '.next',
  '.cache',
  '.output',
  'coverage',
  '__pycache__',
  '.venv',
  'target',
  '.jj',
  '.svn',
  '.hg',
  '.DS_Store',
];

/** Max files to return (safety cap). */
const MAX_FILES = 5000;

/** Simple in-memory cache keyed by workspaceId. */
const cache = new Map<string, { files: string[]; ts: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

export function useWorkspaceFiles(workspaceId: string | null) {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(0);

  const loadFiles = useCallback(async () => {
    if (!workspaceId) {
      setFiles([]);
      return;
    }

    // Check cache
    const cached = cache.get(workspaceId);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setFiles(cached.files);
      return;
    }

    const gen = ++abortRef.current;
    setIsLoading(true);
    try {
      const pruneArgs = EXCLUDED_DIRS.map(
        (d) => `-name '${d}' -prune`
      ).join(' -o ');

      const cmd = `find . \\( ${pruneArgs} \\) -o -type f -print | head -${MAX_FILES} | sort`;
      const { stdout } = await window.sero.editor.exec(workspaceId, cmd);

      if (gen !== abortRef.current) return; // stale

      const paths = stdout
        .split('\n')
        .filter(Boolean)
        .map((p) => (p.startsWith('./') ? p.slice(2) : p));

      cache.set(workspaceId, { files: paths, ts: Date.now() });
      setFiles(paths);
    } catch (err) {
      console.warn('[useWorkspaceFiles] Failed to load files:', err);
      if (gen === abortRef.current) setFiles([]);
    }
    if (gen === abortRef.current) setIsLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  return { files, isLoading, refresh: loadFiles };
}

// ── Fuzzy matching ──────────────────────────────────────────────

export interface FuzzyMatch {
  path: string;
  score: number;
  /** Character indices in the path that matched the query. */
  matchIndices: number[];
}

/**
 * Fuzzy-match a query against a list of file paths.
 * Returns up to `limit` results sorted by best score.
 */
export function fuzzyMatchFiles(
  files: string[],
  query: string,
  limit = 20,
): FuzzyMatch[] {
  if (!query) {
    // No query — return first `limit` files
    return files.slice(0, limit).map((path) => ({
      path,
      score: 0,
      matchIndices: [],
    }));
  }

  const lowerQuery = query.toLowerCase();
  const results: FuzzyMatch[] = [];

  for (const path of files) {
    const result = scorePath(path, lowerQuery);
    if (result) results.push(result);
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

function scorePath(
  path: string,
  lowerQuery: string,
): FuzzyMatch | null {
  const lowerPath = path.toLowerCase();
  const matchIndices: number[] = [];
  let score = 0;
  let qi = 0;

  for (let pi = 0; pi < lowerPath.length && qi < lowerQuery.length; pi++) {
    if (lowerPath[pi] === lowerQuery[qi]) {
      matchIndices.push(pi);

      // Bonus for matching at word boundaries
      if (pi === 0 || '/._-'.includes(lowerPath[pi - 1])) {
        score += 10;
      }

      // Bonus for consecutive matches
      if (matchIndices.length > 1 && matchIndices[matchIndices.length - 2] === pi - 1) {
        score += 5;
      }

      // Base match score
      score += 1;
      qi++;
    }
  }

  // All query chars must match
  if (qi < lowerQuery.length) return null;

  // Bonus for filename match (last segment)
  const filename = path.split('/').pop() ?? path;
  if (filename.toLowerCase().includes(lowerQuery)) {
    score += 20;
  }

  // Penalize longer paths slightly
  score -= path.length * 0.1;

  return { path, score, matchIndices };
}
