import type { Client } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { MCP_SKILLS_EXTENSION } from '../manager/client-factory';

// No SDK package exists for the Skills extension (SEP-2640, stable), so these
// small schemas describe its result shapes. They are the one place where Sero
// keeps its own copy of wire types.

const SkillResourceSchema = z.object({
  uri: z.string(),
  digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
});

const SkillSchema = z.object({
  uri: z.string(),
  frontmatter: z.looseObject({ name: z.string(), description: z.string() }),
  resources: z.union([z.array(SkillResourceSchema), z.literal('dynamic')]),
});

const ListSkillsResultSchema = z.looseObject({
  skills: z.array(z.unknown()),
  nextCursor: z.string().optional(),
});

const GetSkillResultSchema = z.looseObject({ skill: SkillSchema });

const ReadDirectoryResultSchema = z.looseObject({
  resources: z.array(z.looseObject({ uri: z.string(), name: z.string(), mimeType: z.string().optional() })),
  nextCursor: z.string().optional(),
});

export type SkillResource = z.infer<typeof SkillResourceSchema>;
export type SkillEntry = z.infer<typeof SkillSchema>;
export type DirectoryChild = z.infer<typeof ReadDirectoryResultSchema>['resources'][number];

const MAX_PAGES = 64;

/** Skills requests to one server. It exists only when the server declares the Skills extension. */
export interface SkillsClient {
  directoryRead: boolean;
  /** Every listed skill. An entry that does not match the schema is left out. */
  list(): Promise<SkillEntry[]>;
  get(uri: string): Promise<SkillEntry>;
  readDirectory(uri: string): Promise<DirectoryChild[]>;
}

export function createSkillsClient(client: Client): SkillsClient | undefined {
  const declaration = client.getServerCapabilities()?.extensions?.[MCP_SKILLS_EXTENSION];
  if (!declaration || typeof declaration !== 'object') return undefined;
  const directoryRead = Reflect.get(declaration, 'directoryRead') === true;

  return {
    directoryRead,
    async list() {
      const skills: SkillEntry[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await client.request({ method: 'skills/list', params: cursor ? { cursor } : {} }, ListSkillsResultSchema);
        for (const value of result.skills) {
          const entry = SkillSchema.safeParse(value);
          if (entry.success) skills.push(entry.data);
        }
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      return skills;
    },
    async get(uri) {
      return (await client.request({ method: 'skills/get', params: { uri } }, GetSkillResultSchema)).skill;
    },
    async readDirectory(uri) {
      if (!directoryRead) throw new Error('The server does not support directory reads.');
      const children: DirectoryChild[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const result = await client.request(
          { method: 'resources/directory/read', params: { uri, ...(cursor ? { cursor } : {}) } },
          ReadDirectoryResultSchema,
        );
        children.push(...result.resources);
        cursor = result.nextCursor;
        if (!cursor) break;
      }
      return children;
    },
  };
}
