#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
work_root="$root/.cache/scientific-artifacts/acceptance-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$work_root"

assert_version() {
  local python="$1" package="$2" expected="$3"
  test -x "$python"
  actual="$($python -c 'import importlib.metadata,sys; print(importlib.metadata.version(sys.argv[1]))' "$package")"
  test "$actual" = "$expected"
  printf 'PASS package %-16s %s\n' "$package" "$actual"
}

assert_version "$root/.cache/scientific-envs/docking-conda/bin/python" vina 1.2.7
assert_version "$root/.cache/scientific-envs/docking-conda/bin/python" meeko 0.7.1
assert_version "$root/.cache/scientific-envs/admet/bin/python" admet-ai 2.0.1
assert_version "$root/.cache/scientific-envs/admet/bin/python" chemprop 2.3.0
assert_version "$root/.cache/scientific-envs/reinvent/bin/python" reinvent 4.8.24
assert_version "$root/.cache/scientific-envs/retrosynthesis/bin/python" aizynthfinder 4.4.1

prior="$root/.cache/model-assets/reinvent4-v4.8/reinvent.prior"
stock="$root/.cache/model-assets/aizynthfinder-4.4.1/zinc_stock.hdf5"
test "$(shasum -a 256 "$prior" | awk '{print $1}')" = fe8cd1678452ad292a8f93e97cb19a85959b729e17113e157180d5e69ae89ef3
test "$(shasum -a 256 "$stock" | awk '{print $1}')" = 99d39a6f807c3e815487500bafc2b4a9dc66a31af189e3b1776874fb0d4a188d
printf 'PASS immutable model assets\n'

if [ "${1:-}" != --execute ]; then
  printf 'Static validation passed. Use --execute for full runner acceptance.\n'
  exit 0
fi

"$root/.cache/scientific-envs/docking-conda/bin/python" "$root/scientific-runners/docking/run_vina.py" <<JSON > "$work_root/vina.json"
{"jobId":"acceptance-vina","outputDir":"$work_root/vina","receptorUrl":"https://files.rcsb.org/download/4WKQ.pdb","structureId":"4WKQ","referenceLigandCode":"IRE","smiles":"COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1","compoundName":"gefitinib","boxSize":[22,22,22],"seed":20260801,"cpu":2,"exhaustiveness":8,"numModes":9}
JSON
jq -e '.redockingValidation.passed == true and .redockingValidation.bestPoseHeavyAtomRmsdAngstrom <= 2 and (.scores|length) >= 1' "$work_root/vina.json" >/dev/null
printf 'PASS Vina 4WKQ/IRE redocking acceptance\n'

"$root/.cache/scientific-envs/admet/bin/python" "$root/scientific-runners/admet/run_admet.py" <<JSON > "$work_root/admet.json"
{"jobId":"acceptance-admet","outputDir":"$work_root/admet","smiles":"COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OCCCN1CCOCC1","compoundName":"gefitinib"}
JSON
jq -e '.model.version == "2.0.1" and (.predictions|length) == 104' "$work_root/admet.json" >/dev/null
printf 'PASS ADMET-AI gefitinib endpoint acceptance\n'

"$root/.cache/scientific-envs/reinvent/bin/python" "$root/scientific-runners/generation/run_reinvent.py" <<JSON > "$work_root/reinvent.json"
{"jobId":"acceptance-reinvent","outputDir":"$work_root/reinvent","priorPath":"$prior","numMolecules":16,"seed":20260801,"constraints":{"maxMolecularWeight":500,"maxLogP":5}}
JSON
jq -e '.model.version == "4.8.24" and (.generatedMolecules|length) >= 8 and ([.generatedMolecules[]|select(.withinConstraints)]|length) >= 1' "$work_root/reinvent.json" >/dev/null
printf 'PASS REINVENT4 validity and constraint acceptance\n'

"$root/.cache/scientific-envs/retrosynthesis/bin/python" "$root/scientific-runners/retrosynthesis/run_aizynthfinder.py" <<JSON > "$work_root/aizynth.json"
{"jobId":"acceptance-aizynth","outputDir":"$work_root/aizynth","smiles":"CC(=O)Oc1ccccc1C(=O)O","configPath":"$root/.cache/model-assets/aizynthfinder-4.4.1/config.yml"}
JSON
jq -e '.model.version == "4.4.1" and ([.routes[]|select(.solved)]|length) >= 1 and .routes[0].reactionCount >= 1' "$work_root/aizynth.json" >/dev/null
printf 'PASS AiZynthFinder aspirin route acceptance\n'

printf 'Full local scientific runner acceptance passed. Artifacts: %s\n' "$work_root"
