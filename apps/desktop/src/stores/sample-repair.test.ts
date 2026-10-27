// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSampleRepairStore } from './sample-repair';
import { useProfileStore } from './profiles';

const open = vi.hoisted(() => vi.fn(async () => true));
vi.mock('@sero-ai/app-runtime', () => ({ openSeroApp: open }));
const invoke = vi.fn();
const config = vi.fn();
const onboarding = vi.fn();
const tiers = { HIGH: { provider: 'test', modelId: 'model' } };
beforeEach(() => {
  useSampleRepairStore.setState(useSampleRepairStore.getInitialState(), true);
  useProfileStore.setState({ activeProfile: { id: 'profile', name: 'Test', path: '/test', createdAt: '', isActive: true, canDeleteFiles: false } });
  invoke.mockReset(); open.mockClear();
  config.mockResolvedValue({ tiers });
  onboarding.mockResolvedValue({ needed: false, hasAnyUsableModels: true });
  Object.defineProperty(window, 'sero', { configurable: true, value: { modelConfig: { get: config }, onboarding: { getState: onboarding }, appAgent: { invokeTool: invoke } } });
});

describe('sample launch', () => {
  it('does not prepare before onboarding is complete or without a usable provider', async () => {
    for (const state of [{ needed: true, hasAnyUsableModels: true }, { needed: false, hasAnyUsableModels: false }]) {
      onboarding.mockResolvedValue(state);
      await useSampleRepairStore.getState().load();
      await useSampleRepairStore.getState().launch();
    }
    expect(invoke).not.toHaveBeenCalled();
  });
  it('opens an existing sample without resuming stopped work', async () => {
    await useSampleRepairStore.getState().load();
    invoke.mockResolvedValue({ text: 'existing', details: { ok: true, projectId: 'saved', needsStart: false } });
    await useSampleRepairStore.getState().launch();
    expect(open).toHaveBeenCalledWith('architect', { projectId: 'saved' });
    expect(invoke).toHaveBeenCalledTimes(1);
  });
  it('uses the existing start approval only for a newly prepared project', async () => {
    await useSampleRepairStore.getState().load();
    invoke.mockResolvedValueOnce({ text: 'new', details: { ok: true, projectId: 'new', needsStart: true } }).mockResolvedValueOnce({ text: 'declined', details: { ok: false } });
    await useSampleRepairStore.getState().launch();
    expect(invoke).toHaveBeenLastCalledWith('architect', 'global', 'architect_projects', { action: 'resume', projectId: 'new' });
    expect(useSampleRepairStore.getState()).toMatchObject({ projectId: 'new', error: 'declined', busy: false });
  });
  it('clears old launch state when profiles switch and ignores its eventual response', async () => {
    await useSampleRepairStore.getState().load();
    let complete!: (value: unknown) => void;
    invoke.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const pending = useSampleRepairStore.getState().launch();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    useProfileStore.setState({ activeProfile: { id: 'other', name: 'Other', path: '/other', createdAt: '', isActive: true, canDeleteFiles: false } });
    await useSampleRepairStore.getState().load();
    complete({ text: 'old', details: { ok: true, projectId: 'old', needsStart: true } });
    await pending;
    expect(useSampleRepairStore.getState()).toMatchObject({ profileId: 'other', busy: false, projectId: null, error: null });
    expect(open).not.toHaveBeenCalled();
  });
  it('requires another review if selected models changed after disclosure', async () => {
    await useSampleRepairStore.getState().load();
    config.mockResolvedValue({ tiers: { HIGH: { provider: 'different', modelId: 'model' } } });
    await useSampleRepairStore.getState().launch();
    expect(invoke).not.toHaveBeenCalled();
    expect(useSampleRepairStore.getState().error).toContain('selected models changed');
  });
});
