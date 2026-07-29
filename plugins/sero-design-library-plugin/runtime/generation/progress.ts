/** Keep progress writes ordered and waitable before a terminal status write. */
export function createGenerationProgressReporter(
  write: (message: string) => Promise<void>,
  onError: (error: unknown) => void,
): { report(message: string): void; settle(): Promise<void> } {
  let pending = Promise.resolve();
  return {
    report(message) {
      pending = pending.then(() => write(message)).catch(onError);
    },
    settle: () => pending,
  };
}
