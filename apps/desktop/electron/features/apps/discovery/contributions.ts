import type {
  AppContribution,
  AppContributionDiagnostic,
  AppContributions,
  ComponentContribution,
  ControlContribution,
  DashboardWidgetContribution,
} from '@sero-ai/common';

type JsonObject = Record<string, unknown>;

export interface ContributionManifestSource {
  contributes?: unknown;
  widgets?: unknown;
  search?: unknown;
  explorerView?: unknown;
  titlebar?: unknown;
  workspaceCreation?: unknown;
}
export interface ParseAppContributionsOptions {
  suppressUi?: boolean;
}

export interface ParsedAppContributions {
  contributions: AppContributions;
  diagnostics: AppContributionDiagnostic[];
}

export function warnContributionDiagnostics(
  packagePath: string,
  diagnostics: AppContributionDiagnostic[],
): void {
  if (diagnostics.length === 0) return;
  const messages: string[] = [];
  for (const entry of diagnostics) {
    messages.push(`[${entry.code}] ${entry.message}`);
  }
  console.warn(
    `[app-discovery] Ignoring invalid sero.app.contributes entries in "${packagePath}": `
    + messages.join('; '),
  );
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function parseSize(value: unknown, fallback: { w: number; h: number }): { w: number; h: number } {
  if (!isObject(value)) return fallback;
  return {
    w: positiveNumber(value.w, fallback.w),
    h: positiveNumber(value.h, fallback.h),
  };
}

function parseOptionalSize(value: unknown, fallback: { w: number; h: number }): { w: number; h: number } | undefined {
  return value === undefined ? undefined : parseSize(value, fallback);
}

function diagnostic(
  code: AppContributionDiagnostic['code'],
  message: string,
  entry?: JsonObject,
): AppContributionDiagnostic {
  return {
    code,
    message,
    contributionId: nonEmptyString(entry?.id) ?? undefined,
    extensionPoint: nonEmptyString(entry?.extensionPoint) ?? undefined,
  };
}

function parseComponent(
  value: unknown,
  diagnostics: AppContributionDiagnostic[],
): ComponentContribution | null {
  if (!isObject(value)) {
    diagnostics.push(diagnostic('invalid-contribution', 'Component contribution must be an object.'));
    return null;
  }

  const id = nonEmptyString(value.id);
  const extensionPoint = nonEmptyString(value.extensionPoint);
  const component = nonEmptyString(value.component);
  if (!id || !extensionPoint || !component) {
    diagnostics.push(diagnostic(
      'invalid-contribution',
      'Component contribution requires non-empty id, extensionPoint and component fields.',
      value,
    ));
    return null;
  }

  const base = { id, component };
  switch (extensionPoint) {
    case 'ui.global-search.panel':
      return {
        ...base,
        extensionPoint,
        description: optionalString(value.description),
      };
    case 'ui.explorer.view':
      return {
        ...base,
        extensionPoint,
        label: optionalString(value.label),
        icon: optionalString(value.icon),
      };
    case 'ui.titlebar.control':
      return { ...base, extensionPoint };
    case 'ui.dashboard.widget': {
      const name = nonEmptyString(value.name);
      if (!name) {
        diagnostics.push(diagnostic(
          'invalid-contribution',
          'Dashboard widget contribution requires a non-empty name.',
          value,
        ));
        return null;
      }
      return {
        ...base,
        extensionPoint,
        name,
        defaultSize: parseSize(value.defaultSize, { w: 2, h: 2 }),
        minSize: parseOptionalSize(value.minSize, { w: 1, h: 1 }),
        maxSize: parseOptionalSize(value.maxSize, { w: 4, h: 4 }),
        description: optionalString(value.description),
      };
    }
    default:
      diagnostics.push(diagnostic(
        'unknown-extension-point',
        `Unknown component extension point "${extensionPoint}" was ignored.`,
        value,
      ));
      return null;
  }
}

function parseControl(
  value: unknown,
  diagnostics: AppContributionDiagnostic[],
): ControlContribution | null {
  if (!isObject(value)) {
    diagnostics.push(diagnostic('invalid-contribution', 'Control contribution must be an object.'));
    return null;
  }

  const id = nonEmptyString(value.id);
  const extensionPoint = nonEmptyString(value.extensionPoint);
  if (!id || !extensionPoint) {
    diagnostics.push(diagnostic(
      'invalid-contribution',
      'Control contribution requires non-empty id and extensionPoint fields.',
      value,
    ));
    return null;
  }
  if (extensionPoint !== 'workspace.create.option') {
    diagnostics.push(diagnostic(
      'unknown-extension-point',
      `Unknown control extension point "${extensionPoint}" was ignored.`,
      value,
    ));
    return null;
  }

  const control = value.control;
  const action = value.action;
  const label = isObject(control) ? nonEmptyString(control.label) : null;
  const tool = isObject(action) ? nonEmptyString(action.tool) : null;
  const validParams = !isObject(action) || action.params === undefined || isObject(action.params);
  if (
    !isObject(control)
    || control.type !== 'switch'
    || !label
    || (control.defaultValue !== undefined && typeof control.defaultValue !== 'boolean')
    || !isObject(action)
    || action.type !== 'tool'
    || !tool
    || !validParams
  ) {
    diagnostics.push(diagnostic(
      'invalid-contribution',
      'Workspace creation option requires a switch control and an app-local tool action.',
      value,
    ));
    return null;
  }

  return {
    id,
    extensionPoint,
    control: { type: 'switch', label, defaultValue: control.defaultValue ?? false },
    action: {
      type: 'tool',
      tool,
      params: action.params as Record<string, unknown> | undefined,
    },
  };
}

function readExplicitEntries(
  source: ContributionManifestSource,
  diagnostics: AppContributionDiagnostic[],
): { components: ComponentContribution[]; controls: ControlContribution[] } {
  if (source.contributes === undefined) return { components: [], controls: [] };
  if (!isObject(source.contributes)) {
    diagnostics.push(diagnostic('invalid-structure', 'sero.app.contributes must be an object.'));
    return { components: [], controls: [] };
  }

  const components: ComponentContribution[] = [];
  const controls: ControlContribution[] = [];
  if (source.contributes.components !== undefined && !Array.isArray(source.contributes.components)) {
    diagnostics.push(diagnostic('invalid-structure', 'sero.app.contributes.components must be an array.'));
  } else if (Array.isArray(source.contributes.components)) {
    for (const value of source.contributes.components) {
      const parsed = parseComponent(value, diagnostics);
      if (parsed) components.push(parsed);
    }
  }
  if (source.contributes.controls !== undefined && !Array.isArray(source.contributes.controls)) {
    diagnostics.push(diagnostic('invalid-structure', 'sero.app.contributes.controls must be an array.'));
  } else if (Array.isArray(source.contributes.controls)) {
    for (const value of source.contributes.controls) {
      const parsed = parseControl(value, diagnostics);
      if (parsed) controls.push(parsed);
    }
  }
  return { components, controls };
}

function parseLegacyWidget(value: unknown): DashboardWidgetContribution | null {
  if (!isObject(value)) return null;
  const id = nonEmptyString(value.id);
  const name = nonEmptyString(value.name);
  const component = nonEmptyString(value.component);
  if (!id || !name || !component) return null;
  return {
    id,
    extensionPoint: 'ui.dashboard.widget',
    component,
    name,
    defaultSize: parseSize(value.defaultSize, { w: 2, h: 2 }),
    minSize: parseOptionalSize(value.minSize, { w: 1, h: 1 }),
    maxSize: parseOptionalSize(value.maxSize, { w: 4, h: 4 }),
    description: optionalString(value.description),
  };
}

function readLegacyEntries(source: ContributionManifestSource): AppContribution[] {
  const contributions: AppContribution[] = [];
  if (isObject(source.search)) {
    const component = nonEmptyString(source.search.component);
    if (component) contributions.push({
      id: 'global-search',
      extensionPoint: 'ui.global-search.panel',
      component,
      description: optionalString(source.search.description),
    });
  }
  if (isObject(source.explorerView)) {
    const component = nonEmptyString(source.explorerView.component);
    if (component) contributions.push({
      id: 'explorer-view',
      extensionPoint: 'ui.explorer.view',
      component,
      label: optionalString(source.explorerView.label),
      icon: optionalString(source.explorerView.icon),
    });
  }
  if (isObject(source.titlebar)) {
    const component = nonEmptyString(source.titlebar.component);
    if (component) contributions.push({
      id: 'titlebar-control',
      extensionPoint: 'ui.titlebar.control',
      component,
    });
  }
  if (Array.isArray(source.widgets)) {
    for (const value of source.widgets) {
      const widget = parseLegacyWidget(value);
      if (widget) contributions.push(widget);
    }
  }
  if (isObject(source.workspaceCreation)) {
    const label = nonEmptyString(source.workspaceCreation.label);
    const tool = nonEmptyString(source.workspaceCreation.tool);
    if (label && tool) contributions.push({
      id: 'workspace-creation',
      extensionPoint: 'workspace.create.option',
      control: {
        type: 'switch',
        label,
        defaultValue: source.workspaceCreation.defaultEnabled === true,
      },
      action: {
        type: 'tool',
        tool,
        params: isObject(source.workspaceCreation.params) ? source.workspaceCreation.params : undefined,
      },
    });
  }
  return contributions;
}

export function parseAppContributions(
  source: ContributionManifestSource,
  options: ParseAppContributionsOptions = {},
): ParsedAppContributions {
  const diagnostics: AppContributionDiagnostic[] = [];
  const explicit = readExplicitEntries(source, diagnostics);
  const explicitPoints = new Set<AppContribution['extensionPoint']>([
    ...explicit.components.map((entry) => entry.extensionPoint),
    ...explicit.controls.map((entry) => entry.extensionPoint),
  ]);
  const explicitWidgetIds = new Set<string>();
  for (const entry of explicit.components) {
    if (entry.extensionPoint === 'ui.dashboard.widget') {
      explicitWidgetIds.add(entry.id);
    }
  }
  const legacy = readLegacyEntries(source).filter((entry) => {
    if (entry.extensionPoint === 'ui.dashboard.widget') return !explicitWidgetIds.has(entry.id);
    return !explicitPoints.has(entry.extensionPoint);
  });

  const components: ComponentContribution[] = [];
  const controls: ControlContribution[] = [];
  // Uniqueness is per extension point: the host resolves a contribution only
  // inside its own point, so host-generated legacy ids ("global-search",
  // "explorer-view", and the rest) must not hide an author id in another point.
  const seenIdsByPoint = new Map<string, Set<string>>();
  const all = [...explicit.components, ...explicit.controls, ...legacy];
  for (const entry of all) {
    let seenIds = seenIdsByPoint.get(entry.extensionPoint);
    if (!seenIds) {
      seenIds = new Set<string>();
      seenIdsByPoint.set(entry.extensionPoint, seenIds);
    }
    if (seenIds.has(entry.id)) {
      diagnostics.push({
        code: 'duplicate-id',
        message: `Duplicate contribution id "${entry.id}" for extension point `
          + `"${entry.extensionPoint}" was ignored.`,
        contributionId: entry.id,
        extensionPoint: entry.extensionPoint,
      });
      continue;
    }
    seenIds.add(entry.id);
    if ('component' in entry) components.push(entry);
    else controls.push(entry);
  }

  return {
    contributions: {
      components: options.suppressUi ? [] : components,
      controls,
    },
    diagnostics,
  };
}
