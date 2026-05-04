/**
 * Electron main entry — the doctor-aware bootstrap.
 *
 * This file is intentionally tiny. ESM static imports are evaluated
 * BEFORE any module-body code runs, so any `import './platform/env'`
 * (or any other heavy feature module) at the top of this file would
 * execute its top-level side effects regardless of `--doctor`. Reading
 * a corrupt profiles.json or pulling in a broken native module is
 * exactly what the doctor is supposed to survive, so the heavy app
 * graph lives in `./app-main.ts` and is only reachable via a dynamic
 * import once the doctor branch has been ruled out.
 *
 * Static imports here MUST stay limited to:
 *   - the doctor CLI module (self-contained; touches no profile state)
 *   - Electron itself (loaded indirectly anyway by the dynamic branches)
 *
 * Anything else belongs inside one of the two dynamic-import paths.
 */

import { app, protocol } from 'electron';
import { isDoctorInvocation, runDoctorSafeMode } from './features/doctor/cli';

// Must happen synchronously during main-module evaluation, before Electron's
// ready event. Keeping it in the tiny bootstrap preserves the --doctor
// short-circuit while avoiding the race introduced by dynamically importing
// app-main.ts after Electron has already become ready.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'sero-ext',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

async function bootstrap(): Promise<void> {
  if (isDoctorInvocation(process.argv)) {
    // Safe mode. We deliberately do NOT import './platform/env' or any
    // ./features/* / ./ipc/* module — the doctor reads profile state
    // defensively via its own snapshot reader.
    try {
      await app.whenReady();
      const { exitCode } = await runDoctorSafeMode({
        argv: process.argv.slice(2),
        seroVersion: app.getVersion(),
      });
      app.exit(exitCode);
    } catch (err) {
      process.stderr.write(
        `[doctor] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`,
      );
      app.exit(2);
    }
    return;
  }

  // Normal app startup. The dynamic import keeps every static-import
  // side effect in `app-main.ts` (and its transitive graph) gated
  // behind this branch, so the doctor short-circuit above never
  // triggers profile / IPC / runtime initialisation.
  await import('./app-main');
}

void bootstrap();
