# App Store, Favorites, and Installed Plugins

Use **App Store** to find plugin apps, install external plugins, and choose which plugin apps appear in the sidebar.

![Plugin discovery and favorites lifecycle](../assets/generated/img7.jpg)

![App Store](../assets/images/app-store.jpg)

## Understand the app types

Sero has two types of app:

- Core apps, such as Dashboard, Agent Board, and Explorer, are part of the desktop shell. They are always available.
- Plugin apps come from built-in or installed plugins. A plugin can also add agent tools, commands, background services, provider information, or dashboard widgets.

A favorite changes the sidebar only. It does not install, uninstall, enable, or disable a plugin.

## Find and install a plugin

1. Select **Open App Store** in the sidebar.
2. Select **Discover**.
3. Enter a search term. Sero searches public GitHub and npm sources.
4. Review the source and package details.

   A plugin can run code and can access workspaces allowed by its manifest and
   host capabilities. Install only source that you trust.

5. Select **Install**.

The result changes to an installed state after the install completes. Sero then refreshes discovered apps and active agent resources.

![App Discovery](../assets/images/app-discovery.jpg)

The **Installed** tab lists the plugin apps that Sero knows in the active profile. Use its search field to filter that list.

## Add an app to the sidebar

Select the star on an installed plugin app to add it to the sidebar. Clear the star to remove it from the sidebar. Sero saves this choice in the profile layout.

Core apps stay at the start of the sidebar. Favorite plugin apps follow them. If an installed app does not appear, confirm that it provides an app UI and that the host supports it.

![Favourites Menu](../assets/images/favourites-menu.jpg)

## Uninstall a plugin

Use **Uninstall** for the plugin in **Discover** or the plugin management view. Uninstall removes the installed package and its install record. It does not remove all data that the plugin created.

Plugin data can remain in these locations:

```text
<SERO_HOME>/apps/<app-id>/
<workspace>/.sero/apps/<app-id>/
```

Logs and files that you exported can also remain. This retained state lets a later install use the same data. Remove it separately only when you know that you no longer need it.

![Plugin Management](../assets/images/plugin-management.jpg)

## If an app is missing

Check these items:

1. Open **App Store** and confirm that the plugin is installed.
2. Confirm that the plugin provides an app UI.
3. Select its star if you want it in the sidebar.
4. Read any **Unsupported host** message on the card.
5. Restart Sero if resources did not refresh after an install or uninstall.

For plugin storage, see [State and Folders](/reference/state-and-folders). For the plugin model and author references, see [Plugins and Apps](/guide/plugins-and-apps).
