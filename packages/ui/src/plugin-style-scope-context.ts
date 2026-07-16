import { createContext, useContext, type Context } from 'react';

export interface PluginStyleScopeValue {
  pluginId: string;
  portalContainer: HTMLDivElement | null;
}

declare global {
  var __sero_plugin_style_scope_context__: Context<PluginStyleScopeValue | null> | undefined;
}

// A single shared context instance across every federated copy of @sero-ai/ui,
// so a plugin's portal primitives read the container the host provider set.
export const PluginStyleScopeContext = globalThis.__sero_plugin_style_scope_context__
  ?? createContext<PluginStyleScopeValue | null>(null);

globalThis.__sero_plugin_style_scope_context__ = PluginStyleScopeContext;

export function usePluginPortalContainer(): HTMLElement | undefined {
  return useContext(PluginStyleScopeContext)?.portalContainer ?? undefined;
}
