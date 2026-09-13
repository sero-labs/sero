import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sero-ai/app-runtime', () => ({ openSeroApp: vi.fn() }));

import { PendingQuestionCard } from './PendingQuestionCard';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import type { UserFeedbackPendingQuestion } from '@/types/ipc';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const LONG_COMMAND = Array.from({ length: 120 }, (_, index) => `echo line-${index}`).join('\n');

function permissionQuestion(command: string): UserFeedbackPendingQuestion {
  return {
    id: 'permission-1',
    type: 'permission',
    toolCallId: 'call-1',
    timestamp: new Date().toISOString(),
    questions: [
      {
        id: 'perm',
        label: 'Permission',
        prompt: `⚠️ Dangerous command detected:\n\n  ${command}\n\nAllow this command to run?`,
        options: [
          { value: 'allow', label: 'Allow' },
          { value: 'block', label: 'Block' },
        ],
        allowOther: false,
      },
    ],
  };
}

describe('PendingQuestionCard approval layout', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    useUserFeedbackStore.setState({ pending: new Map() });
  });

  async function renderPermission(command: string): Promise<void> {
    useUserFeedbackStore.setState({
      pending: new Map([['permission-1', permissionQuestion(command)]]),
    });
    await act(async () => {
      root?.render(<PendingQuestionCard />);
    });
  }

  function allowButton(): HTMLButtonElement | undefined {
    return Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Allow');
  }

  it('bounds the card and scrolls a long command while the actions stay outside the scroll region', async () => {
    await renderPermission(LONG_COMMAND);

    const code = container.querySelector('code');
    expect(code?.textContent).toContain('echo line-0');
    expect(code?.textContent).toContain('echo line-119');

    const scrollRegion = code?.closest('.overflow-y-auto');
    expect(scrollRegion).not.toBeNull();

    const card = scrollRegion?.parentElement;
    // A max height, not a fixed one: short messages stay readable at their natural size.
    expect(card?.className).toContain('max-h-[');
    expect(card?.className).toContain('overflow-hidden');

    const allow = allowButton();
    expect(allow).toBeDefined();
    expect(scrollRegion?.contains(allow as Node)).toBe(false);
    expect(card?.contains(allow as Node)).toBe(true);
  });

  it('renders a multiline command without the prompt framing text', async () => {
    await renderPermission('rm -rf dist\nrm -rf build');

    const code = container.querySelector('code');
    expect(code?.textContent).toContain('rm -rf dist');
    expect(code?.textContent).toContain('rm -rf build');
    expect(code?.textContent).not.toContain('Dangerous command detected');
    expect(code?.textContent).not.toContain('Allow this command to run?');
  });
});
