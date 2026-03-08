/**
 * Type declarations for the window.sero API used by the Starling extension.
 */

interface SeroNetBridge {
  fetch(request: {
    url: string;
    method: string;
    headers: Record<string, string>;
  }): Promise<{
    status: number;
    body: string;
    headers: Record<string, string>;
  }>;
}

interface SeroSafeStorageBridge {
  encrypt(plaintext: string): Promise<string>;
  decrypt(encryptedBase64: string): Promise<string>;
}

interface Window {
  sero: {
    net: SeroNetBridge;
    safeStorage: SeroSafeStorageBridge;
  };
}
