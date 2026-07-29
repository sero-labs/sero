import { describe, expect, it, vi } from 'vitest';

import { createFalSchemaReader, parseFalSchema } from './fal-schema';

/**
 * Reading what a model accepts.
 *
 * The case that made this necessary: the video model fal defaults to takes a
 * duration of `"5"` or `"10"` — strings, from a fixed set — and answers anything
 * else with a rejection. A dialog offering 4 seconds produced nothing at all.
 */

/** The shape fal actually returns, trimmed to what is read. */
function schemaDocument(properties: Record<string, unknown>) {
  return {
    openapi: '3.0.4',
    components: {
      schemas: {
        QueueStatus: { properties: { status: { type: 'string' } } },
        File: { properties: { url: { type: 'string' } } },
        KlingVideoInput: { properties },
        KlingVideoOutput: { properties: { video: {} } },
      },
    },
  };
}

describe('reading a fal endpoint schema', () => {
  it('takes the lengths and ratios the endpoint lists', () => {
    const schema = parseFalSchema(
      schemaDocument({
        prompt: { type: 'string' },
        duration: { type: 'string', enum: ['5', '10'], default: '5' },
        aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'] },
      }),
    );

    // Numbers, whatever the schema calls them: the rest of the plugin counts
    // seconds and must never learn that this provider spells them as strings.
    expect(schema.options).toEqual({
      durationsSeconds: [5, 10],
      aspectRatios: ['16:9', '9:16', '1:1'],
    });
  });

  it('keeps the endpoint\'s own spelling of a length', () => {
    // fal's veo3 lists `4s`, `6s`, `8s`. Read as 4, 6 and 8 for everything this
    // plugin does with them — and sent back as `8s`, because `8` is refused.
    const schema = parseFalSchema(
      schemaDocument({ prompt: {}, duration: { type: 'string', enum: ['4s', '6s', '8s'] } }),
    );

    expect(schema.options).toEqual({ durationsSeconds: [4, 6, 8] });
    expect(schema.durationTokens.get(8)).toBe('8s');
  });

  it('reads a continuous range where a model takes one', () => {
    const schema = parseFalSchema(
      schemaDocument({ prompt: {}, duration: { type: 'integer', minimum: 2, maximum: 6 } }),
    );

    expect(schema.options).toEqual({ durationRange: { min: 2, max: 6 } });
  });

  it('says nothing rather than guessing when the schema has nothing to say', () => {
    expect(
      parseFalSchema(schemaDocument({ prompt: {}, image_size: { type: 'string' } })).options,
    ).toEqual({});
    expect(parseFalSchema({ components: {} }).options).toEqual({});
    expect(parseFalSchema('not a schema').options).toEqual({});
  });

  it('picks the input schema, not the output or the shared definitions', () => {
    // Endpoint schemas carry several definitions and the generated names vary;
    // reading the wrong one would publish an output field as an input option.
    const schema = parseFalSchema({
      components: {
        schemas: {
          SomethingElseInput: { properties: { duration: { enum: ['99'] } } },
          RealInput: { properties: { prompt: {}, duration: { enum: ['5'] } } },
        },
      },
    });

    expect(schema.options).toEqual({ durationsSeconds: [5] });
  });
});

describe('the reader', () => {
  it('asks once per model and remembers the answer', async () => {
    const transport = vi.fn(async () =>
      new Response(
        JSON.stringify(schemaDocument({ prompt: {}, duration: { enum: ['5', '10'] } })),
        { status: 200 },
      ),
    );
    const read = createFalSchemaReader(transport as unknown as typeof globalThis.fetch);

    expect((await read('fal-ai/kling')).options).toEqual({ durationsSeconds: [5, 10] });
    expect((await read('fal-ai/kling')).options).toEqual({ durationsSeconds: [5, 10] });

    // A round trip in front of every video — including one inside a generation
    // run that is already waiting on a model — for an answer that cannot change
    // while the app is open.
    expect(transport).toHaveBeenCalledOnce();
  });

  it('answers "nothing known" when the endpoint cannot be reached', async () => {
    const transport = vi.fn(async () => {
      throw new Error('offline');
    });
    const read = createFalSchemaReader(transport as unknown as typeof globalThis.fetch);

    // Never throws: a provider that cannot describe a model must not stop
    // anybody generating with it.
    expect((await read('fal-ai/kling')).options).toEqual({});
  });

  it('does not keep asking a model it has just failed on', async () => {
    const transport = vi.fn(async () => new Response('nope', { status: 404 }));
    const read = createFalSchemaReader(transport as unknown as typeof globalThis.fetch);

    await read('fal-ai/private-endpoint');
    await read('fal-ai/private-endpoint');

    expect(transport).toHaveBeenCalledOnce();
  });
});
