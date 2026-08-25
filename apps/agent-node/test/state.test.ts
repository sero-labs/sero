import { describe, expect, test } from "bun:test";
import { chmod, readFile, realpath, stat } from "node:fs/promises";
import { ControllerStore } from "../src/controllers.ts";
import { assertIdentityPermissions, confinedWorkspace, ensureState, identityFingerprint, rotateTls } from "../src/state.ts";
import { temporaryState } from "./helpers.ts";

describe("state and authority", () => {
  test("creates a stable pinned identity and rotates only the TLS leaf", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root);
      const pin = await identityFingerprint(paths);
      const leaf = await readFile(paths.tlsKey, "utf8");
      await rotateTls(paths);
      expect(await identityFingerprint(paths)).toBe(pin);
      expect(await readFile(paths.tlsKey, "utf8")).not.toBe(leaf);
      expect((await stat(paths.identityKey)).mode & 0o777).toBe(0o600);
      expect((await stat(paths.tasks)).mode & 0o777).toBe(0o700);
    } finally { await temp.cleanup(); }
  });

  test("refuses an identity key readable by a group", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root);
      await chmod(paths.identityKey, 0o640);
      await expect(assertIdentityPermissions(paths.identityKey)).rejects.toThrow("unsafe mode 640");
    } finally { await temp.cleanup(); }
  });

  test("confines session workspaces below the workspace root", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root);
      expect(await confinedWorkspace(paths, "project")).toStartWith(await realpath(paths.workspaces));
      await expect(confinedWorkspace(paths, "../outside")).rejects.toThrow("workspace_outside_root");
      await expect(confinedWorkspace(paths, ".")).rejects.toThrow("workspace_outside_root");
    } finally { await temp.cleanup(); }
  });

  test("persists a single-use enrolment code and stores only a token digest", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root);
      const firstProcess = new ControllerStore(paths);
      const { code } = await firstProcess.mintCode();
      const secondProcess = new ControllerStore(paths);
      const enrolled = await secondProcess.enrol(code, "profile-a");
      expect(await secondProcess.authenticate(enrolled.token)).toMatchObject({ id: enrolled.controllerId, profileId: "profile-a" });
      expect(await readFile(paths.clients, "utf8")).not.toContain(enrolled.token);
      await expect(secondProcess.enrol(code, "profile-a")).rejects.toThrow("invalid_enrolment_code");
    } finally { await temp.cleanup(); }
  });

  test("expires enrolment codes after ten minutes", async () => {
    const temp = await temporaryState(); let now = 1_000;
    try {
      const paths = await ensureState(temp.root); const store = new ControllerStore(paths, () => now);
      const { code } = await store.mintCode(); now += 10 * 60 * 1_000;
      await expect(store.enrol(code, "profile")).rejects.toThrow("invalid_enrolment_code");
    } finally { await temp.cleanup(); }
  });

  test("serializes concurrent controller revocations", async () => {
    const temp = await temporaryState();
    try {
      const paths = await ensureState(temp.root);
      const store = new ControllerStore(paths);
      const firstCode = await store.mintCode();
      const secondCode = await store.mintCode();
      const first = await store.enrol(firstCode.code, "first");
      const second = await store.enrol(secondCode.code, "second");
      expect(await Promise.all([store.revoke(first.controllerId), store.revoke(second.controllerId)]))
        .toEqual([true, true]);
      expect(await store.authenticate(first.token)).toBeUndefined();
      expect(await store.authenticate(second.token)).toBeUndefined();
    } finally { await temp.cleanup(); }
  });
});
