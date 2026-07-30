// @vitest-environment jsdom

import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ExportSummary } from '../../../shared/export';
import { ExportNotifications } from './ExportNotifications';

const mocks = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  openSeroFile: vi.fn(),
  showItemInFolder: vi.fn(),
}));

vi.mock('@sero-ai/ui', () => ({
  Toaster: () => null,
}));
vi.mock('sonner', () => ({
  toast: {
    loading: mocks.loading,
    success: mocks.success,
    error: mocks.error,
  },
}));
vi.mock('@sero-ai/app-runtime', () => ({ openSeroFile: mocks.openSeroFile }));
vi.mock('../../lib/host-files', () => ({ showItemInFolder: mocks.showItemInFolder }));

function summary(overrides: Partial<ExportSummary> = {}): ExportSummary {
  return {
    id: 'exp-1',
    familyId: 'fam-1',
    versionId: 'ver-1',
    destination: 'downloads',
    status: 'running',
    createdAt: 1,
    ...overrides,
  };
}

function latestAction(): () => void {
  const options = mocks.success.mock.calls.at(-1)?.[1] as {
    action?: { onClick(): void };
  } | undefined;
  if (!options?.action) throw new Error('The notification has no action.');
  return options.action.onClick;
}

describe('export notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openSeroFile.mockResolvedValue(true);
    mocks.showItemInFolder.mockResolvedValue(undefined);
  });

  it('updates one notification from progress to a clickable Downloads result', async () => {
    const view = render(<ExportNotifications summary={summary()} workspaceId="ws-1" />);
    await waitFor(() => expect(mocks.loading).toHaveBeenCalledWith(
      'Exporting saved version…',
      expect.objectContaining({ id: 'exp-1' }),
    ));
    view.rerender(<ExportNotifications summary={summary()} workspaceId="ws-1" />);
    expect(mocks.loading).toHaveBeenCalledOnce();

    view.rerender(<ExportNotifications summary={summary({
      status: 'succeeded', path: '/Downloads/signal', completedAt: 2,
    })} workspaceId="ws-1" />);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(
      'Exported to Downloads',
      expect.objectContaining({ id: 'exp-1' }),
    ));
    latestAction()();
    await waitFor(() => expect(mocks.showItemInFolder).toHaveBeenCalledWith('/Downloads/signal'));
  });

  it('opens a workspace export in the Sero Explorer', async () => {
    render(<ExportNotifications summary={summary({
      destination: 'workspace', status: 'succeeded', path: '/workspace/signal', completedAt: 2,
    })} workspaceId="ws-1" />);
    await waitFor(() => expect(mocks.success).toHaveBeenCalledOnce());

    latestAction()();
    await waitFor(() => expect(mocks.openSeroFile).toHaveBeenCalledWith(
      'ws-1',
      '/workspace/signal/index.html',
    ));
    expect(mocks.showItemInFolder).not.toHaveBeenCalled();
  });

  it('shows export failures without an open action', async () => {
    render(<ExportNotifications summary={summary({
      status: 'failed', error: 'The export could not be written.', completedAt: 2,
    })} workspaceId="ws-1" />);

    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith(
      'The export could not be written.',
      expect.objectContaining({ id: 'exp-1' }),
    ));
    expect(mocks.success).not.toHaveBeenCalled();
  });
});
