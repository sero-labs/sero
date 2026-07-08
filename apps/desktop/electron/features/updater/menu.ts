/**
 * Application menu. The app otherwise has no custom menu, so this installs a
 * standard role-based menu and adds "Check for Updates…" — in the app menu on
 * macOS, the Help menu elsewhere.
 */

import { app, BrowserWindow, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { ZoomCommand } from '@/types/window-chrome';
import { checkForUpdates } from './updater';

/**
 * Zoom goes through the renderer's zoom store (not Electron's built-in
 * zoom roles) so the chrome can counter-scale and the factor persists.
 */
function sendZoomCommand(command: ZoomCommand): void {
  BrowserWindow.getFocusedWindow()?.webContents.send(IpcChannels.window.zoomCommand, command);
}

const viewMenu: MenuItemConstructorOptions = {
  label: 'View',
  submenu: [
    { role: 'reload' },
    { role: 'forceReload' },
    { role: 'toggleDevTools' },
    { type: 'separator' },
    { label: 'Zoom In', accelerator: 'CommandOrControl+=', click: () => sendZoomCommand('in') },
    { label: 'Zoom Out', accelerator: 'CommandOrControl+-', click: () => sendZoomCommand('out') },
    { label: 'Actual Size', accelerator: 'CommandOrControl+0', click: () => sendZoomCommand('reset') },
    // Hidden aliases so the common variants work too (⌘⇧= / numpad keys).
    { label: 'Zoom In', accelerator: 'CommandOrControl+Shift+=', visible: false, acceleratorWorksWhenHidden: true, click: () => sendZoomCommand('in') },
    { label: 'Zoom In', accelerator: 'CommandOrControl+numadd', visible: false, acceleratorWorksWhenHidden: true, click: () => sendZoomCommand('in') },
    { label: 'Zoom Out', accelerator: 'CommandOrControl+numsub', visible: false, acceleratorWorksWhenHidden: true, click: () => sendZoomCommand('out') },
    { type: 'separator' },
    { role: 'togglefullscreen' },
  ],
};

export function installApplicationMenu(): void {
  const isMac = process.platform === 'darwin';
  const checkForUpdatesItem: MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => {
      void checkForUpdates({ manual: true });
    },
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              checkForUpdatesItem,
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    viewMenu,
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        ...(!isMac
          ? ([checkForUpdatesItem, { type: 'separator' }] as MenuItemConstructorOptions[])
          : []),
        {
          label: 'Learn More',
          click: () => {
            void shell.openExternal('https://sero.ai');
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
