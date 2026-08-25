import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { AuthenticatedController, ControllerRecord, EnrolmentRecord } from "./types.ts";
import type { StatePaths } from "./state.ts";
import { secureWrite } from "./state.ts";

const CODE_TTL_MS = 10 * 60 * 1_000;

function digest(value: string, salt = ""): string {
  return createHash("sha256").update(salt).update(value).digest("hex");
}

export class ControllerStore {
  constructor(readonly paths: StatePaths, readonly now: () => number = Date.now) {}

  async mintCode(): Promise<{ code: string; expiresAt: string }> {
    const code = randomBytes(18).toString("base64url");
    const records = (await this.#enrolments()).filter((item) => item.expiresAt > this.now());
    records.push({ digest: digest(code), expiresAt: this.now() + CODE_TTL_MS });
    await secureWrite(this.paths.enrolments, `${JSON.stringify(records)}\n`);
    return { code, expiresAt: new Date(this.now() + CODE_TTL_MS).toISOString() };
  }

  async enrol(code: string, profileId: string): Promise<{ controllerId: string; token: string }> {
    const key = digest(code);
    const codes = await this.#enrolments();
    const pending = codes.find((item) => item.digest === key);
    if (!pending || pending.expiresAt <= this.now()) {
      throw new Error("invalid_enrolment_code");
    }
    await secureWrite(this.paths.enrolments, `${JSON.stringify(codes.filter((item) => item.digest !== key && item.expiresAt > this.now()))}\n`);
    const records = await this.listAll();
    const token = randomBytes(32).toString("base64url");
    const salt = randomBytes(16).toString("hex");
    const id = randomUUID();
    records.push({ id, profileId, salt, tokenDigest: digest(token, salt), createdAt: new Date(this.now()).toISOString() });
    await this.#save(records);
    return { controllerId: id, token };
  }

  async authenticate(token: string): Promise<AuthenticatedController | undefined> {
    if (!token) return undefined;
    for (const record of await this.listAll()) {
      if (record.revokedAt) continue;
      const expected = Buffer.from(record.tokenDigest, "hex");
      const actual = Buffer.from(digest(token, record.salt), "hex");
      if (expected.length === actual.length && timingSafeEqual(expected, actual)) return { id: record.id, profileId: record.profileId };
    }
    return undefined;
  }

  async list(): Promise<Array<Omit<ControllerRecord, "salt" | "tokenDigest">>> {
    return (await this.listAll()).map(({ salt: _salt, tokenDigest: _digest, ...record }) => record);
  }

  async revoke(id: string): Promise<boolean> {
    const records = await this.listAll();
    const record = records.find((item) => item.id === id && !item.revokedAt);
    if (!record) return false;
    record.revokedAt = new Date(this.now()).toISOString();
    await this.#save(records);
    return true;
  }

  async listAll(): Promise<ControllerRecord[]> {
    const value: unknown = await Bun.file(this.paths.clients).json();
    return Array.isArray(value) ? value as ControllerRecord[] : [];
  }

  async #save(records: ControllerRecord[]): Promise<void> {
    await secureWrite(this.paths.clients, `${JSON.stringify(records, null, 2)}\n`);
  }
  async #enrolments(): Promise<EnrolmentRecord[]> {
    const value: unknown = await Bun.file(this.paths.enrolments).json();
    return Array.isArray(value) ? value as EnrolmentRecord[] : [];
  }
}
