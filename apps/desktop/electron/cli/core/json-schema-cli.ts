import type { CliCommand } from './types';
import {
  extractSchemaProps,
  generateHelp,
  getCliParamType,
  getRequiredKeys,
  getSchemaProperties,
  isRecord,
  schemaToParams,
} from './schema-bridge';

export interface JsonSchemaCliAdapter {
  help: string;
  jsonMode: boolean;
  params: NonNullable<CliCommand['params']>;
  parse(args: string[]): Record<string, unknown>;
}

/** Build CLI help and argument parsing for a cached MCP JSON Schema. */
export function createJsonSchemaCliAdapter(
  name: string,
  description: string,
  inputSchema: unknown,
): JsonSchemaCliAdapter {
  const schema = isRecord(inputSchema) ? inputSchema : null;
  const properties = schema ? getSchemaProperties(schema) : {};
  const props = schema ? extractSchemaProps(schema) : [];
  const required = schema ? getRequiredKeys(schema) : new Set<string>();
  const canMapFlags = Boolean(
    schema
    && (schema.type === undefined || schema.type === 'object')
    && !('allOf' in schema)
    && !('oneOf' in schema)
    && !('$ref' in schema)
    && Object.keys(properties).length === props.length
    && [...required].every((key) => key in properties),
  );

  if (canMapFlags) {
    return {
      help: generateHelp(name, description, props),
      jsonMode: false,
      params: props.map((prop) => ({
        name: prop.name,
        description: prop.description,
        required: prop.required,
        type: getCliParamType(prop.type),
      })),
      parse: (args) => schemaToParams(props, args),
    };
  }

  return {
    help: `${name} — ${description}\n\nUsage:\n  sero ${name} '<json-arguments>'\n\nThis tool uses explicit JSON argument mode because its schema cannot be mapped safely to CLI flags.`,
    jsonMode: true,
    params: [{ name: 'json-arguments', description: 'JSON object that matches the MCP tool input schema' }],
    parse(args) {
      const text = args.join(' ').trim();
      if (!text) return {};
      const value: unknown = JSON.parse(text);
      if (!isRecord(value)) throw new Error('MCP tool arguments must be a JSON object.');
      return value;
    },
  };
}
