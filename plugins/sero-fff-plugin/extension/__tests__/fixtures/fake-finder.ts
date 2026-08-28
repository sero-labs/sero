/** Minimal in-memory stand-ins for the FFF SDK, used by the unit suites. */

import type {
  FileFinderApi,
  GrepCursor,
  GrepMatch,
  GrepResult,
  InitOptions,
  Result,
  SearchResult,
} from '@ff-labs/fff-node';

import type { FileFinderStatic } from '../../sdk';

export interface FakeFinderScript {
  grep?: (query: string, options?: unknown) => Result<GrepResult>;
  multiGrep?: (options: unknown) => Result<GrepResult>;
  fileSearch?: (query: string, options?: unknown) => Result<SearchResult>;
}

export class FakeFinder {
  destroyed = false;

  readonly calls: { method: string; args: unknown[] }[] = [];

  constructor(
    readonly basePath: string,
    private readonly script: FakeFinderScript = {},
  ) {}

  get isDestroyed(): boolean {
    return this.destroyed;
  }

  destroy(): void {
    this.destroyed = true;
  }

  async waitForScan(): Promise<Result<boolean>> {
    return { ok: true, value: true };
  }

  grep(query: string, options?: unknown): Result<GrepResult> {
    this.calls.push({ method: 'grep', args: [query, options] });
    return this.script.grep?.(query, options) ?? { ok: true, value: emptyGrepResult() };
  }

  multiGrep(options: unknown): Result<GrepResult> {
    this.calls.push({ method: 'multiGrep', args: [options] });
    return this.script.multiGrep?.(options) ?? { ok: true, value: emptyGrepResult() };
  }

  fileSearch(query: string, options?: unknown): Result<SearchResult> {
    this.calls.push({ method: 'fileSearch', args: [query, options] });
    return this.script.fileSearch?.(query, options) ?? { ok: true, value: emptySearchResult() };
  }
}

/** The registry only uses this subset, so the cast keeps the fixture small. */
export function asFinder(fake: FakeFinder): FileFinderApi {
  return fake as unknown as FileFinderApi;
}

export interface FakeSdkOptions {
  script?: FakeFinderScript;
  /** Fails creation while a frecency database path is supplied. */
  failWithDb?: string;
  /** Fails creation unconditionally. */
  failAlways?: string;
}

export function createFakeSdk(options: FakeSdkOptions = {}): {
  FileFinder: FileFinderStatic;
  created: FakeFinder[];
  initOptions: InitOptions[];
} {
  const created: FakeFinder[] = [];
  const initOptions: InitOptions[] = [];

  const FileFinder: FileFinderStatic = {
    create(init: InitOptions): Result<FileFinderApi> {
      initOptions.push(init);
      if (options.failAlways) return { ok: false, error: options.failAlways };
      if (options.failWithDb && init.frecencyDbPath) {
        return { ok: false, error: options.failWithDb };
      }
      const finder = new FakeFinder(init.basePath, options.script);
      created.push(finder);
      return { ok: true, value: asFinder(finder) };
    },
  };

  return { FileFinder, created, initOptions };
}

export function grepMatch(overrides: Partial<GrepMatch> & { relativePath: string }): GrepMatch {
  return {
    fileName: overrides.relativePath.split('/').pop() ?? overrides.relativePath,
    gitStatus: 'clean',
    size: 100,
    modified: 0,
    isBinary: false,
    totalFrecencyScore: 0,
    accessFrecencyScore: 0,
    modificationFrecencyScore: 0,
    lineNumber: 1,
    col: 0,
    byteOffset: 0,
    lineContent: 'line',
    matchRanges: [],
    ...overrides,
  };
}

export function grepResult(items: GrepMatch[], nextCursor: GrepCursor | null = null): GrepResult {
  return {
    items,
    totalMatched: items.length,
    totalFilesSearched: new Set(items.map((item) => item.relativePath)).size,
    totalFiles: 100,
    filteredFileCount: 100,
    nextCursor,
  };
}

export function emptyGrepResult(): GrepResult {
  return grepResult([]);
}

export function searchResult(paths: string[], totalMatched = paths.length, score = 1000): SearchResult {
  return {
    items: paths.map((relativePath) => ({
      relativePath,
      fileName: relativePath.split('/').pop() ?? relativePath,
      size: 10,
      modified: 0,
      accessFrecencyScore: 0,
      modificationFrecencyScore: 0,
      totalFrecencyScore: 0,
      gitStatus: 'clean',
    })),
    scores: paths.map(() => ({
      total: score,
      baseScore: score,
      filenameBonus: 0,
      specialFilenameBonus: 0,
      frecencyBoost: 0,
      distancePenalty: 0,
      currentFilePenalty: 0,
      comboMatchBoost: 0,
      exactMatch: true,
      matchType: 'exact',
    })),
    totalMatched,
    totalFiles: 100,
  };
}

export function emptySearchResult(): SearchResult {
  return searchResult([]);
}

/** An opaque cursor value; the plugin only ever passes it back through. */
export function fakeCursor(offset: number): GrepCursor {
  return { __brand: 'GrepCursor', _offset: offset } as GrepCursor;
}
