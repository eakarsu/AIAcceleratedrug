#!/usr/bin/env bash
set -euo pipefail
test "${CONFIRM_DEMO_SEED:-}" = YES || { echo 'Set CONFIRM_DEMO_SEED=YES to load non-production fixtures.' >&2; exit 1; }
test "${NODE_ENV:-development}" != production || { echo 'Demo seed is disabled in production.' >&2; exit 1; }
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$root/backend"; node src/seeds/seed.js
"$root/scripts/migrate.sh"
