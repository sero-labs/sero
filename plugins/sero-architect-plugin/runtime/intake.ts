/**
 * Intake, re-entrant: it does whatever the record still lacks (workspace, git,
 * start approval, first phase) and nothing it already has. Create, resume and a
 * restart all take this path, so an interruption is never permanent.
 *
 * Two flows end here. A project with a delivery agreement asks for one start
 * approval and then works. A project without one enters discovery and proposes
 * a charter; that flow is deprecated and kept for the records that use it.
 */

import { agreementApproved, hasAgreement } from '../shared/agreement';
import { advancePhase, block, startAgreedWork } from '../shared/lifecycle';
import type { ProjectRecord } from '../shared/record';
import type { DispatchWatch } from './dispatch-watch';
import type { ArchitectHost } from './host';
import { ensureOpenSpec } from './openspec';
import type { OwnerSessions } from './owner-session';
import type { RecordStore } from './record-store';
import type { RunJournal } from './run-journal';
import { ensureInitialRun } from './run-lifecycle';
import type { WakeScheduler } from './wake-scheduler';
import { createWorkspaceClaim } from './workspace-claim';

export interface IntakeDeps {
  host: ArchitectHost;
  store: RecordStore;
  sessions: OwnerSessions;
  scheduler: WakeScheduler;
  watch: Pick<DispatchWatch, 'track'>;
  journal?: RunJournal;
}

export type IntakeOutcome = { ok: true; record: ProjectRecord } | { ok: false; error: string };

export function createIntake(deps: IntakeDeps): (start: ProjectRecord, requestPermission?: boolean) => Promise<IntakeOutcome> {
  const { host, store, sessions, scheduler, watch } = deps;
  const claimWorkspace = createWorkspaceClaim(host, store);

  return async (start, requestPermission = true) => {
    let record = start;
    if (!record.workspaceId) {
      try {
        record = await claimWorkspace(record.id);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        await store.update(record.id, (fresh) => {
          const blocked = block(fresh, host.now(), `the workspace could not be created: ${reason}`);
          return blocked.ok ? blocked.record : null;
        });
        return { ok: false, error: reason };
      }
    }
    try {
      const init = await host.exec('git', ['init'], record.folder);
      if (init.exitCode !== 0) throw new Error(`git init failed: ${init.stderr.trim() || init.stdout.trim()}`);
      if (record.openSpecEnabled) await ensureOpenSpec(host, record.folder);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await store.update(record.id, (fresh) => {
        const blocked = block(fresh, host.now(), reason);
        return blocked.ok ? { ...blocked.record, stateLine: 'Project setup failed. Retry to continue.' } : null;
      });
      return { ok: false, error: reason };
    }
    // Everything above costs nothing. Everything below is paid, so it waits for
    // the user's approval.
    if (!requestPermission) return { ok: true, record };
    if (!record.session.grantId || (hasAgreement(record) && !agreementApproved(record))) {
      record = await sessions.requestGrant(record);
      if (record.blockedReason) return { ok: true, record };
    }
    const agreed = hasAgreement(record);
    if (record.phase === 'intake') {
      let failure = '';
      const advanced = await store.update(record.id, (fresh) => {
        const result = agreed
          ? startAgreedWork({ ...fresh, stateLine: 'Starting the work.' }, host.now())
          : advancePhase({ ...fresh, stateLine: 'Discovering the project.' }, 'discovery', host.now(), 'workspace registered and owner grant approved');
        if (result.ok) return result.record;
        failure = result.error;
        return null;
      });
      if (!advanced) return { ok: false, error: failure || `No project ${record.id}.` };
      record = advanced;
      // The initial run covers setup through initial delivery, so it opens before
      // the first model call. Idempotent: a re-entered start keeps it.
      if (deps.journal) {
        await ensureInitialRun({ store, journal: deps.journal }, record.id, host.now()).catch((error: unknown) => {
          host.log(`could not open the initial run for ${record.id}: ${error instanceof Error ? error.message : String(error)}`);
        });
      }
    }
    await watch.track(record);
    scheduler.request(record.id, { kind: 'quiet', at: host.now(), items: [agreed ? 'the start was approved; work starts' : 'intake finished; discovery starts'] });
    return { ok: true, record };
  };
}
