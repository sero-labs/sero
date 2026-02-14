/**
 * useAppState — file-backed reactive state for Sero apps.
 *
 * 1. Initial read via IPC
 * 2. File watching via main process (fs.watch → IPC push)
 * 3. Writes via IPC (atomic file write → watcher fires → all consumers update)
 */
/**
 * File-backed reactive state hook.
 *
 * @param defaultState — returned while the file is being read (or if missing)
 * @returns [state, updateState] — updateState accepts an updater function
 */
export declare function useAppState<T>(defaultState: T): [T, (updater: (prev: T) => T) => void];
