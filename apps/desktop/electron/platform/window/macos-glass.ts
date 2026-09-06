import { createRequire } from 'node:module';
import type * as Koffi from 'koffi';
import type { BrowserWindow } from 'electron';

const nativeRequire = createRequire(__filename);

function loadBlurApi() {
  // Load only on macOS. Packaged builds ship Koffi's prebuilt Node-API binary.
  const koffi: typeof Koffi = nativeRequire('koffi');
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const graphics = koffi.load('/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics');
  const selector: (name: string) => bigint = objc.func('void *sel_registerName(const char *name)');
  const objectMessage: (object: bigint, selector: bigint) => bigint =
    objc.func('void *objc_msgSend(void *object, void *selector)');
  const integerMessage: (object: bigint, selector: bigint) => number =
    objc.func('long objc_msgSend(void *object, void *selector)');
  const connection: () => number = graphics.func('int CGSMainConnectionID()');
  // Private WindowServer API: blur the desktop without an NSVisualEffectView tint.
  // Resolve dynamically so an unavailable symbol returns an editor error, not a startup failure.
  const setBlur: (connection: number, window: number, radius: number) => number =
    graphics.func('int CGSSetWindowBackgroundBlurRadius(int connection, int window, int radius)');
  return {
    objectMessage, integerMessage, connection, setBlur,
    windowSelector: selector('window'),
    numberSelector: selector('windowNumber'),
  };
}

let api: ReturnType<typeof loadBlurApi> | undefined;

/** Called synchronously on Electron's main thread while the native view is alive. */
export function setMacWindowBlur(window: BrowserWindow, radius: number): void {
  if (window.isDestroyed()) return;
  if (radius === 0 && !api) return;
  api ??= loadBlurApi();
  // Electron returns the NSView pointer, not NSWindow or the WindowServer ID.
  const view = window.getNativeWindowHandle().readBigUInt64LE();
  const nativeWindow = api.objectMessage(view, api.windowSelector);
  if (!nativeWindow) throw new Error('The native window is not available.');
  const number = api.integerMessage(nativeWindow, api.numberSelector);
  const connection = api.connection();
  if (number <= 0 || connection === 0) throw new Error('The desktop window is not available.');
  const result = api.setBlur(connection, number, radius);
  if (result !== 0) throw new Error(`macOS could not apply desktop blur (${result}).`);
}
