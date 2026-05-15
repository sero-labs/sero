/**
 * Renderer-side bridge for app control.
 *
 * Exposes `window.__appControl` — a set of functions that the main process
 * calls via `webContents.executeJavaScript()`. Reads/writes the Zustand
 * app store and delegates DOM operations to renderer-side helpers.
 */

import { useAppStore } from '@/stores/app';
import { useBrowserStore } from '@/stores/browser';
import { useEditorBridge } from '@/stores/editor-bridge';
import { useExplorerStore } from '@/stores/explorer';
import { useWorkspaceStore } from '@/stores/workspace';
import { openApp } from '@/lib/open-app';
import { executeAppInteraction, getAppPanelRect } from '@/lib/app-control/dom-interactions';
import type {
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
} from '@/types/ipc';

// ── Recording State ──────────────────────────────────────────

let recordingActive = false;
let recordingStartedAt: string | null = null;

// ── Bridge Interface ─────────────────────────────────────────

interface AppControlBridge {
  getList(): AppControlEntry[];
  getActive(): string;
  openApp(appId: string): boolean;
  getInfo(appId: string): AppControlEntry | null;
  openFile(workspaceId: string, filePath: string): boolean;
  getAppRect(): AppPanelRect | null;
  getBrowserCaptureTarget(): { workspaceId: string; tabId: string; rect: AppPanelRect } | null;
  interact(params: AppInteractionParams): Promise<AppInteractionResult>;
  recordStart(): boolean;
  recordStop(): boolean;
  getRecordingStatus(): AppRecordingStatus;
  /** Open a dev server URL as an in-app preview tab. */
  openDevPreview(url: string): boolean;
}

declare global {
  interface Window {
    __appControl?: AppControlBridge;
  }
}

function toAppControlEntry(app: {
  id: string;
  label: string;
  icon: string;
  builtin: boolean;
  manifest: { scope?: string; component?: string | null } | null;
}): AppControlEntry {
  return {
    id: app.id,
    name: app.label,
    icon: app.icon,
    builtin: app.builtin,
    scope: (app.manifest?.scope as 'global' | 'workspace') ?? null,
    hasUI: app.builtin || !!app.manifest?.component,
  };
}

/**
 * Initialize the `window.__appControl` bridge.
 * Call once from App.tsx useEffect. Returns cleanup function.
 */
export function initAppControlBridge(): () => void {
  window.__appControl = {
    getList: () => useAppStore.getState().apps.map(toAppControlEntry),
    getActive: () => useAppStore.getState().activeApp,
    openApp(appId) {
      const state = useAppStore.getState();
      if (!state.apps.some((app) => app.id === appId)) return false;
      openApp(appId);
      return true;
    },
    getInfo(appId) {
      const app = useAppStore.getState().apps.find((entry) => entry.id === appId);
      return app ? toAppControlEntry(app) : null;
    },
    openFile(workspaceId: string, filePath: string) {
      const state = useAppStore.getState();
      if (state.activeApp !== 'explorer') state.setActiveApp('explorer');
      useEditorBridge.getState().requestOpenFile(workspaceId, filePath);
      return true;
    },
    getAppRect: getAppPanelRect,
    getBrowserCaptureTarget() {
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId;
      if (!workspaceId || useAppStore.getState().activeApp !== 'explorer') return null;
      if (useExplorerStore.getState().get(workspaceId).activePanel !== 'browser') return null;
      const tabId = useBrowserStore.getState().activeTabIds[workspaceId];
      const rect = getAppPanelRect();
      return tabId && rect ? { workspaceId, tabId, rect } : null;
    },
    interact: executeAppInteraction,
    recordStart() {
      if (recordingActive) return false;
      if (!getAppPanelRect()) return false;
      recordingActive = true;
      recordingStartedAt = new Date().toISOString();
      return true;
    },
    recordStop() {
      if (!recordingActive) return false;
      recordingActive = false;
      recordingStartedAt = null;
      return true;
    },
    getRecordingStatus() {
      if (!recordingActive) return { recording: false };
      return {
        recording: true,
        startedAt: recordingStartedAt ?? undefined,
        durationMs: recordingStartedAt
          ? Date.now() - new Date(recordingStartedAt).getTime()
          : undefined,
      };
    },
    openDevPreview(url: string) {
      const state = useAppStore.getState();
      if (state.activeApp !== 'explorer') state.setActiveApp('explorer');
      const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? 'global';
      useEditorBridge.getState().requestOpenFile(workspaceId, `devserver://${url}`);
      return true;
    },
  };

  return () => {
    delete window.__appControl;
  };
}
