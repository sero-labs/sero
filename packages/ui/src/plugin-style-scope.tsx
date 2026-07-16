import {
  createContext,
  useContext,
  useInsertionEffect,
  useMemo,
  type Context,
  type ReactNode,
} from 'react';

interface PluginStyleScopeValue {
  pluginId: string;
  portalContainer: HTMLDivElement | null;
}

declare global {
  var __sero_plugin_style_scope_context__: Context<PluginStyleScopeValue | null> | undefined;
}

const PluginStyleScopeContext = globalThis.__sero_plugin_style_scope_context__
  ?? createContext<PluginStyleScopeValue | null>(null);

globalThis.__sero_plugin_style_scope_context__ = PluginStyleScopeContext;

export interface PluginStyleScopeProps {
  children: ReactNode;
  pluginId: string;
  surfaceId: string;
}

export function PluginStyleScope({ children, pluginId, surfaceId }: PluginStyleScopeProps) {
  const portalContainer = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const container = document.createElement('div');
    container.dataset.seroPlugin = pluginId;
    container.dataset.seroPluginPortals = surfaceId;
    return container;
  }, [pluginId, surfaceId]);

  useInsertionEffect(() => {
    if (!portalContainer) return undefined;
    document.body.append(portalContainer);
    return () => portalContainer.remove();
  }, [portalContainer]);

  const value = useMemo(
    () => ({ pluginId, portalContainer }),
    [pluginId, portalContainer],
  );

  return (
    <PluginStyleScopeContext.Provider value={value}>
      {children}
    </PluginStyleScopeContext.Provider>
  );
}

export function usePluginPortalContainer(): HTMLElement | undefined {
  return useContext(PluginStyleScopeContext)?.portalContainer ?? undefined;
}
