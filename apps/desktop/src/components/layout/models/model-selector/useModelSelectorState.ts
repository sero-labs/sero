import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAgentStore } from '@/stores/agent';
import { useFocusedModelState, useFocusedSessionId } from '@/stores/agent-selectors';
import { useModelPreferences } from '@/stores/model-preferences';
import { findGroup, findModel, THINKING_LABELS } from '@sero-ai/common';
import { applyPreferences, buildFavourites, filterGroups } from './filtering';

export function useModelSelectorState() {
  const [open, setOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [isPrimed, setIsPrimed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const sessionId = useFocusedSessionId();
  const focusedModelState = useFocusedModelState();
  const setModel = useAgentStore((state) => state.setModel);
  const setThinkingLevel = useAgentStore((state) => state.setThinkingLevel);
  const preferences = useModelPreferences();

  const favouriteKeys = useMemo(
    () => new Set(preferences.favouriteModels),
    [preferences.favouriteModels],
  );
  const hiddenModelKeys = useMemo(
    () => new Set(preferences.hiddenModels),
    [preferences.hiddenModels],
  );
  const hiddenProviderKeys = useMemo(
    () => new Set(preferences.hiddenProviders),
    [preferences.hiddenProviders],
  );

  const allGroups = focusedModelState?.availableModels ?? [];
  const selectedProvider = focusedModelState?.model.provider ?? null;
  const selectedModelId = focusedModelState?.model.modelId ?? null;
  const activeSelectedModel = focusedModelState
    ? findModel(
        allGroups,
        focusedModelState.model.provider,
        focusedModelState.model.modelId,
      )
    : null;
  const activeSelectedGroup = focusedModelState
    ? findGroup(
        allGroups,
        focusedModelState.model.provider,
        focusedModelState.model.modelId,
      )
    : null;
  const hasActiveAvailableModel = Boolean(activeSelectedModel && activeSelectedGroup);
  const triggerLabel = allGroups.length === 0
    ? 'No models available'
    : hasActiveAvailableModel
      ? activeSelectedModel?.name ?? 'Select model'
      : 'Select model';
  const currentThinkingLevel = focusedModelState?.thinkingLevel ?? 'off';
  const triggerThinkingLabel = hasActiveAvailableModel && activeSelectedModel?.reasoning && currentThinkingLevel !== 'off'
    ? THINKING_LABELS[currentThinkingLevel]
    : null;

  const visibleGroups = useMemo(
    () => applyPreferences(allGroups, hiddenModelKeys, hiddenProviderKeys),
    [allGroups, hiddenModelKeys, hiddenProviderKeys],
  );
  const filteredGroups = useMemo(
    () => filterGroups(visibleGroups, filter),
    [visibleGroups, filter],
  );
  const totalFiltered = useMemo(
    () => filteredGroups.reduce((count, group) => count + group.models.length, 0),
    [filteredGroups],
  );
  const favourites = useMemo(
    () => (filter ? [] : buildFavourites(visibleGroups, preferences.favouriteModels)),
    [filter, preferences.favouriteModels, visibleGroups],
  );

  const primePopover = useCallback(() => {
    setIsPrimed(true);
  }, []);

  useEffect(() => {
    if (isPrimed) return;
    let idleId: number | null = null;
    let timeoutId: ReturnType<typeof globalThis.setTimeout> | null = null;
    const requestIdle = window.requestIdleCallback?.bind(window);
    if (requestIdle) {
      idleId = requestIdle(() => setIsPrimed(true), { timeout: 250 });
    } else {
      timeoutId = globalThis.setTimeout(() => setIsPrimed(true), 120);
    }
    return () => {
      if (idleId !== null) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        globalThis.clearTimeout(timeoutId);
      }
    };
  }, [isPrimed]);

  const handleModelSelect = useCallback(
    (provider: string, modelId: string) => {
      if (!sessionId) return;
      setModel(sessionId, provider, modelId);
    },
    [sessionId, setModel],
  );

  const handleThinkingSelect = useCallback(
    (level: string) => {
      if (!sessionId) return;
      setThinkingLevel(sessionId, level);
    },
    [sessionId, setThinkingLevel],
  );

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (nextOpen) {
      setIsPrimed(true);
      setFilter('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
    setOpen(nextOpen);
  }, []);

  const handleOpenManager = useCallback(() => {
    setOpen(false);
    setManagerOpen(true);
  }, []);

  return {
    activeSelectedModel,
    allGroups,
    favouriteKeys,
    favourites,
    filter,
    filteredGroups,
    focusedModelState,
    handleModelSelect,
    handleOpenChange,
    handleOpenManager,
    handleThinkingSelect,
    hasActiveAvailableModel,
    inputRef,
    isPrimed,
    managerOpen,
    open,
    primePopover,
    selectedModelId,
    selectedProvider,
    setFilter,
    setManagerOpen,
    supportsXhigh: focusedModelState?.supportsXhigh ?? false,
    thinkingLevels: focusedModelState?.availableThinkingLevels ?? [],
    totalFiltered,
    triggerLabel,
    triggerProviderDisplayName: activeSelectedGroup?.displayName ?? null,
    triggerProviderLogo: activeSelectedGroup?.logo ?? null,
    triggerThinkingLabel,
  };
}
