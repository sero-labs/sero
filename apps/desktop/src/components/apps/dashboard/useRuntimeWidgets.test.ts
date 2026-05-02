// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { getRuntimeWidgets, registerWidget } from '@sero-ai/app-runtime';

describe('runtime widget registry', () => {
  it('returns a stable snapshot until the registry changes', () => {
    const initial = getRuntimeWidgets();

    expect(getRuntimeWidgets()).toBe(initial);

    const unregister = registerWidget({
      appId: 'dashboard-test-app',
      widgetId: 'stable-snapshot',
      name: 'Stable Snapshot',
      component: () => null,
      defaultSize: { w: 2, h: 2 },
    });

    const withWidget = getRuntimeWidgets();
    expect(withWidget).not.toBe(initial);
    expect(getRuntimeWidgets()).toBe(withWidget);
    expect(withWidget.some((widget) => widget.appId === 'dashboard-test-app')).toBe(true);

    unregister();

    const afterUnregister = getRuntimeWidgets();
    expect(afterUnregister).not.toBe(withWidget);
    expect(getRuntimeWidgets()).toBe(afterUnregister);
    expect(afterUnregister.some((widget) => widget.appId === 'dashboard-test-app')).toBe(false);
  });
});
