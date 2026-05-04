/**
 * Types for the lenient profile-state reader.
 *
 * Reads must never throw. Damaged files produce a typed `error` instead.
 * Sensitive files (auth.json, .env) expose only the *names* of credentials.
 * Values are deleted defensively after parsing.
 */

export type ReadErrorKind = 'missing' | 'denied' | 'parse' | 'schema';

export interface ReadError {
  kind: ReadErrorKind;
  message: string;
}

export type ReadResult<T> =
  | { ok: true; value: T; path: string }
  | { ok: false; error: ReadError; path: string };

export interface ProfileSnapshotFiles {
  settings: ReadResult<unknown>;
  auth: ReadResult<{ keys: string[] }>;
  env: ReadResult<{ keys: string[] }>;
  models: ReadResult<unknown>;
  layout: ReadResult<unknown>;
  workspaces: ReadResult<unknown>;
}

export interface ProfileSnapshot {
  id: string;
  name: string;
  path: string;
  isActive: boolean;
  /** Profile-shaped directory exists on disk but is not in the registry. */
  isOrphan: boolean;
  pathExists: boolean;
  agentDirExists: boolean;
  agentDirWritable: boolean;
  files: ProfileSnapshotFiles;
}
