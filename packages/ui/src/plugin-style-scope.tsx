import { useInsertionEffect, useMemo, type ReactNode } from 'react';
import { PluginStyleScopeContext } from './plugin-style-scope-context';

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
