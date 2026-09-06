# Desktop glass

The theme preset owns the tint, border, and blur settings. The shared UI theme
engine applies CSS layers. `window.setGlassEffect` sends native settings through
the preload bridge to `ipc/platform/system/window.ts`.

On macOS, `macos-glass.ts` uses `CGSSetWindowBackgroundBlurRadius` to blur behind
the transparent window without adding a native material tint. This is a private
WindowServer API. Resolve it at first use and report failures to the editor.
The renderer restores solid backgrounds if native glass fails.

Electron supplies an NSView pointer. Resolve its NSWindow and WindowServer ID
on the main thread. Never accept native pointers from renderer input. Radius
values are finite integers in the range 0–64; zero removes blur.

Koffi supplies the Node-API bridge. It loads only on macOS and uses prebuilt
binaries, so users do not need a compiler. Keep it external in the Electron
bundle and unpacked from ASAR. Release file rules omit compiler sources and
non-macOS binaries. Keep the package license in the release.

Windows 11 22H2 and later use Electron's Acrylic, Mica, or Tabbed backdrop.
Older Windows versions and Linux retain solid backgrounds. Do not load the
macOS library on those platforms.

Check both themes in a native Electron window over a detailed background.
Change blur between 0 and 64, change tint independently, then unfocus the window.
Use a screen capture for visual checks; a window-only capture omits the desktop
behind native glass. Browser screenshots cannot prove the native blur effect.
