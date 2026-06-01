/**
 * useWorkspaceFiles — fetches and caches the list of project files
 * for a workspace, excluding common build / dependency directories.
 *
 * Used by the FileReferenceMenu (@-mention) and Tab path completion.
 */

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type MutableRefObject,
} from 'react';
import {
  retainWorkspaceFiletreeWatch,
} from '@/hooks/workspace-filetree-subscription';
import type { EditorRoot } from '@/types/ipc';

/** Directories excluded from file search results. */
const EXCLUDED_DIRS = new Set([
  'node_modules',
  'bower_components',
  'jspm_packages',
  '.pnpm-store',
  '.pnpm',
  '.yarn',
  '.bun',
  '.git',
  '.turbo',
  '.nx',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.svelte-kit',
  '.output',
  '.vite',
  '.cache',
  '.parcel-cache',
  'coverage',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
  '.tox',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  '.gradle',
  '.terraform',
  '.serverless',
  '.wrangler',
  '.sst',
  '.expo',
  '.jj',
  '.svn',
  '.hg',
  '.sero'
]);

const EXCLUDED_FILE_NAMES = new Set([
  '.DS_Store',
  '.eslintcache',
  '.stylelintcache',
  'tsconfig.tsbuildinfo',
  '.gitignore',
  '.sero-workspace.json'
]);

/** Max files to return (safety cap). */
const MAX_FILES = 5000;
const CACHE_TTL_MS = 30_000; // 30 seconds
const MAX_CACHE_ENTRIES = 10;

interface WorkspaceFileCacheEntry {
  files: string[];
  ts: number;
  lastAccessedAt: number;
}

interface LoadWorkspaceFilesOptions {
  bypassCache?: boolean;
}

/** Simple in-memory cache keyed by workspaceId. */
const cache = new Map<string, WorkspaceFileCacheEntry>();

function getCachedFiles(workspaceId: string): string[] | null {
  const cached = cache.get(workspaceId);
  if (!cached) return null;
  if (Date.now() - cached.ts >= CACHE_TTL_MS) {
    cache.delete(workspaceId);
    return null;
  }

  cached.lastAccessedAt = Date.now();
  return cached.files;
}

function evictOldestCacheEntries(): void {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestEntry = [...cache.entries()].reduce((oldest, current) =>
      current[1].lastAccessedAt < oldest[1].lastAccessedAt ? current : oldest,
    );
    cache.delete(oldestEntry[0]);
  }
}

function setCachedFiles(workspaceId: string, files: string[]): void {
  cache.set(workspaceId, {
    files,
    ts: Date.now(),
    lastAccessedAt: Date.now(),
  });
  evictOldestCacheEntries();
}

function clearCachedFiles(workspaceId: string): void {
  cache.delete(workspaceId);
}

function joinVirtualPath(basePath: string, name: string): string {
  return basePath === '/' ? `/${name}` : `${basePath.replace(/\/$/, '')}/${name}`;
}

function toDisplayedPath(root: EditorRoot, absoluteVirtualPath: string): string {
  const rootPath = root.virtualPath.replace(/\/$/, '');
  const relative = absoluteVirtualPath === rootPath
    ? ''
    : absoluteVirtualPath.slice(rootPath.length + 1);

  if (root.id === 'workspace') return relative;
  return relative ? `${rootPath}/${relative}` : rootPath;
}

function shouldIncludeFile(name: string): boolean {
  return !EXCLUDED_FILE_NAMES.has(name);
}

async function collectRootFiles(
  workspaceId: string,
  root: EditorRoot,
  remainingSlots: () => number,
): Promise<string[]> {
  const files: string[] = [];
  const maxFilesForRoot = remainingSlots();
  if (maxFilesForRoot <= 0) return files;

  const collectLevel = async (dirPaths: string[]): Promise<void> => {
    if (dirPaths.length === 0 || files.length >= maxFilesForRoot) return;

    const listedDirs = await Promise.all(dirPaths.map(async (dirPath) => {
      try {
        const entries = await window.sero.editor.listFiles(workspaceId, dirPath);
        return { dirPath, entries };
      } catch {
        return { dirPath, entries: [] };
      }
    }));

    const nextDirs: string[] = [];
    for (const { dirPath, entries } of listedDirs) {
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.type === 'directory') {
          if (!EXCLUDED_DIRS.has(entry.name)) {
            nextDirs.push(joinVirtualPath(dirPath, entry.name));
          }
          continue;
        }

        if (files.length >= maxFilesForRoot) break;
        if (!shouldIncludeFile(entry.name)) continue;
        files.push(toDisplayedPath(root, joinVirtualPath(dirPath, entry.name)));
      }
    }

    await collectLevel(nextDirs);
  };

  await collectLevel([root.virtualPath]);

  return files;
}

function sortWorkspaceFiles(files: string[]): string[] {
  return files.sort((a, b) => {
    const aIsLinkedRoot = a.startsWith('/');
    const bIsLinkedRoot = b.startsWith('/');
    if (aIsLinkedRoot !== bIsLinkedRoot) return aIsLinkedRoot ? 1 : -1;
    return a.localeCompare(b);
  });
}

async function collectWorkspaceFiles(workspaceId: string): Promise<string[]> {
  const roots = await window.sero.editor.getRoots(workspaceId);
  const rootFiles = await Promise.all(roots.map((root) => collectRootFiles(
    workspaceId,
    root,
    () => MAX_FILES,
  )));

  return sortWorkspaceFiles(rootFiles.flat().slice(0, MAX_FILES));
}

async function loadWorkspaceFiles(
  workspaceId: string,
  abortGeneration: number,
  abortRef: MutableRefObject<number>,
  setFiles: (files: string[]) => void,
  setIsLoading: (loading: boolean) => void,
  options: LoadWorkspaceFilesOptions = {},
): Promise<void> {
  if (!options.bypassCache) {
    const cachedFiles = getCachedFiles(workspaceId);
    if (cachedFiles) {
      setFiles(cachedFiles);
      setIsLoading(false);
      return;
    }
  }

  setIsLoading(true);
  try {
    const paths = await collectWorkspaceFiles(workspaceId);

    if (abortGeneration !== abortRef.current) return;

    setCachedFiles(workspaceId, paths);
    setFiles(paths);
  } catch (error) {
    console.warn('[useWorkspaceFiles] Failed to load files:', error);
    clearCachedFiles(workspaceId);
    if (abortGeneration === abortRef.current) {
      setFiles([]);
    }
  }

  if (abortGeneration === abortRef.current) {
    setIsLoading(false);
  }
}

export function useWorkspaceFiles(workspaceId: string | null) {
  const [files, setFiles] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const abortRef = useRef(0);

  const loadFiles = useCallback(
    async (options: LoadWorkspaceFilesOptions = {}) => {
      if (!workspaceId) {
        abortRef.current += 1;
        setFiles([]);
        setIsLoading(false);
        return;
      }

      const generation = ++abortRef.current;
      await loadWorkspaceFiles(
        workspaceId,
        generation,
        abortRef,
        setFiles,
        setIsLoading,
        options,
      );
    },
    [workspaceId],
  );

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!workspaceId) return;

    const releaseWatch = retainWorkspaceFiletreeWatch(workspaceId);
    const unsubscribe = window.sero.filetree.onChanged((data) => {
      if (data.workspaceId !== workspaceId) return;
      clearCachedFiles(workspaceId);
      void loadFiles({ bypassCache: true });
    });

    return () => {
      unsubscribe();
      releaseWatch();
    };
  }, [loadFiles, workspaceId]);

  const refresh = useCallback(async () => {
    if (workspaceId) {
      clearCachedFiles(workspaceId);
    }
    await loadFiles({ bypassCache: true });
  }, [loadFiles, workspaceId]);

  return { files, isLoading, refresh };
}

export function resetWorkspaceFilesCacheForTests(): void {
  cache.clear();
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

      if (pi === 0 || '/._-'.includes(lowerPath[pi - 1])) {
        score += 10;
      }

      if (matchIndices.length > 1 && matchIndices[matchIndices.length - 2] === pi - 1) {
        score += 5;
      }

      score += 1;
      qi++;
    }
  }

  if (qi < lowerQuery.length) return null;

  const filename = path.split('/').pop() ?? path;
  if (filename.toLowerCase().includes(lowerQuery)) {
    score += 20;
  }

  score -= path.length * 0.1;

  return { path, score, matchIndices };
}
