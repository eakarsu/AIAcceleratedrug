#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a; source "$root/.env"; [ ! -f "$root/.env.science.local" ] || source "$root/.env.science.local"; set +a
: "${BACKEND_PORT:=30010}" "${FRONTEND_PORT:=30011}"
email="${PROVISION_ADMIN_EMAIL:-${BOOTSTRAP_ADMIN_EMAIL:-${SEED_ADMIN_EMAIL:-${DEMO_EMAIL:-${ADMIN_EMAIL:-}}}}}"
password="${PROVISION_ADMIN_PASSWORD:-${BOOTSTRAP_ADMIN_PASSWORD:-${SEED_ADMIN_PASSWORD:-${DEMO_PASSWORD:-${ADMIN_PASSWORD:-}}}}}"
test -n "$email" && test -n "$password"

login="$(curl -fsS -H 'Content-Type: application/json' -d "$(jq -nc --arg email "$email" --arg password "$password" '{email:$email,password:$password}')" "http://127.0.0.1:${BACKEND_PORT}/api/auth/login")"
token="$(printf '%s' "$login" | jq -er .token)"
auth="Authorization: Bearer $token"
test "$(curl -fsS "http://127.0.0.1:${BACKEND_PORT}/api/health" | jq -r .status)" = ok
test "$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${FRONTEND_PORT}/discovery")" = 200

bootstrap="$(curl -fsS -H "$auth" "http://127.0.0.1:${BACKEND_PORT}/api/discovery/bootstrap")"
test "$(printf '%s' "$bootstrap" | jq -r .counts.proteins)" -ge 15
test "$(printf '%s' "$bootstrap" | jq -r .counts.compounds)" -ge 15
test "$(printf '%s' "$bootstrap" | jq '.assays|length')" -ge 15
test "$(printf '%s' "$bootstrap" | jq '.experiments|length')" -ge 15
test "$(printf '%s' "$bootstrap" | jq '[.capabilities[]|select(.capability=="rdkit" and .enabled)]|length')" = 1
test "$(printf '%s' "$bootstrap" | jq '[.capabilities[]|select(.capability=="pgvector" and .enabled)]|length')" = 1

structures="$(curl -fsS -H "$auth" "http://127.0.0.1:${BACKEND_PORT}/api/discovery/structures?limit=100")"
test "$(printf '%s' "$structures" | jq -r .summary.total)" -ge 15
test "$(printf '%s' "$structures" | jq '.data|length')" -ge 15
test "$(printf '%s' "$structures" | jq '[.data[]|select(.protein_name and .external_id and .uri)]|length')" -ge 15

protein="$(curl -fsS -H "$auth" -H 'Content-Type: application/json' -d '{"input":"P00533","mode":"uniprot"}' "http://127.0.0.1:${BACKEND_PORT}/api/discovery/resolve/protein")"
compound="$(curl -fsS -H "$auth" -H 'Content-Type: application/json' -d '{"input":"gefitinib","mode":"auto"}' "http://127.0.0.1:${BACKEND_PORT}/api/discovery/resolve/compound")"
protein_id="$(printf '%s' "$protein" | jq -er .protein.id)"; compound_id="$(printf '%s' "$compound" | jq -er .compound.id)"
test "$(printf '%s' "$protein" | jq -r .protein.uniprot_id)" = P00533
test "$(printf '%s' "$compound" | jq -r .compound.pubchem_cid)" = 123631

analyst="$(curl -fsS --max-time 90 -H "$auth" -H 'Content-Type: application/json' -d "$(jq -nc --arg p "$protein_id" --arg c "$compound_id" '{proteinId:($p|tonumber),compoundId:($c|tonumber),question:"Describe the protein and show its scientific models.",useAi:false}')" "http://127.0.0.1:${BACKEND_PORT}/api/discovery/protein-analyst")"
test "$(printf '%s' "$analyst" | jq -r .protein.uniprot_id)" = P00533
test "$(printf '%s' "$analyst" | jq '.structures|length')" -ge 1
test "$(printf '%s' "$analyst" | jq '.sources|length')" -ge 2
test "$(printf '%s' "$analyst" | jq '.report.sections|length')" -ge 1
test "$(printf '%s' "$analyst" | jq -r .analysis.status)" = source_summary

chemistry="$(curl -fsS -H "$auth" -H 'Content-Type: application/json' -d "$(jq -nc --arg id "$compound_id" '{compoundId:$id,mode:"similarity"}')" "http://127.0.0.1:${BACKEND_PORT}/api/discovery/search/chemistry")"
test "$(printf '%s' "$chemistry" | jq -r .native)" = true
test "$(printf '%s' "$chemistry" | jq '.results|length')" -ge 1

enrichment="$(curl -fsS --max-time 90 -H "$auth" -H 'Content-Type: application/json' -d "$(jq -nc --arg p "$protein_id" --arg c "$compound_id" '{proteinId:$p,compoundId:$c}')" "http://127.0.0.1:${BACKEND_PORT}/api/discovery/enrich/evidence")"
test "$(printf '%s' "$enrichment" | jq -r .stored.activities)" -ge 1
test "$(printf '%s' "$enrichment" | jq -r .stored.publications)" -ge 1
test "$(printf '%s' "$enrichment" | jq -r .stored.trials)" -ge 1

consensus="$(curl -fsS -H "$auth" -H 'Content-Type: application/json' -d "$(jq -nc --arg p "$protein_id" --arg c "$compound_id" '{modelKey:"bioactivity-consensus",proteinId:$p,compoundId:$c}')" "http://127.0.0.1:${BACKEND_PORT}/api/discovery/predictions")"
test "$(printf '%s' "$consensus" | jq -r .job.status)" = completed
job_id="$(printf '%s' "$consensus" | jq -er .job.id)"
curl -fsS -H "$auth" -H 'Content-Type: application/json' -d '{"decision":"needs_evidence","rationale":"Automated smoke review: laboratory validation remains required."}' "http://127.0.0.1:${BACKEND_PORT}/api/discovery/predictions/${job_id}/reviews" >/dev/null

test "$(curl -fsS "${MODEL_RUNNER_URL:-http://127.0.0.1:35580}/health" | jq -r .status)" = ready
if [ "${LIVE_OPENROUTER:-false}" = true ]; then
  protein_ai="$(curl -fsS --max-time 120 -H "$auth" -H 'Content-Type: application/json' -d "$(jq -nc --arg p "$protein_id" --arg c "$compound_id" '{proteinId:($p|tonumber),compoundId:($c|tonumber),question:"Describe this protein, cite the supplied sources, and distinguish experimental from predicted structures.",useAi:true}')" "http://127.0.0.1:${BACKEND_PORT}/api/discovery/protein-analyst")"
  test "$(printf '%s' "$protein_ai" | jq -r .analysis.status)" = completed
  test "$(printf '%s' "$protein_ai" | jq -r .analysis.provider)" = OpenRouter
  test "$(printf '%s' "$protein_ai" | jq '.report.keyFacts|length')" -ge 1
  synthesis="$(curl -fsS --max-time 120 -H "$auth" -H 'Content-Type: application/json' -d "$(jq -nc --arg p "$protein_id" --arg c "$compound_id" '{modelKey:"openrouter-synthesis",proteinId:$p,compoundId:$c,instruction:"Identify evidence gaps without inventing results."}')" "http://127.0.0.1:${BACKEND_PORT}/api/discovery/predictions")"
  test "$(printf '%s' "$synthesis" | jq -r .job.status)" = completed
fi

echo "Scientific smoke passed: authentication, React, RDKit, pgvector, sources, operations, models, review, and runner."
