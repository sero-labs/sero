# Security Policy

## Supported versions

Sero is currently in a **source-only OSS alpha** stage.

| Version / surface | Supported for security reports? |
| --- | --- |
| latest `main` branch state | Yes |
| current OSS alpha tags, when published | Yes, best effort |
| older commits, local forks, and heavily modified builds | No |
| third-party plugins outside this monorepo | No — report to the plugin author |

## Reporting a vulnerability

Please **do not** open a public GitHub issue or public PR for security
problems.

Use one of these private channels:
1. **Preferred:** GitHub private vulnerability reporting / security advisories,
   if enabled for the repository.
2. **Fallback:** email `danielrosscarter@gmail.com` with the subject line
   `[Sero Security]`.

Please include:
- a clear description of the issue
- affected area(s) and expected impact
- reproduction steps or a proof of concept
- the commit SHA, branch, or build context you tested
- whether the issue requires local access, profile access, network access, or a
  malicious plugin/workspace

Please do **not** include:
- raw API keys
- gateway tokens
- OAuth tokens
- full auth files
- screenshots that expose secrets or private local paths

If sensitive material is necessary to explain the issue, redact it first and
note what was removed.

## What to expect

Sero is maintained on a best-effort basis during alpha, but the intent is to:
- acknowledge valid reports within a few business days
- investigate severity and scope
- work toward a fix or mitigation
- coordinate disclosure once a fix, mitigation, or clear advisory exists

## Scope notes

Relevant security-report areas include:
- the desktop application in this monorepo
- auth, token, and local secret handling
- gateway / remote-control surfaces
- workspace/container execution boundaries
- plugin loading and plugin installation paths in the core app
- public docs or examples that encourage unsafe behavior

Out of scope unless they create a vulnerability in Sero itself:
- bugs in third-party services
- vulnerabilities in external plugin repositories
- issues that only exist in unsupported local modifications

## Operational guidance for reporters

If you believe a secret has been exposed:
- rotate the secret first if you can do so safely
- avoid posting it in any GitHub artifact, issue, or PR
- tell us what was rotated so we can assess residual impact

Thank you for helping make Sero safer.
