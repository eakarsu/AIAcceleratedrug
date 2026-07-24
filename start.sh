#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$root"
test -f .env || { echo 'Missing .env; copy .env.example and configure it.' >&2; exit 1; }
set -a; source .env; set +a; : "${BACKEND_PORT:=3001}" "${FRONTEND_PORT:=3000}"
export RUNTIME_PROJECT_NAME="AI Accelerated Drug Discovery"
export RUNTIME_AI_ENDPOINT="/api/ai/drug-discovery-review"
export RUNTIME_AI_FEATURE="drug-discovery-evidence-review"
export RUNTIME_AI_SYSTEM_PROMPT="Review drug-discovery evidence, scientific uncertainty, safety boundaries, and practical next validation steps."
test -d backend/node_modules && test -d frontend/node_modules || { echo 'Dependencies absent; run scripts/bootstrap.sh.' >&2; exit 1; }
for port in "$BACKEND_PORT" "$FRONTEND_PORT"; do if lsof -ti ":$port" >/dev/null 2>&1; then echo "Port $port is occupied; refusing to terminate another process." >&2; exit 1; fi; done
if [ "${MIGRATE_ON_START:-false}" = true ]; then
  case "${ALLOW_SCHEMA_MIGRATION:-}" in 1|true) ;; *) echo 'ALLOW_SCHEMA_MIGRATION=1 or true is required for startup migration.' >&2; exit 1;; esac
  ./scripts/migrate.sh
  node backend/scripts/create-admin.js
fi
(cd backend && CLIENT_URL="http://127.0.0.1:$FRONTEND_PORT" npm start) & backend_pid=$!
(cd frontend && npm run dev -- --port "$FRONTEND_PORT" --host 127.0.0.1) & frontend_pid=$!
cleanup(){ kill "$backend_pid" "$frontend_pid" 2>/dev/null || true; }; trap cleanup EXIT INT TERM
wait "$backend_pid" "$frontend_pid"
