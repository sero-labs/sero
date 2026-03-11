/**
 * Artifact store — screenshots and other artifacts from agent sessions.
 */

import { create } from 'zustand';
import { useConnectionStore } from './connection';
import { useWorkspaceStore } from './workspace';
import type { GatewayMessage } from '@/lib/gateway-client';

export interface Artifact {
  id: string;
  type: string;
  title: string;
  timestamp: string;
  mimeType?: string;
  base64?: string;
}

interface ArtifactStore {
  artifacts: Artifact[];
  isLoading: boolean;

  fetchArtifacts: () => void;
  loadArtifactData: (artifactId: string) => void;
  handleMessage: (msg: GatewayMessage) => void;
  clearArtifacts: () => void;
}

export const useArtifactStore = create<ArtifactStore>((set, get) => ({
  artifacts: [],
  isLoading: false,

  fetchArtifacts: () => {
    const { activeSessionId } = useWorkspaceStore.getState();
    if (!activeSessionId) return;

    set({ isLoading: true });
    useConnectionStore.getState().client.listArtifacts(activeSessionId);
  },

  loadArtifactData: (artifactId: string) => {
    useConnectionStore.getState().client.getArtifact(artifactId);
  },

  handleMessage: (msg: GatewayMessage) => {
    const pushMsg = msg as Record<string, unknown>;

    // Handle artifact_added push events in real-time
    if (pushMsg.type === 'artifact_added') {
      const artifact: Artifact = {
        id: pushMsg.artifactId as string,
        type: pushMsg.artifactType as string,
        title: pushMsg.title as string,
        timestamp: new Date().toISOString(),
      };
      set((s) => ({ artifacts: [...s.artifacts, artifact] }));
      return;
    }

    if (msg.type !== 'ok' || !('requestType' in msg)) return;

    const response = msg as { type: 'ok'; requestType: string; data?: unknown };

    if (response.requestType === 'list_artifacts') {
      const artifacts = (response.data as Artifact[]) ?? [];
      set({ artifacts, isLoading: false });
    }

    if (response.requestType === 'get_artifact') {
      const data = response.data as {
        base64: string;
        mimeType: string;
        title: string;
      } | null;
      if (!data) return;

      // Find and update the artifact with its full data
      set((s) => ({
        artifacts: s.artifacts.map((a) =>
          a.title === data.title
            ? { ...a, base64: data.base64, mimeType: data.mimeType }
            : a,
        ),
      }));
    }
  },

  clearArtifacts: () => {
    set({ artifacts: [], isLoading: false });
  },
}));
