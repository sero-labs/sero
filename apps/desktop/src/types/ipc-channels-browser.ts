/** IPC channel constants for the in-app browser. */
export const browserIpcChannels = {
  /** Create a WebContentsView for a tab id and load a URL. */
  openTab: 'sero:browser:open-tab',
  /** Destroy the WebContentsView for a tab id. */
  closeTab: 'sero:browser:close-tab',
  /** Show a tab's view on top; hide all others. */
  setActive: 'sero:browser:set-active',
  /** Position the active view within the main window, or hide all. */
  setBounds: 'sero:browser:set-bounds',
  /** Hide all browser views (panel no longer visible). */
  hideAll: 'sero:browser:hide-all',
  /** Navigate the given tab to a URL. */
  navigate: 'sero:browser:navigate',
  /** History controls. */
  goBack: 'sero:browser:go-back',
  goForward: 'sero:browser:go-forward',
  reload: 'sero:browser:reload',
  stop: 'sero:browser:stop',
  /** Extract the active page's title + plain text for "Share with chat". */
  extractPage: 'sero:browser:extract-page',
  /** Capture the tab as a PNG (optionally cropped). Returns base64 PNG. */
  capturePage: 'sero:browser:capture-page',
  /** Start a react-grab element pick; resolves with the grabbed context. */
  grabElement: 'sero:browser:grab-element',
  /** Cancel an in-flight element pick. */
  cancelGrab: 'sero:browser:cancel-grab',
  /** Native tab-strip context menu. Returns selected action or null. */
  showTabContextMenu: 'sero:browser:show-tab-context-menu',
  /** Native bookmarks-bar context menu. Returns selected action or null. */
  showBookmarkContextMenu: 'sero:browser:show-bookmark-context-menu',
  /** Main → renderer push: navigation / load / title / favicon events. */
  event: 'sero:browser:event',
} as const;
