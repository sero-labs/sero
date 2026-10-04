import type { JsonObject, JsonValue } from '@earendil-works/pi-ai';

/** True for a value Pi accepts as tool-call arguments or tool-result details. */
export function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      return Number.isFinite(value);
    case 'object':
      return Array.isArray(value) ? value.every(isJsonValue) : isJsonObject(value);
    default:
      return false;
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  // An absent optional argument arrives as `undefined`. Serialisation drops the key, so it passes.
  return Object.values(value).every((item) => item === undefined || isJsonValue(item));
}

/** The form a value takes once it is written to a session file, or `null` when that form is not an object. */
export function toJsonObject(value: unknown): JsonObject | null {
  if (value === undefined || value === null) return null;
  const serialised: unknown = JSON.parse(JSON.stringify(value));
  return isJsonObject(serialised) ? serialised : null;
}
