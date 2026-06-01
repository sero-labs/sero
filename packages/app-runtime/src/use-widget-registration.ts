/**
 * useWidgetRegistration — hook for apps to register widgets at runtime.
 *
 * Registers a widget component for the current renderer session.
 * This complements static manifest declarations in package.json.
 *
 * Usage:
 * ```tsx
 * import { useWidgetRegistration } from '@sero-ai/app-runtime';
 * import { MyWidget } from './widgets/MyWidget';
 *
 * export function MyApp() {
 *   useWidgetRegistration({
 *     widgetId: 'summary',
 *     name: 'Summary',
 *     component: MyWidget,
 *     defaultSize: { w: 2, h: 2 },
 *   });
 *   // ...
 * }
 * ```
 */

import { useContext, useEffect } from 'react';
import type { ComponentType } from 'react';
import { AppContext } from './context';
import { registerWidget } from './widget-registry';

interface WidgetRegistrationOptions {
  /** Unique widget identifier within the app. */
  widgetId: string;
  /** Display name. */
  name: string;
  /** The React component to render. */
  component: ComponentType;
  /** Default grid size. */
  defaultSize: { w: number; h: number };
  /** Minimum grid size. */
  minSize?: { w: number; h: number };
  /** Maximum grid size. */
  maxSize?: { w: number; h: number };
  /** Optional description. */
  description?: string;
}

/**
 * Register a widget component for the current app.
 *
 * Registration is intentionally sticky for the renderer session so a
 * dashboard widget can keep rendering after the full app view unmounts.
 */
export function useWidgetRegistration(options: WidgetRegistrationOptions): void {
  const ctx = useContext(AppContext);
  const appId = ctx?.appId;
  const { component, defaultSize, description, maxSize, minSize, name, widgetId } = options;
  const { h: defaultHeight, w: defaultWidth } = defaultSize;
  const minHeight = minSize?.h;
  const minWidth = minSize?.w;
  const maxHeight = maxSize?.h;
  const maxWidth = maxSize?.w;

  // Acceptable useEffect — registration into a shared external registry
  useEffect(() => {
    if (!appId) return;

    registerWidget({
      appId,
      widgetId,
      name,
      component,
      defaultSize: { w: defaultWidth, h: defaultHeight },
      minSize: minWidth === undefined || minHeight === undefined ? undefined : { w: minWidth, h: minHeight },
      maxSize: maxWidth === undefined || maxHeight === undefined ? undefined : { w: maxWidth, h: maxHeight },
      description,
    });
  }, [
    appId,
    widgetId,
    name,
    component,
    defaultHeight,
    defaultWidth,
    minHeight,
    minWidth,
    maxHeight,
    maxWidth,
    description,
  ]);
}
