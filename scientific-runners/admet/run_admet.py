#!/usr/bin/env python3
"""Run the pinned ADMET-AI model and emit a provenance-rich JSON result."""
from __future__ import annotations

import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys

from admet_ai import ADMETModel
from rdkit import Chem


def main() -> None:
    request = json.load(sys.stdin)
    smiles = str(request.get("smiles") or "").strip()
    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None:
        raise ValueError("The compound does not contain a valid standardized SMILES string.")
    canonical = Chem.MolToSmiles(molecule, canonical=True)
    output_dir = Path(str(request["outputDir"])).resolve()
    output_dir.mkdir(parents=True, exist_ok=True, mode=0o750)
    # Lightning/Rich write progress to stdout, including from spawned workers. Keep
    # stdout a strict JSON protocol by temporarily sending file descriptor 1 to stderr.
    sys.stdout.flush()
    saved_stdout = os.dup(1)
    try:
        os.dup2(2, 1)
        model = ADMETModel(num_workers=max(1, min(4, int(request.get("cpu", 1)))))
        predictions = model.predict(canonical)
    finally:
        sys.stdout.flush()
        os.dup2(saved_stdout, 1)
        os.close(saved_stdout)
    normalized = {str(key): float(value) for key, value in predictions.items()}
    version = importlib.metadata.version("admet-ai")
    chemprop_version = importlib.metadata.version("chemprop")
    payload = {
        "headline": "ADMET-AI endpoint panel completed",
        "summary": f"Generated {len(normalized)} model endpoints for {request.get('compoundName') or 'the selected compound'}.",
        "model": {"key": "admet-ai", "version": version, "chempropVersion": chemprop_version},
        "canonicalSmiles": canonical,
        "predictions": normalized,
        "metrics": [
            {"label": "Endpoints", "value": len(normalized)},
            {"label": "ADMET-AI version", "value": version},
            {"label": "Chemprop version", "value": chemprop_version},
        ],
        "uncertainty": {
            "calibratedIntervalsAvailable": False,
            "note": "This runner returns model point estimates. It does not invent calibrated confidence intervals.",
        },
        "applicability": {
            "domain": "Drug-like small molecules accepted by the pinned ADMET-AI model suite.",
            "inDomain": None,
            "note": "Endpoint-specific applicability requires benchmark and chemical-space review.",
        },
        "scientificBoundary": "Research prioritization only; predictions are not measured ADMET, toxicology, clinical, or regulatory evidence.",
    }
    artifact_path = output_dir / "admet_predictions.json"
    artifact_path.write_text(json.dumps(payload, indent=2, sort_keys=True), encoding="utf-8")
    checksum = hashlib.sha256(artifact_path.read_bytes()).hexdigest()
    payload["artifacts"] = [{
        "kind": "admet_predictions", "format": "JSON", "filename": artifact_path.name,
        "path": os.fspath(artifact_path), "checksumSha256": checksum,
    }]
    print(json.dumps(payload))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # runner boundary must return a machine-readable failure
        print(json.dumps({"error": str(error), "type": type(error).__name__}))
        raise SystemExit(1)
