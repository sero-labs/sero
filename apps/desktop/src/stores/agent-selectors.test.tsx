// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { useAgentStore } from './agent';
import { useFocusedWorkspaceId } from './agent-selectors';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const initialState = useAgentStore.getState();

function WorkspaceProbe({ onRender }: { onRender: () => void }) {
  const workspaceId = useFocusedWorkspaceId();
  onRender();
  return <span>{workspaceId}</span>;
}

describe('agent selectors', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useAgentStore.setState({
      ...initialState,
      focusedSessionId: 'session-1',
      agents: {
        'session-1': {
          sessionId: 'session-1',
          sessionPath: '/tmp/session-1.jsonl',
          workspaceId: 'workspace-1',
          messages: [],
          isStreaming: false,
          retry: null,
          error: null,
          commands: [],
          modelState: null,
        },
      },
    }, true);

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    useAgentStore.setState(initialState, true);
  });

  it('does not re-render workspace consumers for streaming-only agent updates', async () => {
    let renderCount = 0;

    await act(async () => {
      root.render(<WorkspaceProbe onRender={() => { renderCount += 1; }} />);
    });

    expect(container.textContent).toBe('workspace-1');
    expect(renderCount).toBe(1);

    await act(async () => {
      useAgentStore.setState((state) => ({
        agents: {
          ...state.agents,
          'session-1': {
            ...state.agents['session-1']!,
            isStreaming: true,
            messages: [{
              id: 'assistant-1',
              type: 'assistant',
              text: 'Hello',
              isStreaming: true,
            }],
          },
        },
      }));
    });

    expect(renderCount).toBe(1);
  });
});
