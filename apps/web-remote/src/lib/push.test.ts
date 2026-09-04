import { describe, expect, it } from 'vitest';
import { decodeVapidKey, pushSupported, readKeys } from './push';

describe('decodeVapidKey', () => {
  it('turns a base64url key into the bytes the browser wants', () => {
    // "hello" in base64url, with the padding a VAPID key omits.
    const bytes = new Uint8Array(decodeVapidKey('aGVsbG8'));

    expect(String.fromCharCode(...bytes)).toBe('hello');
  });

  it('reads the two characters base64url replaces', () => {
    // "--_-" is "++/+" in standard base64: the two swapped characters.
    const bytes = new Uint8Array(decodeVapidKey('--_-'));

    expect([...bytes]).toEqual([251, 239, 254]);
  });
});

describe('readKeys', () => {
  it('reads the endpoint and both keys', () => {
    const subscription = {
      toJSON: () => ({
        endpoint: 'https://push.example/a',
        keys: { p256dh: 'key', auth: 'secret' },
      }),
    } as unknown as PushSubscription;

    expect(readKeys(subscription)).toEqual({
      endpoint: 'https://push.example/a',
      p256dh: 'key',
      auth: 'secret',
    });
  });

  it('refuses a subscription with a key missing', () => {
    const subscription = {
      toJSON: () => ({ endpoint: 'https://push.example/a', keys: { p256dh: 'key' } }),
    } as unknown as PushSubscription;

    expect(readKeys(subscription)).toBeNull();
  });
});

describe('pushSupported', () => {
  it('is false without a service worker, which is the plain-HTTP case', () => {
    // jsdom has no service worker, so this is the unsupported branch.
    expect(pushSupported()).toBe(false);
  });
});
