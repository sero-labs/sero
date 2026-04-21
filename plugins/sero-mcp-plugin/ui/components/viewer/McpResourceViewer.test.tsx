// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { McpResourceViewer } from './McpResourceViewer';

describe('McpResourceViewer', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('grants the loopback viewer shell same-origin access while keeping it sandboxed', async () => {
    await act(async () => {
      root?.render(
        <McpResourceViewer
          preview={null}
          loading={false}
          kind="resource"
          session={{
            sessionId: 'session-1',
            viewerUrl: 'http://127.0.0.1:43123/?session=session-1',
            resourceUri: 'ui://demo/dashboard',
            kind: 'resource',
          }}
        />,
      );
    });

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('sandbox')).toBe(
      'allow-same-origin allow-scripts allow-forms allow-popups allow-downloads',
    );
  });
});
