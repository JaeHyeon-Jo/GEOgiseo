#!/usr/bin/env bash
set -euo pipefail

# Keep package-manager shims and downloads inside this checkout.
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export COREPACK_HOME="${COREPACK_HOME:-$repo_root/.local/corepack}"
mkdir -p "$repo_root/.local/bin"
corepack enable --install-directory "$repo_root/.local/bin" pnpm
export PATH="$repo_root/.local/bin:$PATH"
exec corepack pnpm "$@"
