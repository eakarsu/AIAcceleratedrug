#!/usr/bin/env python3
"""Sample molecules from a pinned REINVENT4 prior and rank transparent constraints."""
from __future__ import annotations

import csv
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import subprocess
import sys

from rdkit import Chem
from rdkit.Chem import Crippen, Descriptors, Lipinski, QED, rdMolDescriptors


def main() -> None:
    request=json.load(sys.stdin); output_dir=Path(request['outputDir']).resolve(); output_dir.mkdir(parents=True,exist_ok=True,mode=0o750)
    prior=Path(os.environ.get('REINVENT_PRIOR_PATH') or request.get('priorPath') or '').resolve()
    if not prior.is_file(): raise ValueError('A pinned REINVENT4 prior file is required.')
    count=max(8,min(256,int(request.get('numMolecules',32)))); seed=int(request.get('seed',20260801)); output=output_dir/'generated.csv'
    config=output_dir/'sampling.toml'; config.write_text(f'''run_type = "sampling"\ndevice = "cpu"\n[parameters]\nmodel_file = "{prior}"\noutput_file = "{output}"\nnum_smiles = {count}\nunique_molecules = true\nrandomize_smiles = true\n''',encoding='utf-8')
    command=[str(Path(sys.executable).parent/'reinvent'),'--seed',str(seed),'--device','cpu',str(config)]
    result=subprocess.run(command,text=True,capture_output=True,timeout=1800,check=False)
    (output_dir/'reinvent.log').write_text(result.stdout+'\n'+result.stderr,encoding='utf-8')
    if result.returncode: raise RuntimeError((result.stderr or result.stdout)[-4000:])
    constraints=request.get('constraints') or {}; max_mw=float(constraints.get('maxMolecularWeight',500)); max_logp=float(constraints.get('maxLogP',5))
    candidates=[]
    with output.open(newline='',encoding='utf-8') as handle:
        for row in csv.DictReader(handle):
            smiles=row.get('SMILES') or row.get('smiles') or next((value for value in row.values() if Chem.MolFromSmiles(str(value))),None)
            molecule=Chem.MolFromSmiles(str(smiles or ''))
            if molecule is None: continue
            record={'smiles':Chem.MolToSmiles(molecule),'molecularWeight':round(Descriptors.MolWt(molecule),3),'xlogp':round(Crippen.MolLogP(molecule),3),
                    'tpsa':round(rdMolDescriptors.CalcTPSA(molecule),3),'hbondDonors':Lipinski.NumHDonors(molecule),'hbondAcceptors':Lipinski.NumHAcceptors(molecule),
                    'qed':round(QED.qed(molecule),4),'sourceNll':float(row.get('NLL') or row.get('nll') or 0)}
            record['withinConstraints']=record['molecularWeight']<=max_mw and record['xlogp']<=max_logp; candidates.append(record)
    candidates.sort(key=lambda item:(not item['withinConstraints'],-item['qed'],item['sourceNll']))
    log=output_dir/'reinvent.log'; artifacts=[]
    for path,kind,format_name in [(output,'generated_molecules','CSV'),(config,'runner_config','TOML'),(log,'runner_log','TXT')]:
        artifacts.append({'kind':kind,'format':format_name,'filename':path.name,'path':os.fspath(path),'checksumSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    payload={'headline':f'REINVENT4 generated {len(candidates)} unique molecules','summary':'Candidates are ranked by explicit physicochemical constraints and QED; no potency or safety claim was generated.',
      'model':{'key':'reinvent4','version':importlib.metadata.version('reinvent'),'priorChecksumSha256':hashlib.sha256(prior.read_bytes()).hexdigest()},
      'generatedMolecules':candidates,'metrics':[{'label':'Generated','value':len(candidates)},{'label':'Within constraints','value':sum(item['withinConstraints'] for item in candidates)},{'label':'Seed','value':seed}],
      'uncertainty':{'note':'Sampling variability is controlled by the recorded seed. QED and descriptor constraints are not biological uncertainty.'},
      'applicability':{'domain':'Chemical space represented by the pinned public REINVENT prior.','inDomain':None},
      'scientificBoundary':'Generated structures are computational proposals. Validate identity, novelty, synthesizability, selectivity, ADMET, safety, IP, and activity before use.',
      'artifacts':artifacts}
    print(json.dumps(payload))


if __name__=='__main__':
    try: main()
    except Exception as error:
        print(json.dumps({'error':str(error),'type':type(error).__name__})); raise SystemExit(1)
