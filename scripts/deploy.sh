#!/usr/bin/env bash
# Deploys both Cloudflare Pages projects from a clean build.
#
# Prereq: `wrangler login` (or CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
# env vars). Run from the monorepo root.
#
# Usage:
#   bash scripts/deploy.sh                # deploys both
#   bash scripts/deploy.sh homepage       # only homepage
#   bash scripts/deploy.sh docs           # only docs

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

target="${1:-all}"

# --branch=main pins each deploy to the production environment regardless
# of the local git branch, so the bare https://<project>.pages.dev URL
# always points at our latest deploy.
branch="${BRANCH:-main}"

deploy_homepage() {
	echo "▸ building @sero/homepage"
	pnpm --filter @sero/homepage build
	echo "▸ deploying sero-homepage (branch=$branch)"
	npx wrangler pages deploy apps/homepage/dist \
		--project-name=sero-homepage \
		--branch="$branch" \
		--commit-dirty=true
}

deploy_docs() {
	echo "▸ building @sero/docs-site"
	pnpm --filter @sero/docs-site build
	echo "▸ deploying sero-docs (branch=$branch)"
	npx wrangler pages deploy apps/docs-site/dist \
		--project-name=sero-docs \
		--branch="$branch" \
		--commit-dirty=true
}

case "$target" in
	homepage)  deploy_homepage ;;
	docs)      deploy_docs ;;
	all)       deploy_homepage; deploy_docs ;;
	*)
		echo "Usage: bash scripts/deploy.sh [homepage|docs|all]" >&2
		exit 2
		;;
esac

echo
echo "✓ deploy complete"
echo "  Pages dashboard: https://dash.cloudflare.com/?to=/:account/pages"
