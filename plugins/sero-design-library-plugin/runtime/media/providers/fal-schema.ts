import type { MediaModelOptions } from '../../../shared/media';

/**
 * What a fal endpoint accepts, read from the endpoint's own OpenAPI schema.
 *
 * fal publishes a schema per endpoint, and it is the only honest source for
 * things like "this model takes 5 or 10 seconds and nothing else". The
 * alternative — a table of model ids maintained in here — is a catalogue that
 * goes stale the moment someone edits the model id in Settings, which this
 * plugin invites them to do.
 *
 * Vendor-shaped in every respect, hence its home next to the adapter. What
 * leaves is `MediaModelOptions`: seconds and `w:h` ratios, nothing else.
 *
 * Best effort throughout. A schema that cannot be fetched or cannot be parsed
 * yields no options, and the caller carries on with the request as asked — the
 * provider is still the authority, and a rejected request costs nothing.
 */

const SCHEMA_ENDPOINT = 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=';
const SCHEMA_TIMEOUT_MS = 10_000;
/** How long a failed read is remembered, so a flaky minute is not permanent. */
const FAILURE_TTL_MS = 60_000;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * The endpoint's input schema.
 *
 * Named by convention rather than resolved through the path's `$ref`: fal's
 * generated names vary by endpoint, and the one with a `prompt` is the request
 * body in every schema this has been run against. Preferring it over a bare
 * `Input` suffix keeps the shared `File` and `QueueStatus` definitions out.
 */
function inputSchema(document: unknown): Record<string, unknown> | null {
  if (!isObject(document)) return null;
  const components = document.components;
  const schemas = isObject(components) ? components.schemas : undefined;
  if (!isObject(schemas)) return null;

  const candidates = Object.entries(schemas).filter(
    ([name, schema]) => name.endsWith('Input') && isObject(schema) && isObject(schema.properties),
  );
  const withPrompt = candidates.find(
    ([, schema]) => isObject((schema as Record<string, unknown>).properties) &&
      'prompt' in ((schema as Record<string, unknown>).properties as Record<string, unknown>),
  );
  const chosen = withPrompt ?? candidates[0];
  if (chosen === undefined) return null;
  return (chosen[1] as Record<string, unknown>).properties as Record<string, unknown>;
}

/**
 * Seconds, however the schema states them.
 *
 * Three spellings are in use across fal's own video endpoints — `5`, `"5"` and
 * `"8s"` — hence `parseFloat` rather than `Number`, which reads the last of
 * those as nothing at all.
 */
function toSeconds(value: unknown): number | undefined {
  const numeric = typeof value === 'string' ? Number.parseFloat(value) : value;
  if (typeof numeric !== 'number' || !Number.isFinite(numeric) || numeric <= 0) return undefined;
  return numeric;
}

/**
 * The exact values the endpoint listed, by the seconds they mean.
 *
 * Load-bearing for anything that spells a length as `"8s"`: the plugin counts in
 * seconds, and a request rebuilt as `"8"` from that number is rejected. What
 * goes back to the provider is the token it published, and the number is only
 * how the rest of the plugin refers to it.
 */
function durationTokens(property: unknown): Map<number, string | number> {
  const tokens = new Map<number, string | number>();
  if (!isObject(property) || !Array.isArray(property.enum)) return tokens;
  for (const entry of property.enum) {
    if (typeof entry !== 'string' && typeof entry !== 'number') continue;
    const seconds = toSeconds(entry);
    if (seconds !== undefined && !tokens.has(seconds)) tokens.set(seconds, entry);
  }
  return tokens;
}

function durationOptions(property: unknown, tokens: Map<number, string | number>): MediaModelOptions {
  if (!isObject(property)) return {};
  if (tokens.size > 0) {
    return { durationsSeconds: [...tokens.keys()].sort((a, b) => a - b) };
  }

  const min = toSeconds(property.minimum);
  const max = toSeconds(property.maximum);
  return min === undefined || max === undefined || max < min ? {} : { durationRange: { min, max } };
}

function ratioOptions(property: unknown): string[] | undefined {
  if (!isObject(property) || !Array.isArray(property.enum)) return undefined;
  const ratios = property.enum.filter(
    (entry): entry is string => typeof entry === 'string' && /^\d+:\d+$/.test(entry),
  );
  return ratios.length === 0 ? undefined : ratios;
}

/**
 * What one endpoint accepts: the vendor-neutral part everyone sees, and the
 * literal duration values only the adapter needs.
 */
export interface FalModelSchema {
  options: MediaModelOptions;
  /** The value to send for a given number of seconds, when the endpoint listed one. */
  durationTokens: Map<number, string | number>;
}

export const NO_SCHEMA: FalModelSchema = { options: {}, durationTokens: new Map() };

export function parseFalSchema(document: unknown): FalModelSchema {
  const properties = inputSchema(document);
  if (properties === null) return NO_SCHEMA;
  const tokens = durationTokens(properties.duration);
  const ratios = ratioOptions(properties.aspect_ratio);
  return {
    options: {
      ...durationOptions(properties.duration, tokens),
      supportsAspectRatio: properties.aspect_ratio !== undefined,
      ...(ratios === undefined ? {} : { aspectRatios: ratios }),
    },
    durationTokens: tokens,
  };
}

export interface FalSchemaReader {
  (model: string, signal?: AbortSignal): Promise<FalModelSchema>;
}

/**
 * A reader with a per-process cache.
 *
 * A model's schema does not change while the app is open, so a success is kept
 * for good: the alternative is a network round trip in front of every video,
 * including the one inside a generation run that is already waiting on a model.
 * A failure is kept only briefly, so a machine that was offline for a moment is
 * not stuck without options until it restarts.
 */
export function createFalSchemaReader(transport: typeof globalThis.fetch): FalSchemaReader {
  const cache = new Map<string, FalModelSchema>();
  const failedAt = new Map<string, number>();

  return async (model, signal) => {
    const cached = cache.get(model);
    if (cached !== undefined) return cached;
    const failed = failedAt.get(model);
    if (failed !== undefined && Date.now() - failed < FAILURE_TTL_MS) return NO_SCHEMA;

    const timeout = AbortSignal.timeout(SCHEMA_TIMEOUT_MS);
    const response = await transport(`${SCHEMA_ENDPOINT}${encodeURIComponent(model)}`, {
      signal: signal === undefined ? timeout : AbortSignal.any([signal, timeout]),
    }).catch(() => null);

    if (response === null || !response.ok) {
      failedAt.set(model, Date.now());
      return NO_SCHEMA;
    }

    const document = await response.json().catch(() => null);
    const schema = parseFalSchema(document);
    cache.set(model, schema);
    return schema;
  };
}
