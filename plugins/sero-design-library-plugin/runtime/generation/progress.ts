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

/** Keep provider queue details out of the Design's plain-English status line. */
export function createGenerationMediaProgressReporter(
  report: (message: string) => void,
): (_providerMessage: string) => void {
  return () => report('Creating artwork…');
}
