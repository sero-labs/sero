import type { PluginMeta } from '@sero-ai/common';

const PLUGIN_CATEGORIES = [
  'productivity',
  'developer-tools',
  'entertainment',
  'integrations',
  'finance',
  'health',
  'creative',
  'utilities',
] satisfies PluginMeta['category'][];

export interface ParsedPluginMetaResult {
  meta: PluginMeta | null;
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function hasPluginDeclaration(pkgJson: { sero?: { plugin?: unknown } }): boolean {
  return isRecord(pkgJson.sero) && Object.prototype.hasOwnProperty.call(pkgJson.sero, 'plugin');
}

function isPluginCategory(value: string): value is PluginMeta['category'] {
  return PLUGIN_CATEGORIES.includes(value as PluginMeta['category']);
}

export interface PluginCompatibilityRequirements {
  minSeroVersion?: string;
  requiredHostCapabilities?: string[];
  /** Set only when the plugin ships a federated UI — see compatibility.ts. */
  federatedUi?: { runtimeAbi?: number };
}

export function extractPluginCompatibilityRequirements(
  plugin: unknown,
  options: { expectsFederatedUi: boolean },
): PluginCompatibilityRequirements | null {
  if (!isRecord(plugin)) {
    // Absent or malformed `sero.plugin` is itself the "predates the ABI" signal,
    // so a plugin that ships a UI still has to be checked — `sero.plugin` is
    // optional for install, and failing open here would mount the very bundle
    // the ABI check exists to refuse.
    return options.expectsFederatedUi ? { federatedUi: {} } : null;
  }

  const requirements: PluginCompatibilityRequirements = {};

  if (typeof plugin.minSeroVersion === 'string') {
    const minSeroVersion = plugin.minSeroVersion.trim();
    if (minSeroVersion) {
      requirements.minSeroVersion = minSeroVersion;
    }
  }

  if (Array.isArray(plugin.requiredHostCapabilities)) {
    const requiredHostCapabilities = plugin.requiredHostCapabilities
      .filter((capability): capability is string => typeof capability === 'string')
      .map((capability) => capability.trim())
      .filter(Boolean);

    if (requiredHostCapabilities.length > 0) {
      requirements.requiredHostCapabilities = requiredHostCapabilities;
    }
  }

  if (options.expectsFederatedUi) {
    const runtimeAbi = typeof plugin.runtimeAbi === 'number' && Number.isInteger(plugin.runtimeAbi)
      ? plugin.runtimeAbi
      : undefined;
    // Set the key even when the value is missing: an absent `runtimeAbi` is
    // itself the signal that the bundle predates the ABI.
    requirements.federatedUi = { runtimeAbi };
  }

  // Always return requirements for a declared plugin — a UI plugin has to be ABI
  // checked even when it states no other requirement.
  return requirements;
}

export function parsePluginMeta(plugin: unknown): ParsedPluginMetaResult {
  if (plugin === undefined) {
    return { meta: null, warnings: [] };
  }
  if (!isRecord(plugin)) {
    return {
      meta: null,
      warnings: ['`sero.plugin` must be an object'],
    };
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  const categoryValue = typeof plugin.category === 'string' ? plugin.category.trim() : '';
  let category: PluginMeta['category'] | null = null;
  if (!categoryValue) {
    errors.push('`sero.plugin.category` is required');
  } else if (!isPluginCategory(categoryValue)) {
    errors.push(
      '`sero.plugin.category` must be one of ' +
      PLUGIN_CATEGORIES.map((value) => `"${value}"`).join(', '),
    );
  } else {
    category = categoryValue;
  }

  const tags: string[] = [];
  if (!Array.isArray(plugin.tags)) {
    errors.push('`sero.plugin.tags` must be a non-empty string[]');
  } else {
    plugin.tags.forEach((tag, index) => {
      if (typeof tag !== 'string') {
        warnings.push(`ignored non-string \`sero.plugin.tags[${index}]\``);
        return;
      }
      const trimmed = tag.trim();
      if (!trimmed) {
        warnings.push(`ignored empty \`sero.plugin.tags[${index}]\``);
        return;
      }
      tags.push(trimmed);
    });
    if (tags.length === 0) {
      errors.push('`sero.plugin.tags` must include at least one non-empty string');
    }
  }

  if (errors.length > 0 || !category) {
    return { meta: null, warnings: [...errors, ...warnings] };
  }

  const parsed: PluginMeta = {
    category,
    tags,
  };

  if (typeof plugin.minSeroVersion === 'string') {
    const minSeroVersion = plugin.minSeroVersion.trim();
    if (minSeroVersion) {
      parsed.minSeroVersion = minSeroVersion;
    } else {
      warnings.push('ignored empty `sero.plugin.minSeroVersion`');
    }
  } else if (plugin.minSeroVersion !== undefined) {
    warnings.push('ignored non-string `sero.plugin.minSeroVersion`');
  }

  if (Array.isArray(plugin.requiredHostCapabilities)) {
    const requiredHostCapabilities: string[] = [];
    plugin.requiredHostCapabilities.forEach((capability, index) => {
      if (typeof capability !== 'string') {
        warnings.push(`ignored non-string \`sero.plugin.requiredHostCapabilities[${index}]\``);
        return;
      }
      const trimmed = capability.trim();
      if (!trimmed) {
        warnings.push(`ignored empty \`sero.plugin.requiredHostCapabilities[${index}]\``);
        return;
      }
      requiredHostCapabilities.push(trimmed);
    });
    if (requiredHostCapabilities.length > 0) {
      parsed.requiredHostCapabilities = requiredHostCapabilities;
    }
  } else if (plugin.requiredHostCapabilities !== undefined) {
    warnings.push('ignored invalid `sero.plugin.requiredHostCapabilities`; expected string[]');
  }

  if (typeof plugin.runtimeAbi === 'number' && Number.isInteger(plugin.runtimeAbi)) {
    parsed.runtimeAbi = plugin.runtimeAbi;
  } else if (plugin.runtimeAbi !== undefined) {
    warnings.push('ignored non-integer `sero.plugin.runtimeAbi`');
  }

  if (typeof plugin.preBuilt === 'boolean') {
    parsed.preBuilt = plugin.preBuilt;
  } else if (plugin.preBuilt !== undefined) {
    warnings.push('ignored non-boolean `sero.plugin.preBuilt`');
  }

  if (typeof plugin.bundleExtensions === 'boolean') {
    parsed.bundleExtensions = plugin.bundleExtensions;
  } else if (plugin.bundleExtensions !== undefined) {
    warnings.push('ignored non-boolean `sero.plugin.bundleExtensions`');
  }

  if (Array.isArray(plugin.extensionExternals)) {
    const extensionExternals: string[] = [];
    plugin.extensionExternals.forEach((external, index) => {
      if (typeof external !== 'string') {
        warnings.push(`ignored non-string \`sero.plugin.extensionExternals[${index}]\``);
        return;
      }
      const trimmed = external.trim();
      if (!trimmed) {
        warnings.push(`ignored empty \`sero.plugin.extensionExternals[${index}]\``);
        return;
      }
      extensionExternals.push(trimmed);
    });
    if (extensionExternals.length > 0) {
      parsed.extensionExternals = extensionExternals;
    }
  } else if (plugin.extensionExternals !== undefined) {
    warnings.push('ignored invalid `sero.plugin.extensionExternals`; expected string[]');
  }

  if (typeof plugin.bridgeTools === 'boolean') {
    parsed.bridgeTools = plugin.bridgeTools;
  } else if (Array.isArray(plugin.bridgeTools)) {
    const bridgeTools: string[] = [];
    plugin.bridgeTools.forEach((toolName, index) => {
      if (typeof toolName !== 'string') {
        warnings.push(`ignored non-string \`sero.plugin.bridgeTools[${index}]\``);
        return;
      }
      const trimmed = toolName.trim();
      if (!trimmed) {
        warnings.push(`ignored empty \`sero.plugin.bridgeTools[${index}]\``);
        return;
      }
      bridgeTools.push(trimmed);
    });
    if (plugin.bridgeTools.length === 0 || bridgeTools.length > 0) {
      parsed.bridgeTools = bridgeTools;
    } else {
      warnings.push('ignored invalid `sero.plugin.bridgeTools` array');
    }
  } else if (plugin.bridgeTools !== undefined) {
    warnings.push('ignored invalid `sero.plugin.bridgeTools`; expected boolean or string[]');
  }

  return { meta: parsed, warnings };
}

export function warnInvalidPluginMeta(packagePath: string, warnings: string[]): void {
  if (warnings.length === 0) return;
  console.warn(
    `[app-discovery] Ignoring invalid sero.plugin metadata in "${packagePath}": ${warnings.join('; ')}`,
  );
}
