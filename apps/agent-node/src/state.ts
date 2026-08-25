import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export interface StatePaths {
  root: string; tasks: string; workspaces: string; sessions: string; blobs: string;
  identityKey: string; identityCert: string; tlsKey: string; tlsCert: string; clients: string; enrolments: string;
}

export function statePaths(root: string): StatePaths {
  return {
    root, tasks: join(root, "tasks"), workspaces: join(root, "workspaces"), sessions: join(root, "sessions"),
    blobs: join(root, "blobs"), identityKey: join(root, "identity.key"), identityCert: join(root, "identity.crt"),
    tlsKey: join(root, "tls.key"), tlsCert: join(root, "tls.crt"), clients: join(root, "clients.json"), enrolments: join(root, "enrolments.json"),
  };
}

export async function ensureState(root: string): Promise<StatePaths> {
  const paths = statePaths(resolve(root));
  await mkdir(paths.root, { recursive: true, mode: 0o700 });
  await chmod(paths.root, 0o700);
  for (const directory of [paths.tasks, paths.workspaces, paths.sessions, paths.blobs]) {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
  }
  await assertIdentityPermissions(paths.identityKey);
  await ensureIdentity(paths);
  if (!(await Bun.file(paths.clients).exists())) await secureWrite(paths.clients, "[]\n");
  if (!(await Bun.file(paths.enrolments).exists())) await secureWrite(paths.enrolments, "[]\n");
  return paths;
}

export async function assertIdentityPermissions(path: string): Promise<void> {
  if (!(await Bun.file(path).exists())) return;
  const mode = (await stat(path)).mode & 0o777;
  if ((mode & 0o077) !== 0) throw new Error(`identity.key has unsafe mode ${mode.toString(8)}`);
}

function openssl(args: string[]): void {
  const result = spawnSync("openssl", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`openssl failed: ${result.stderr.trim()}`);
}

async function ensureIdentity(paths: StatePaths): Promise<void> {
  if (!(await Bun.file(paths.identityKey).exists())) {
    openssl(["genpkey", "-algorithm", "ED25519", "-out", paths.identityKey]);
    await chmod(paths.identityKey, 0o600);
  }
  if (!(await Bun.file(paths.identityCert).exists())) {
    openssl(["req", "-new", "-x509", "-key", paths.identityKey, "-out", paths.identityCert, "-days", "36500", "-subj", "/CN=Sero Agent Node Identity", "-addext", "basicConstraints=critical,CA:TRUE"]);
    await chmod(paths.identityCert, 0o644);
  }
  if (!(await leafIsValid(paths))) await rotateTls(paths);
}

async function leafIsValid(paths: StatePaths): Promise<boolean> {
  if (!(await Bun.file(paths.tlsKey).exists()) || !(await Bun.file(paths.tlsCert).exists())) return false;
  const check = spawnSync("openssl", ["x509", "-checkend", "0", "-noout", "-in", paths.tlsCert]);
  if (check.status !== 0) return false;
  const cert = spawnSync("openssl", ["x509", "-pubkey", "-noout", "-in", paths.tlsCert], { encoding: "utf8" });
  const key = spawnSync("openssl", ["pkey", "-pubout", "-in", paths.tlsKey], { encoding: "utf8" });
  return cert.status === 0 && key.status === 0 && cert.stdout === key.stdout;
}

export async function rotateTls(paths: StatePaths): Promise<void> {
  await mkdir(dirname(paths.tlsKey), { recursive: true });
  openssl(["genpkey", "-algorithm", "RSA", "-pkeyopt", "rsa_keygen_bits:2048", "-out", paths.tlsKey]);
  await chmod(paths.tlsKey, 0o600);
  const csr = `${paths.tlsCert}.csr`;
  openssl(["req", "-new", "-key", paths.tlsKey, "-out", csr, "-subj", "/CN=sero-node", "-addext", "subjectAltName=DNS:sero-node"]);
  openssl(["x509", "-req", "-in", csr, "-CA", paths.identityCert, "-CAkey", paths.identityKey, "-set_serial", `0x${randomBytes(16).toString("hex")}`, "-out", paths.tlsCert, "-days", "3650", "-copy_extensions", "copy"]);
  await Bun.file(csr).delete();
  await chmod(paths.tlsCert, 0o644);
}

export async function identityFingerprint(paths: StatePaths): Promise<string> {
  const result = spawnSync("openssl", ["x509", "-pubkey", "-noout", "-in", paths.identityCert], { encoding: "utf8" });
  if (result.status !== 0) throw new Error("cannot read identity public key");
  const der = spawnSync("openssl", ["pkey", "-pubin", "-outform", "DER"], { input: result.stdout });
  if (der.status !== 0) throw new Error("cannot encode identity public key");
  return createHash("sha256").update(der.stdout).digest("hex");
}

export async function confinedWorkspace(paths: StatePaths, requested: string): Promise<string> {
  const root = await realpath(paths.workspaces);
  const target = resolve(root, requested);
  const lexical = relative(root, target);
  if (!lexical || lexical.startsWith("..") || resolve(root, lexical) !== target) throw new Error("workspace_outside_root");
  await mkdir(target, { recursive: true, mode: 0o700 });
  const actual = await realpath(target);
  const rel = relative(root, actual);
  if (!rel || rel.startsWith("..") || resolve(root, rel) !== actual) throw new Error("workspace_outside_root");
  return actual;
}

export async function secureWrite(path: string, content: string): Promise<void> {
  await writeFile(path, content, { mode: 0o600 });
  await chmod(path, 0o600);
}

export async function tlsFiles(paths: StatePaths): Promise<{ key: string; cert: string }> {
  return { key: await readFile(paths.tlsKey, "utf8"), cert: `${await readFile(paths.tlsCert, "utf8")}\n${await readFile(paths.identityCert, "utf8")}` };
}
