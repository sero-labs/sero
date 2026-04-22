# Overview

Sero is a **local-first, agent-first desktop workspace for macOS**.

It brings together:
- project workspaces
- agent chat backed by Pi
- plugin apps and tool integrations
- terminals, previews, and runtime orchestration
- local development workflows inside a single desktop shell

## What Sero is trying to solve

Sero is built for users who want fewer context switches between editor,
terminals, AI tooling, app-specific workflows, and project coordination.

The project goal is not just “AI in an editor.” It is a workspace layer where:
- Pi is the intelligence layer
- workspaces are first-class
- runtime mode can be container-backed or host-based
- plugins can extend both UI and agent capabilities

## Current alpha scope

The current OSS alpha is intentionally narrow:
- **platform:** macOS on Apple Silicon
- **distribution:** source-only
- **preferred runtime:** Apple container-backed workspaces
- **fallback runtime:** host mode with reduced capabilities

Sero does **not** currently promise official binaries, Linux support, Windows
support, or fully stable internal runtime/plugin contracts.

## Canonical source material

This docs site is the curated public surface for alpha. The current source
material it draws from includes:
- `docs/sero.md`
- `docs/architecture.md`
- `docs/plugins/guide.md`
- `docs/testing/eval-guide.md`
- `docs/security/gateway.md`
