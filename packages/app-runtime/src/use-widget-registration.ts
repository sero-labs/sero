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

  // Acceptable useEffect — registration into a shared external registry
  useEffect(() => {
    if (!appId) return;

    registerWidget({
      appId,
      widgetId: options.widgetId,
      name: options.name,
      component: options.component,
      defaultSize: options.defaultSize,
      minSize: options.minSize,
      maxSize: options.maxSize,
      description: options.description,
    });
  }, [
    appId,
    options.widgetId,
    options.name,
    options.component,
    options.defaultSize.w,
    options.defaultSize.h,
    options.minSize?.w,
    options.minSize?.h,
    options.maxSize?.w,
    options.maxSize?.h,
    options.description,
  ]);
}
