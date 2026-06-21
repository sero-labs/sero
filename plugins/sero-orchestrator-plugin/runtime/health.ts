// Cross-loop health check (the redefined P-E), extracted from the coordinator to
// keep it under the size limit. Reflects on each in-flight loop with the advisory
// reflector and returns a plain-English report. On-demand only (no background
// poll); stores each loop's reflection but never changes plans or control state.

import type { LoopStatus, OrchestratorActionResult } from '../shared/types';
import { isoNow, type Clock } from './clock';
import { toReflection, type Reflector } from './reflection';
import type { StateStore } from './state-store';

/** Loops a health check reflects on — the in-flight ones (drafts are still deriving). */
const HEALTH_STATUSES: ReadonlySet<LoopStatus> = new Set<LoopStatus>(['active', 'blocked', 'paused']);

export interface HealthCheckDeps {
  store: StateStore;
  clock: Clock;
  reflector: Reflector | null;
}

export async function runHealthCheck(deps: HealthCheckDeps): Promise<OrchestratorActionResult> {
  if (!deps.reflector) return { ok: true, message: 'Reflection is not available.' };
  const state = await deps.store.read();
  const loops = state.loops.filter((loop) => HEALTH_STATUSES.has(loop.status));
  if (loops.length === 0) return { ok: true, message: 'No in-flight goals to check.' };

  const lines: string[] = [];
  for (const loop of loops) {
    const result = await deps.reflector(loop, 'health-check');
    if (!result) {
      lines.push(`• ${loop.title} (${loop.status}) — no reflection`);
      continue;
    }
    await deps.store.updateLoop(loop.id, (current) => {
      current.reflection = toReflection(result, 'health-check', isoNow(deps.clock));
      current.updatedAt = isoNow(deps.clock);
    });
    const suffix = result.suggestion ? ` → ${result.suggestion}` : '';
    lines.push(`• ${loop.title} — ${result.verdict}: ${result.summary}${suffix}`);
  }
  return { ok: true, message: ['Health check:', ...lines].join('\n') };
}
