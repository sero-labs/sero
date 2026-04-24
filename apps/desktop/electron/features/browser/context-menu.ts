/**
 * Builds the native context menu shown inside a browser tab's WebContents.
 *
 * The WebContentsView has no built-in chrome so we own the menu entirely.
 * Items are gated on the Electron ContextMenuParams — `selectionText`,
 * `linkURL`, `srcURL`/`mediaType`, `isEditable` — so we only show actions
 * that make sense for what the user actually right-clicked on.
 */

import { Menu, clipboard } from 'electron';
import type {
  BrowserWindow,
  ContextMenuParams,
  MenuItemConstructorOptions,
  WebContentsView,
} from 'electron';
import type { BrowserEvent } from '@/types/browser';

interface ShowContextMenuOptions {
  tabId: string;
  workspaceId: string;
  view: WebContentsView;
  params: ContextMenuParams;
  window: BrowserWindow | null;
  emit: (event: BrowserEvent) => void;
}

export function showBrowserContextMenu(opts: ShowContextMenuOptions): void {
  const { tabId, workspaceId, view, params, window, emit } = opts;
  const wc = view.webContents;
  const items: MenuItemConstructorOptions[] = [];

  if (params.selectionText && params.selectionText.trim()) {
    items.push({
      label: 'Add to Sero Chat',
      click: () => {
        emit({
          tabId,
          workspaceId,
          kind: 'selection-to-chat',
          selection: params.selectionText,
          pageUrl: wc.getURL(),
          pageTitle: wc.getTitle(),
        });
      },
    });
    items.push({
      label: 'Save to Memory',
      click: () => {
        emit({
          tabId,
          workspaceId,
          kind: 'selection-to-memory',
          selection: params.selectionText,
          pageUrl: wc.getURL(),
          pageTitle: wc.getTitle(),
        });
      },
    });
    items.push({ type: 'separator' });
    items.push({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy });
  }

  if (params.linkURL) {
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: 'Open Link in New Tab',
      click: () => {
        emit({ tabId, workspaceId, kind: 'new-tab-request', url: params.linkURL });
      },
    });
    items.push({
      label: 'Copy Link Address',
      click: () => clipboard.writeText(params.linkURL),
    });
  }

  if (params.srcURL && params.mediaType === 'image') {
    if (items.length) items.push({ type: 'separator' });
    items.push({
      label: 'Open Image in New Tab',
      click: () => {
        emit({ tabId, workspaceId, kind: 'new-tab-request', url: params.srcURL });
      },
    });
    items.push({
      label: 'Copy Image Address',
      click: () => clipboard.writeText(params.srcURL),
    });
  }

  if (params.isEditable) {
    if (items.length) items.push({ type: 'separator' });
    items.push({ label: 'Cut', role: 'cut', enabled: params.editFlags.canCut });
    items.push({ label: 'Copy', role: 'copy', enabled: params.editFlags.canCopy });
    items.push({ label: 'Paste', role: 'paste', enabled: params.editFlags.canPaste });
    items.push({ label: 'Select All', role: 'selectAll', enabled: params.editFlags.canSelectAll });
  }

  if (items.length) items.push({ type: 'separator' });
  items.push({
    label: 'Back',
    enabled: wc.navigationHistory.canGoBack(),
    click: () => wc.navigationHistory.goBack(),
  });
  items.push({
    label: 'Forward',
    enabled: wc.navigationHistory.canGoForward(),
    click: () => wc.navigationHistory.goForward(),
  });
  items.push({ label: 'Reload', click: () => wc.reload() });

  items.push({ type: 'separator' });
  items.push({
    label: 'Inspect Element',
    click: () => wc.inspectElement(params.x, params.y),
  });

  const menu = Menu.buildFromTemplate(items);
  menu.popup({ window: window ?? undefined });
}
