/**
 * Federation Registry — maps discovered app IDs to lazy-loaded MF components.
 *
 * To add a new federated app:
 *   1. Add its remote to vite.config.ts
 *   2. Add its type declaration to src/types/module-federation.d.ts
 *   3. Register the lazy component here
 *
 * SeroAppMount reads from this registry — it doesn't need editing.
 */

import { lazy } from 'react';

type LazyComponent = React.LazyExoticComponent<React.ComponentType>;

const registry = new Map<string, LazyComponent>();

// ── Register federated remotes ───────────────────────────────

registry.set('todo', lazy(() => import('sero_todo/TodoApp')));
registry.set('weight-tracker', lazy(() => import('sero_weight_tracker/WeightTracker')));
registry.set('daily-quote', lazy(() => import('sero_daily_quote/DailyQuote')));

// ── Public API ───────────────────────────────────────────────

/** Get the lazy component for a discovered app. Returns null if not registered. */
export function getFederatedComponent(appId: string): LazyComponent | null {
  return registry.get(appId) ?? null;
}
