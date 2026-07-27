/**
 * Adapter registry and the local placeholder used when generation is
 * unavailable. A failure never fails the whole variant: the design keeps a
 * local placeholder and exposes asset-only retry.
 */

import { createFalAdapter } from './adapters/fal';
import type { AssetCapability, AssetGenerationProvider } from './contract';

export class AssetProviderRegistry {
  private readonly providers = new Map<string, AssetGenerationProvider>();

  constructor(providers: AssetGenerationProvider[] = []) {
    providers.forEach((provider) => this.register(provider));
  }

  register(provider: AssetGenerationProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): AssetGenerationProvider | null {
    return this.providers.get(id) ?? null;
  }

  /** The first registered provider that advertises `capability`. */
  forCapability(capability: AssetCapability): AssetGenerationProvider | null {
    for (const provider of this.providers.values()) {
      if (provider.capabilities().includes(capability)) return provider;
    }
    return null;
  }

  ids(): string[] {
    return [...this.providers.keys()];
  }
}

export function createDefaultRegistry(): AssetProviderRegistry {
  return new AssetProviderRegistry([createFalAdapter()]);
}

/**
 * A deterministic local placeholder. It is a real image file so previews,
 * Gallery snapshots and exports stay self-contained even when no provider is
 * reachable.
 */
export function placeholderSvg(label: string): string {
  const safe = label.replace(/[<>&]/g, '').slice(0, 48);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480" role="img" aria-label="${safe}">
  <rect width="640" height="480" fill="currentColor" fill-opacity="0.06"/>
  <rect x="0.5" y="0.5" width="639" height="479" fill="none" stroke="currentColor" stroke-opacity="0.25" stroke-dasharray="6 6"/>
  <text x="320" y="240" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="20" fill="currentColor" fill-opacity="0.6">${safe}</text>
  <text x="320" y="268" text-anchor="middle" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13" fill="currentColor" fill-opacity="0.4">Artwork not generated</text>
</svg>
`;
}
