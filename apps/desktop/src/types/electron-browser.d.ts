import type {
  BrowserBookmarkContextAction,
  BrowserEvent,
  BrowserGrabResult,
  BrowserTabContextAction,
  BrowserViewBounds,
} from './browser';

export interface SeroBrowserAPI {
  openTab(tabId: string, url: string, workspaceId: string): Promise<void>;
  closeTab(tabId: string, workspaceId: string): Promise<void>;
  setActive(tabId: string | null, workspaceId: string): Promise<void>;
  setBounds(bounds: BrowserViewBounds): Promise<void>;
  hideAll(): Promise<void>;
  navigate(tabId: string, url: string, workspaceId: string): Promise<void>;
  goBack(tabId: string, workspaceId: string): Promise<void>;
  goForward(tabId: string, workspaceId: string): Promise<void>;
  reload(tabId: string, workspaceId: string): Promise<void>;
  stop(tabId: string, workspaceId: string): Promise<void>;
  extractPage(
    tabId: string,
    workspaceId: string,
  ): Promise<{ title: string; url: string; text: string } | null>;
  capturePage(
    tabId: string,
    workspaceId: string,
    rect?: { x: number; y: number; width: number; height: number },
  ): Promise<string | null>;
  grabElement(tabId: string, workspaceId: string): Promise<BrowserGrabResult>;
  cancelGrab(tabId: string, workspaceId: string): Promise<void>;
  showTabContextMenu(tabId: string, workspaceId: string): Promise<BrowserTabContextAction | null>;
  showBookmarkContextMenu(): Promise<BrowserBookmarkContextAction | null>;
  onEvent(callback: (event: BrowserEvent) => void): () => void;
}
