import { mkdir, readFile, rename, writeFile } from 'fs/promises';
import path from 'path';
import { isRecord } from './types';

interface CredentialFile {
  version: 1;
  tokens: Record<string, string>;
}

export interface CredentialCipher {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export class AgentNodeCredentials {
  readonly filePath: string;

  constructor(profileRoot: string, private readonly storage: CredentialCipher) {
    this.filePath = path.join(profileRoot, 'agent-node-credentials.json');
  }

  async get(nodeId: string): Promise<string | null> {
    const encrypted = (await this.read()).tokens[nodeId];
    return encrypted ? this.storage.decryptString(Buffer.from(encrypted, 'base64')) : null;
  }

  async set(nodeId: string, token: string): Promise<void> {
    if (!this.storage.isEncryptionAvailable()) {
      throw new Error('OS credential encryption is unavailable');
    }
    const file = await this.read();
    file.tokens[nodeId] = this.storage.encryptString(token).toString('base64');
    await this.write(file);
  }

  async remove(nodeId: string): Promise<void> {
    const file = await this.read();
    delete file.tokens[nodeId];
    await this.write(file);
  }

  private async read(): Promise<CredentialFile> {
    const raw = await readFile(this.filePath, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (raw === null) return { version: 1, tokens: {} };
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== 1 || !isRecord(value.tokens)
      || !Object.values(value.tokens).every((token) => typeof token === 'string')) {
      throw new Error('Agent node credential file is invalid');
    }
    return { version: 1, tokens: { ...value.tokens } as Record<string, string> };
  }

  private async write(file: CredentialFile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
