#!/usr/bin/env python3
"""Run AiZynthFinder with pinned public USPTO policies and ZINC stock."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys

from rdkit import Chem


def walk(node: dict, reactions: list[dict], precursors: list[dict]) -> None:
    if node.get('is_reaction'):
        metadata=node.get('metadata') or {}; reactions.append({'reactionSmiles':node.get('smiles'),'policy':metadata.get('policy_name'),
          'policyProbability':metadata.get('policy_probability'),'templateCode':metadata.get('template_code'),'classification':metadata.get('classification')})
    if node.get('is_chemical') and node.get('in_stock'):
        precursors.append({'smiles':node.get('smiles'),'inStock':True})
    for child in node.get('children') or []: walk(child,reactions,precursors)


def main() -> None:
    request=json.load(sys.stdin); smiles=str(request.get('smiles') or '').strip()
    if Chem.MolFromSmiles(smiles) is None: raise ValueError('A valid standardized product SMILES is required.')
    output_dir=Path(request['outputDir']).resolve(); output_dir.mkdir(parents=True,exist_ok=True,mode=0o750)
    config=Path(os.environ.get('AIZYNTHFINDER_CONFIG') or request.get('configPath') or '').resolve()
    if not config.is_file(): raise ValueError('AiZynthFinder public policy, template, and stock configuration is required.')
    routes_path=output_dir/'routes.json'; log_path=output_dir/'aizynthfinder.log'; cli=Path(sys.executable).parent/'aizynthcli'
    command=[str(cli),'--smiles',smiles,'--config',str(config),'--policy','uspto','--filter','uspto','--stocks','zinc','--output',str(routes_path)]
    result=subprocess.run(command,text=True,capture_output=True,timeout=1800,check=False); log_path.write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
    if result.returncode or not routes_path.is_file(): raise RuntimeError((result.stderr or result.stdout or 'AiZynthFinder did not create routes.')[-4000:])
    raw=json.loads(routes_path.read_text(encoding='utf-8')); routes=[]
    for index,tree in enumerate(raw[:20],1):
        reactions=[]; precursors=[]; walk(tree,reactions,precursors); scores=tree.get('scores') or {}; metadata=tree.get('metadata') or {}
        routes.append({'rank':index,'solved':bool(metadata.get('is_solved')),'score':scores.get('state score'),'reactionCount':len(reactions),
          'precursorCount':len(precursors),'precursors':precursors,'reactions':reactions})
    artifacts=[]
    for path,kind,format_name in [(routes_path,'retrosynthesis_routes','JSON'),(log_path,'runner_log','TXT')]:
        artifacts.append({'kind':kind,'format':format_name,'filename':path.name,'path':os.fspath(path),'checksumSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    payload={'headline':f'AiZynthFinder generated {len(routes)} ranked synthesis routes','summary':f'{sum(item["solved"] for item in routes)} displayed routes terminate in the configured ZINC stock.',
      'model':{'key':'aizynthfinder','version':importlib.metadata.version('aizynthfinder'),'policy':'USPTO ONNX','stock':'ZINC public stock'},'routes':routes,
      'metrics':[{'label':'Displayed routes','value':len(routes)},{'label':'Solved routes','value':sum(item['solved'] for item in routes)},
        {'label':'Top route steps','value':routes[0]['reactionCount'] if routes else None},{'label':'Top route score','value':routes[0]['score'] if routes else None}],
      'uncertainty':{'note':'Route ranking and template coverage do not establish experimental yield, feasibility, safety, cost, freedom to operate, or scale-up success.'},
      'applicability':{'domain':'Organic small molecules covered by the pinned USPTO template policy and configured ZINC stock.','inDomain':bool(routes)},
      'scientificBoundary':'Every route requires chemist review and experimental validation. In-stock means present in the configured reference stock, not currently purchasable.',
      'artifacts':artifacts}
    print(json.dumps(payload))


if __name__=='__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'error':str(error),'type':type(error).__name__})); raise SystemExit(1)
