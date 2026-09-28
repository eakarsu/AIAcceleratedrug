#!/usr/bin/env python3
"""Run a provenance-preserving AutoDock Vina job.

The runner never invents a binding box. It requires explicit coordinates or a
named reference ligand in the selected experimental structure. Results are
docking hypotheses for research prioritization, not measured affinity.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from rdkit import Chem
from rdkit.Chem import AllChem, rdMolAlign


ALLOWED_STRUCTURE_HOSTS = {"files.rcsb.org", "models.rcsb.org"}
WATER_CODES = {"HOH", "WAT", "DOD"}


def fail(message: str) -> None:
    raise RuntimeError(message)


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(command: list[str], timeout: int = 300) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, text=True, capture_output=True, timeout=timeout, check=False)
    if result.returncode:
        detail = (result.stderr or result.stdout or "Unknown runner error").strip()
        fail(f"Command failed ({pathlib.Path(command[0]).name}): {detail[-3000:]}")
    return result


def download_structure(url: str, destination: pathlib.Path) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_STRUCTURE_HOSTS:
        fail("Only HTTPS structures from the RCSB coordinate services are accepted.")
    request = urllib.request.Request(url, headers={"User-Agent": "AIAcceleratedrug/1.0 scientific runner"})
    with urllib.request.urlopen(request, timeout=45) as response:
        payload = response.read(25_000_001)
    if len(payload) > 25_000_000:
        fail("Receptor structure exceeds the 25 MB runner limit.")
    if not payload.startswith((b"HEADER", b"ATOM", b"data_")):
        fail("The selected structure service did not return PDB/mmCIF coordinates.")
    destination.write_bytes(payload)


def parse_pdb_atom(line: str) -> dict:
    return {
        "record": line[:6].strip(), "atom": line[12:16].strip(), "altloc": line[16:17],
        "resname": line[17:20].strip(), "chain": line[21:22].strip(), "resid": line[22:26].strip(),
        "x": float(line[30:38]), "y": float(line[38:46]), "z": float(line[46:54]),
        "element": (line[76:78].strip() or line[12:14].strip()[0]).upper(),
    }


def prepare_receptor_source(source: pathlib.Path, receptor: pathlib.Path, reference_ligand: str | None) -> tuple[list[float], list[dict]]:
    if source.suffix.lower() not in {".pdb", ".ent"}:
        fail("Local Vina preparation currently requires an experimental PDB coordinate file.")
    output: list[str] = []
    receptor_atoms: list[dict] = []
    ligand_atoms: list[dict] = []
    reference_code = str(reference_ligand or "").strip().upper()
    for line in source.read_text(errors="replace").splitlines():
        if line.startswith(("ATOM  ", "HETATM")):
            try:
                atom = parse_pdb_atom(line)
            except (ValueError, IndexError):
                continue
            if atom["altloc"] not in {" ", "A"}:
                continue
            if atom["record"] == "ATOM":
                output.append(line)
                receptor_atoms.append(atom)
            elif reference_code and atom["resname"] == reference_code and atom["element"] != "H":
                ligand_atoms.append(atom)
        elif line.startswith("TER"):
            output.append(line)
    output.append("END")
    if len(receptor_atoms) < 100:
        fail("The selected coordinate file does not contain a usable protein receptor.")
    receptor.write_text("\n".join(output) + "\n")
    if not ligand_atoms:
        fail("A reference ligand code or explicit docking-box center is required; no binding site was inferred.")
    center = [sum(atom[key] for atom in ligand_atoms) / len(ligand_atoms) for key in ("x", "y", "z")]
    return center, receptor_atoms


def create_ligand(smiles: str, name: str, destination: pathlib.Path, seed: int) -> None:
    molecule = Chem.MolFromSmiles(smiles)
    if molecule is None or molecule.GetNumHeavyAtoms() < 3:
        fail("The selected compound does not contain a valid drug-like SMILES record.")
    if molecule.GetNumHeavyAtoms() > 150:
        fail("The selected compound exceeds the local docking heavy-atom limit (150).")
    molecule = Chem.AddHs(molecule)
    params = AllChem.ETKDGv3()
    params.randomSeed = int(seed)
    params.useRandomCoords = False
    if AllChem.EmbedMolecule(molecule, params) != 0:
        fail("RDKit could not generate a ligand conformer for docking preparation.")
    if AllChem.MMFFHasAllMoleculeParams(molecule):
        AllChem.MMFFOptimizeMolecule(molecule, maxIters=1000)
    else:
        AllChem.UFFOptimizeMolecule(molecule, maxIters=1000)
    molecule.SetProp("_Name", name)
    writer = Chem.SDWriter(str(destination))
    writer.write(molecule)
    writer.close()


def pose_scores(pdbqt: pathlib.Path) -> list[dict]:
    scores = []
    for line in pdbqt.read_text(errors="replace").splitlines():
        if line.startswith("REMARK VINA RESULT:"):
            fields = line.split()
            scores.append({"rank": len(scores) + 1, "affinityKcalMol": float(fields[3]),
                           "rmsdLowerBound": float(fields[4]), "rmsdUpperBound": float(fields[5])})
    if not scores:
        fail("Vina completed without returning any poses.")
    return scores


def interaction_summary(receptor_atoms: list[dict], poses_sdf: pathlib.Path) -> dict:
    supplier = Chem.SDMolSupplier(str(poses_sdf), removeHs=False, sanitize=False)
    pose = next((item for item in supplier if item is not None), None)
    if pose is None:
        return {"method": "unavailable", "contacts": [], "limitation": "Exported pose could not be parsed."}
    conformer = pose.GetConformer()
    contacts: dict[tuple[str, str, str], dict] = {}
    polar_pairs = 0
    hydrophobic_pairs = 0
    for ligand_atom in pose.GetAtoms():
        if ligand_atom.GetAtomicNum() == 1:
            continue
        point = conformer.GetAtomPosition(ligand_atom.GetIdx())
        ligand_element = ligand_atom.GetSymbol().upper()
        for atom in receptor_atoms:
            dx, dy, dz = point.x-atom["x"], point.y-atom["y"], point.z-atom["z"]
            distance = math.sqrt(dx*dx + dy*dy + dz*dz)
            polar = ligand_element in {"N","O","S"} and atom["element"] in {"N","O","S"} and distance <= 3.5
            hydrophobic = ligand_element == "C" and atom["element"] in {"C","S"} and distance <= 4.5
            if not (polar or hydrophobic):
                continue
            key = (atom["chain"], atom["resname"], atom["resid"])
            current = contacts.setdefault(key, {"chain": atom["chain"] or "—", "residue": atom["resname"],
                "residueNumber": atom["resid"], "minimumDistanceAngstrom": distance, "polarProximities": 0, "hydrophobicContacts": 0})
            current["minimumDistanceAngstrom"] = min(current["minimumDistanceAngstrom"], distance)
            if polar:
                current["polarProximities"] += 1
                polar_pairs += 1
            if hydrophobic:
                current["hydrophobicContacts"] += 1
                hydrophobic_pairs += 1
    ranked = sorted(contacts.values(), key=lambda item: item["minimumDistanceAngstrom"])[:25]
    for item in ranked:
        item["minimumDistanceAngstrom"] = round(item["minimumDistanceAngstrom"], 2)
    return {"method": "geometric proximity screen", "polarProximities": polar_pairs,
            "hydrophobicContacts": hydrophobic_pairs, "contacts": ranked,
            "limitation": "Distance-based proximities are hypotheses, not validated hydrogen bonds, ionic energies, or binding mechanisms."}


def redocking_validation(source: pathlib.Path, reference_code: str | None, smiles: str, poses_sdf: pathlib.Path) -> dict:
    """Compare pose one with the crystallographic ligand when both are the same graph."""
    code = str(reference_code or "").strip().upper()
    if not code:
        return {"available": False, "reason": "No co-crystal reference ligand was selected."}
    native_lines = [line for line in source.read_text(errors="replace").splitlines()
                    if line.startswith("HETATM") and line[17:20].strip().upper() == code]
    if not native_lines:
        return {"available": False, "reason": f"Reference ligand {code} was not found in the coordinate file."}
    try:
        native = Chem.MolFromPDBBlock("\n".join(native_lines + ["TER", "END"]) + "\n", sanitize=False, removeHs=True)
        template = Chem.MolFromSmiles(smiles)
        if native is None or template is None:
            raise ValueError("Reference or submitted ligand graph could not be parsed.")
        native = AllChem.AssignBondOrdersFromTemplate(template, native)
        pose = next((molecule for molecule in Chem.SDMolSupplier(str(poses_sdf), removeHs=True) if molecule), None)
        if pose is None:
            raise ValueError("Best docking pose could not be parsed.")
        rmsd = float(rdMolAlign.GetBestRMS(pose, native))
        return {"available": True, "referenceLigandCode": code, "bestPoseHeavyAtomRmsdAngstrom": round(rmsd, 3),
                "thresholdAngstrom": 2.0, "passed": rmsd <= 2.0,
                "interpretation": "Co-crystal redocking geometry check; not external predictive validation."}
    except Exception as error:
        return {"available": False, "referenceLigandCode": code,
                "reason": f"The submitted compound is not graph-compatible with the selected co-crystal ligand: {error}"}


def main() -> None:
    payload = json.load(sys.stdin)
    output_dir = pathlib.Path(payload["outputDir"]).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    environment = pathlib.Path(sys.executable).parent
    source = output_dir / "receptor_source.pdb"
    receptor = output_dir / "receptor_clean.pdb"
    ligand_sdf = output_dir / "ligand_prepared.sdf"
    receptor_pdbqt = output_dir / "receptor.pdbqt"
    receptor_json = output_dir / "receptor.json"
    ligand_pdbqt = output_dir / "ligand.pdbqt"
    poses_pdbqt = output_dir / "poses.pdbqt"
    poses_sdf = output_dir / "poses.sdf"
    log_path = output_dir / "vina.log"
    seed = int(payload.get("seed", 20260801))
    box_size = [float(value) for value in payload.get("boxSize", [22, 22, 22])]
    if len(box_size) != 3 or any(value < 10 or value > 40 for value in box_size):
        fail("Docking box dimensions must each be between 10 and 40 Å.")
    download_structure(payload["receptorUrl"], source)
    explicit_center = payload.get("boxCenter")
    if explicit_center:
        center = [float(value) for value in explicit_center]
        _, receptor_atoms = prepare_receptor_source(source, receptor, payload.get("referenceLigandCode")) if payload.get("referenceLigandCode") else prepare_receptor_without_site(source, receptor)
    else:
        center, receptor_atoms = prepare_receptor_source(source, receptor, payload.get("referenceLigandCode"))
    if len(center) != 3 or any(not math.isfinite(value) for value in center):
        fail("Docking box center must contain three finite coordinates.")
    create_ligand(payload["smiles"], payload.get("compoundName", "compound"), ligand_sdf, seed)
    run([str(environment / "mk_prepare_receptor.py"), "--read_pdb", str(receptor), "-o", str(output_dir / "receptor"),
         "-p", str(receptor_pdbqt), "-j", str(receptor_json), "-v", str(output_dir / "vina_box.txt"), "-a",
         "--default_altloc", "A",
         "--box_center", *[str(value) for value in center], "--box_size", *[str(value) for value in box_size]], timeout=300)
    run([str(environment / "mk_prepare_ligand.py"), "-i", str(ligand_sdf), "-o", str(ligand_pdbqt), "--add_index_map"], timeout=180)
    vina_result = run([str(environment / "vina"), "--receptor", str(receptor_pdbqt), "--ligand", str(ligand_pdbqt),
        "--center_x", str(center[0]), "--center_y", str(center[1]), "--center_z", str(center[2]),
        "--size_x", str(box_size[0]), "--size_y", str(box_size[1]), "--size_z", str(box_size[2]),
        "--cpu", str(max(1, min(int(payload.get("cpu", 2)), 8))), "--seed", str(seed),
        "--exhaustiveness", str(max(1, min(int(payload.get("exhaustiveness", 8)), 64))),
        "--num_modes", str(max(1, min(int(payload.get("numModes", 9)), 20))), "--out", str(poses_pdbqt)], timeout=1800)
    log_path.write_text(vina_result.stdout + "\n" + vina_result.stderr)
    run([str(environment / "mk_export.py"), str(poses_pdbqt), "-s", str(poses_sdf)], timeout=180)
    scores = pose_scores(poses_pdbqt)
    interactions = interaction_summary(receptor_atoms, poses_sdf)
    redocking = redocking_validation(source, payload.get("referenceLigandCode"), payload["smiles"], poses_sdf)
    artifacts = []
    for path, kind, format_name in [
        (receptor, "prepared_receptor", "PDB"), (receptor_pdbqt, "prepared_receptor", "PDBQT"),
        (ligand_sdf, "prepared_ligand", "SDF"), (ligand_pdbqt, "prepared_ligand", "PDBQT"),
        (poses_pdbqt, "docking_poses", "PDBQT"), (poses_sdf, "docking_poses", "SDF"), (log_path, "runner_log", "TXT")]:
        artifacts.append({"path": str(path), "kind": kind, "format": format_name, "filename": path.name,
                          "checksumSha256": sha256(path), "sizeBytes": path.stat().st_size})
    result = {
        "headline": f"AutoDock Vina generated {len(scores)} docking hypotheses",
        "summary": f"Best Vina score: {scores[0]['affinityKcalMol']:.2f} kcal/mol. This is a docking score, not measured binding affinity.",
        "classification": "docking-hypothesis", "scores": scores, "interactions": interactions, "redockingValidation": redocking,
        "box": {"center": [round(value, 3) for value in center], "size": box_size,
                "source": "explicit coordinates" if explicit_center else f"centroid of co-crystal ligand {payload.get('referenceLigandCode')}"},
        "preparation": {"receptor": "Meeko 0.7.1; ATOM records retained; alternate conformers filtered",
                        "ligand": "RDKit ETKDGv3 + MMFF/UFF; Meeko Gasteiger charges",
                        "seed": seed, "exhaustiveness": int(payload.get("exhaustiveness", 8)), "cpu": int(payload.get("cpu", 2))},
        "uncertainty": {"type": "pose and score spread", "scoreRangeKcalMol": round(scores[-1]["affinityKcalMol"]-scores[0]["affinityKcalMol"], 3),
                        "note": "Vina scores are approximate and are not calibrated probabilities or experimental affinities."},
        "applicability": {"inDomain": True, "domain": "Rigid-receptor docking of a prepared drug-like small molecule into an explicitly defined site."},
        "limitations": ["Rigid receptor and approximate scoring function", "Protonation and tautomer state require expert review",
                        "Binding site derived from a reference ligand unless explicit coordinates were supplied", "Experimental validation is required"],
        "artifacts": artifacts, "provenance": {"runner": "AutoDock Vina", "version": "1.2.7", "meekoVersion": "0.7.1",
            "rdkitVersion": Chem.rdBase.rdkitVersion, "generatedAt": datetime.now(timezone.utc).isoformat(),
            "receptorUrl": payload["receptorUrl"], "structureId": payload.get("structureId")},
    }
    json.dump(result, sys.stdout)


def prepare_receptor_without_site(source: pathlib.Path, receptor: pathlib.Path) -> tuple[list[float], list[dict]]:
    output: list[str] = []
    receptor_atoms: list[dict] = []
    for line in source.read_text(errors="replace").splitlines():
        if line.startswith("ATOM  "):
            try:
                atom = parse_pdb_atom(line)
            except (ValueError, IndexError):
                continue
            if atom["altloc"] not in {" ", "A"}:
                continue
            output.append(line)
            receptor_atoms.append(atom)
        elif line.startswith("TER"):
            output.append(line)
    output.append("END")
    if len(receptor_atoms) < 100:
        fail("The selected coordinate file does not contain a usable protein receptor.")
    receptor.write_text("\n".join(output) + "\n")
    return [], receptor_atoms


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        json.dump({"error": str(error)}, sys.stdout)
        sys.exit(1)
