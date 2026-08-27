// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthEvent } from '@sero-ai/a2a';
import { useNodesStore } from '@/stores/nodes';
import { NodeAuthInteraction } from './NodeAuthInteraction';

describe('NodeAuthInteraction', () => {
  let container: HTMLDivElement;
  let root: Root;
  const respond = vi.fn();
  const cancel = vi.fn();
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    useNodesStore.setState({ respondAuth: respond, cancelLogin: cancel, authEvents: {} });
  });
  afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.clearAllMocks(); });

  it('renders OAuth URL and device-code instructions received from the node', async () => {
    const events = [
      { type: 'auth', url: 'https://provider.test/login', instructions: 'Continue' },
      { type: 'device_code', verificationUri: 'https://provider.test/device', userCode: 'ABCD', expiresInSeconds: 600 },
    ] satisfies AuthEvent[];
    for (const event of events) {
      useNodesStore.setState({ authEvents: { node: event } });
      await act(async () => root.render(<NodeAuthInteraction nodeId="node" />));
      expect(container.textContent).toContain(event.type === 'auth' ? 'Continue' : 'ABCD');
      expect(container.querySelector('a')?.href).toBe(event.type === 'auth' ? event.url : event.verificationUri);
    }
  });

  it('renders prompt, manual, and select interactions with cancel available', async () => {
    const events = [
      { type: 'prompt', message: 'Team name?' },
      { type: 'manual_input', prompt: 'Paste callback code' },
      { type: 'select', message: 'Choose account', options: [{ id: 'one', label: 'Account one' }] },
    ] satisfies AuthEvent[];
    for (const event of events) {
      useNodesStore.setState({ authEvents: { node: event } });
      await act(async () => root.render(<NodeAuthInteraction nodeId="node" />));
      expect(container.textContent).toContain(event.type === 'manual_input' ? event.prompt : event.message);
      expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Cancel')).toBe(true);
    }
  });
});
