/**
 * Application menu. The app otherwise has no custom menu, so this installs a
 * standard role-based menu and adds "Check for Updates…" — in the app menu on
 * macOS, the Help menu elsewhere.
 */

import { app, Menu, shell, type MenuItemConstructorOptions } from 'electron';
import { checkForUpdates } from './updater';

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
    { role: 'viewMenu' },
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
