/**
 * Dashboard, the default landing page with a draggable/resizable widget grid.
 *
 * The current implementation keeps the existing widget mounting and layout
 * persistence behaviour, but presents it as a modern composable dashboard
 * surface with dashboard view tabs and a bounded canvas.
 */

import { useMemo, useCallback, useState } from 'react';
import type { ComponentType } from 'react';
import { Activity, LayoutDashboard, Plus, Settings2, Sparkles } from 'lucide-react';
import { GridLayout } from 'react-grid-layout';
import type { Layout, LayoutItem } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import './Dashboard.css';

import { useAppStore } from '@/stores/app';
import { useDashboardStore, getAvailableWidgets } from '@/stores/dashboard';
import type { AvailableWidget } from '@/types/dashboard';
import { DashboardWidget } from './DashboardWidget';
import { AddWidgetDialog } from './AddWidgetDialog';
import { useGridWidth } from './useGridWidth';
import { useRuntimeWidgets } from './useRuntimeWidgets';

type DashboardNavId = 'overview' | 'engineering' | 'ops' | 'personal';

type DashboardNavItem = {
  id: DashboardNavId;
  label: string;
  description: string;
  meta: string;
  icon: ComponentType<{ className?: string }>;
};

const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    description: 'A shared command surface for the current workspace.',
    meta: 'Default',
    icon: LayoutDashboard,
  },
  {
    id: 'engineering',
    label: 'Engineering',
    description: 'Code, builds, agents, terminals, deploys, and repo health.',
    meta: 'Team',
    icon: Activity,
  },
  {
    id: 'ops',
    label: 'Ops',
    description: 'Runtime telemetry, alerts, schedules, and automation loops.',
    meta: 'Live',
    icon: Sparkles,
  },
  {
    id: 'personal',
    label: 'Personal',
    description: 'Pinned tools, notes, todo streams, and quick daily context.',
    meta: 'Private',
    icon: Settings2,
  },
];

// Component

export function Dashboard() {
  const apps = useAppStore((s) => s.apps);
  const widgets = useDashboardStore((s) => s.widgets);
  const layouts = useDashboardStore((s) => s.layouts);
  const updateLayouts = useDashboardStore((s) => s.updateLayouts);
  const persistLayouts = useDashboardStore((s) => s.persistLayouts);
  const runtimeWidgets = useRuntimeWidgets();
  const [activeDashboardId, setActiveDashboardId] = useState<DashboardNavId>('overview');

  const { containerRef, width } = useGridWidth();

  // Resolve app manifests for all discovered apps.
  const manifestMap = useMemo(() => {
    const map = new Map<string, (typeof apps)[number]>();
    for (const app of apps) {
      if (app.manifest) map.set(app.id, app);
    }
    return map;
  }, [apps]);

  // Resolve available widgets from all app manifests.
  const availableWidgets = useMemo<AvailableWidget[]>(() => {
    const manifests = apps.filter((a) => a.manifest).map((a) => a.manifest!);
    return getAvailableWidgets(manifests, runtimeWidgets);
  }, [apps, runtimeWidgets]);

  // Build a lookup for widget metadata.
  const widgetMetaMap = useMemo(() => {
    const map = new Map<string, AvailableWidget>();
    for (const aw of availableWidgets) {
      map.set(`${aw.appId}:${aw.manifest.id}`, aw);
    }
    return map;
  }, [availableWidgets]);

  const activeDashboard =
    DASHBOARD_NAV_ITEMS.find((item) => item.id === activeDashboardId) ?? DASHBOARD_NAV_ITEMS[0];

  const summaryPills = useMemo(
    () => [
      {
        label: 'Widget primitives',
        value: availableWidgets.length > 0 ? String(availableWidgets.length) : 'Ready',
        tone: 'cyan' as const,
      },
      { label: 'Layout model', value: 'Drag and resize', tone: 'violet' as const },
      { label: 'Canvas', value: 'No page scroll', tone: 'amber' as const },
      { label: 'Theme', value: 'Glow-fi glass', tone: 'coral' as const },
    ],
    [availableWidgets.length],
  );

  // Convert mutable LayoutItem[] to readonly Layout for the grid.
  const gridLayout: Layout = layouts;
  const gridWidth = Math.max(width - 48, 0);

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      // Layout is readonly LayoutItem[], copy to mutable for store.
      const mutable: LayoutItem[] = newLayout.map((item) => ({ ...item }));
      updateLayouts(mutable);
    },
    [updateLayouts],
  );

  // Persist only once when drag/resize finishes, not on every frame.
  const handleInteractionStop = useCallback(() => {
    persistLayouts();
  }, [persistLayouts]);

  const hasWidgets = widgets.length > 0;

  return (
    <div ref={containerRef} className="dashboard-shell flex h-full min-h-0 flex-col overflow-hidden">
      <header className="dashboard-topbar">
        <div className="dashboard-title-lockup">
          <p className="dashboard-eyebrow">Workspace dashboard</p>
          <h1>Composable widget canvas</h1>
          <p>{activeDashboard.description}</p>
        </div>
        <div className="dashboard-actions">
          <button type="button" className="dashboard-new-view-button" aria-label="Create dashboard view mockup">
            <Plus className="size-3.5" />
            New dashboard
          </button>
          <AddWidgetDialog availableWidgets={availableWidgets} />
        </div>
      </header>

      <DashboardNavigation activeId={activeDashboardId} onSelect={setActiveDashboardId} />

      <section className="dashboard-summary-strip" aria-label="Dashboard system summary">
        {summaryPills.map((pill) => (
          <div key={pill.label} className={`dashboard-summary-pill dashboard-summary-pill-${pill.tone}`}>
            <span>{pill.label}</span>
            <strong>{pill.value}</strong>
          </div>
        ))}
      </section>

      <main className="dashboard-canvas" id={`dashboard-panel-${activeDashboardId}`}>
        {hasWidgets ? (
          gridWidth > 0 ? (
            <div className="dashboard-grid-frame" data-dashboard-view={activeDashboardId}>
              <GridLayout
                layout={gridLayout}
                width={gridWidth}
                gridConfig={{
                  cols: 6,
                  rowHeight: 128,
                  margin: [16, 16] as const,
                }}
                dragConfig={{
                  enabled: true,
                  handle: '.widget-drag-handle',
                }}
                resizeConfig={{
                  enabled: true,
                }}
                onLayoutChange={handleLayoutChange}
                onDragStop={handleInteractionStop}
                onResizeStop={handleInteractionStop}
              >
                {widgets.map((widget) => {
                  const appEntry = manifestMap.get(widget.appId);
                  const manifest = appEntry?.manifest ?? null;
                  const meta = widgetMetaMap.get(`${widget.appId}:${widget.widgetId}`) ?? null;

                  return (
                    <DashboardWidget
                      key={widget.instanceId}
                      widget={widget}
                      manifest={manifest}
                      widgetMeta={meta}
                    />
                  );
                })}
              </GridLayout>
            </div>
          ) : (
            <DashboardCanvasPending />
          )
        ) : (
          <EmptyState availableWidgets={availableWidgets} />
        )}
      </main>
    </div>
  );
}

function DashboardNavigation({
  activeId,
  onSelect,
}: {
  activeId: DashboardNavId;
  onSelect: (id: DashboardNavId) => void;
}) {
  return (
    <nav className="dashboard-nav-wrap" aria-label="Dashboard views">
      <div className="dashboard-tabs" role="tablist" aria-label="Dashboard views">
        {DASHBOARD_NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`dashboard-panel-${item.id}`}
              className={`dashboard-tab ${isActive ? 'dashboard-tab-active' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="dashboard-tab-icon">
                <Icon className="size-4" />
              </span>
              <span className="dashboard-tab-copy">
                <span>{item.label}</span>
                <small>{item.meta}</small>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function DashboardCanvasPending() {
  return (
    <div className="dashboard-canvas-pending">
      <div className="dashboard-pulse-orb" />
      <p>Preparing dashboard canvas</p>
    </div>
  );
}

// Empty state

function EmptyState({ availableWidgets }: { availableWidgets: AvailableWidget[] }) {
  return (
    <div className="dashboard-empty-state">
      <section className="dashboard-empty-copy">
        <div className="dashboard-empty-badge">Mockup preview</div>
        <h2>Your dashboard is empty</h2>
        <p>
          Add shared widget primitives from apps, then compose them into dashboard views without every app
          inventing its own cards, charts, tabs, and metric treatments.
        </p>
        <div className="dashboard-empty-actions">
          <AddWidgetDialog availableWidgets={availableWidgets} />
          <span>{availableWidgets.length || 'No'} widgets available from installed apps</span>
        </div>
      </section>

      <section className="dashboard-mock-preview" aria-label="Dashboard widget mockup preview">
        <div className="dashboard-mock-grid">
          <MockMetricWidget
            className="dashboard-mock-wide"
            eyebrow="Agent runtime"
            value="94%"
            label="Tasks completing without intervention"
            tone="cyan"
          />
          <MockListWidget />
          <MockChartWidget />
          <MockMetricWidget
            eyebrow="Build health"
            value="12"
            label="Green checks across active repositories"
            tone="violet"
          />
          <MockMetricWidget
            eyebrow="Queue"
            value="03"
            label="Items waiting for review"
            tone="amber"
          />
        </div>
      </section>
    </div>
  );
}

function MockMetricWidget({
  eyebrow,
  value,
  label,
  tone,
  className,
}: {
  eyebrow: string;
  value: string;
  label: string;
  tone: 'cyan' | 'violet' | 'amber';
  className?: string;
}) {
  return (
    <article className={`dashboard-mock-card dashboard-mock-card-${tone} ${className ?? ''}`}>
      <span>{eyebrow}</span>
      <strong>{value}</strong>
      <p>{label}</p>
    </article>
  );
}

function MockChartWidget() {
  return (
    <article className="dashboard-mock-card dashboard-mock-chart dashboard-mock-tall">
      <div>
        <span>Workspace activity</span>
        <strong>Live</strong>
      </div>
      <svg viewBox="0 0 320 140" role="img" aria-label="Mock activity chart">
        <defs>
          <linearGradient id="dashboardMockArea" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--dash-accent-cyan)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--dash-accent-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M0 118 C40 84 64 98 96 68 C128 36 156 50 184 44 C228 34 248 76 320 24 L320 140 L0 140 Z" fill="url(#dashboardMockArea)" />
        <path d="M0 118 C40 84 64 98 96 68 C128 36 156 50 184 44 C228 34 248 76 320 24" fill="none" stroke="var(--dash-accent-cyan)" strokeLinecap="round" strokeWidth="4" />
      </svg>
    </article>
  );
}

function MockListWidget() {
  return (
    <article className="dashboard-mock-card dashboard-mock-list dashboard-mock-tall">
      <span>Unified primitives</span>
      {['Metric card', 'Timeseries chart', 'Task queue', 'Status matrix'].map((item) => (
        <div key={item}>
          <i />
          <p>{item}</p>
        </div>
      ))}
    </article>
  );
}
