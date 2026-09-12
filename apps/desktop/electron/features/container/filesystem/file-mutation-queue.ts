/**
 * In-process serialization for file mutations.
 *
 * Ported from Pi SDK's core/tools/file-mutation-queue.ts. Sero keys the queue
 * by a backend-supplied identity plus canonical path, so host and container
 * tools that reach the same backing file share one order.
 *
 * The queue coordinates callers inside one Sero process only. It does not
 * coordinate external writers or separate Sero processes.
 *
 * The implementation uses AsyncLocalStorage to detect re-entrant acquisition:
 * a nested mutation of the same key runs inside the outermost critical section
 * instead of waiting on a lock it already holds.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const queues = new Map<string, Promise<void>>();
let registrationQueue: Promise<void> = Promise.resolve();
const heldKeys = new AsyncLocalStorage<ReadonlySet<string>>();

/**
 * Run `fn` while holding the mutation lock for `key`.
 *
 * Mutations with the same key run one at a time in arrival order. Mutations
 * with different keys run concurrently. A nested acquisition of a key already
 * held by the current async chain runs immediately, and the lock stays held
 * until the outermost mutation settles.
 */
export async function withFileMutationQueue<T>(
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const held = heldKeys.getStore();
  if (held?.has(key)) return fn();

  const registration = registrationQueue.then(() => {
    const currentQueue = queues.get(key) ?? Promise.resolve();
    let release!: () => void;
    const nextQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chainedQueue = currentQueue.then(() => nextQueue);
    queues.set(key, chainedQueue);
    return { currentQueue, chainedQueue, release };
  });
  registrationQueue = registration.then(() => undefined, () => undefined);

  const { currentQueue, chainedQueue, release } = await registration;
  await currentQueue;
  const nextHeld = new Set(held ?? []);
  nextHeld.add(key);
  try {
    return await heldKeys.run(nextHeld, fn);
  } finally {
    release();
    if (queues.get(key) === chainedQueue) queues.delete(key);
  }
}
