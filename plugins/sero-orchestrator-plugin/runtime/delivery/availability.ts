/**
 * Delivery-tool availability (spec 13, FR-D5). The destination's required
 * tools are checked against the live catalog at activation and at each run
 * start; a miss records a `delivery-tool-missing` warning — fail-soft, the
 * loop still runs (MCP servers connect dynamically and may appear later, and
 * a delivery step that really lacks its tool fails into normal recovery).
 */

import type { Loop, LoopWarning } from '../../shared/types';
import type { OrchestratorHost } from '../host';
import { effectiveDelivery } from '../../shared/delivery-types';
import { deliverySpec } from './registry';

/**
 * Re-evaluates the warning: replaces or clears any prior `delivery-tool-missing`
 * entry so it always reflects the current destination + catalog. When the
 * catalog itself cannot be listed, the existing warning state is left as is
 * (no churn on an enumeration hiccup).
 */
export async function reconcileDeliveryWarning(host: OrchestratorHost, loop: Loop): Promise<Loop> {
  const delivery = effectiveDelivery(loop);
  const spec = deliverySpec(delivery.destination);
  const kept = loop.warnings.filter((w) => w.code !== 'delivery-tool-missing');
  if (spec.requiredTools.length === 0) {
    return kept.length === loop.warnings.length ? loop : { ...loop, warnings: kept };
  }
  const catalog = await host.listToolCatalog().catch(() => undefined);
  if (catalog === undefined) return loop;
  const available = new Set(catalog.map((t) => t.name));
  const missing = spec.requiredTools.filter((t) => !available.has(t));
  if (missing.length === 0) {
    return kept.length === loop.warnings.length ? loop : { ...loop, warnings: kept };
  }
  const warning: LoopWarning = {
    id: host.newId('warning'),
    code: 'delivery-tool-missing',
    message: `Delivering to "${spec.label}" needs the ${missing.map((t) => `"${t}"`).join(', ')} tool${missing.length === 1 ? '' : 's'}, which ${missing.length === 1 ? 'is' : 'are'} not available right now. The loop still runs; the delivery step will fail into recovery until the tool appears.`,
    createdAt: host.now(),
  };
  return { ...loop, warnings: [...kept, warning] };
}
