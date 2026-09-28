# Scientific discovery workbench

The `/discovery` workspace is the evidence-aware center of AIAcceleratedrug. It supports the first small-molecule workflow end to end:

1. Ask the Protein AI Analyst a natural-language question using a protein name, UniProt accession, or FASTA sequence.
2. Receive a structured OpenRouter report grounded in source IDs, with invalid citations removed before presentation.
3. Automatically inspect experimental PDB and AlphaFold models beside the report in Mol*.
4. Review domains, active sites, binding sites, natural variants, mutagenesis annotations, linked compounds, and literature.
5. Resolve a known compound by name, PubChem CID, or SMILES, or register an SDF artifact.
6. Enrich the selected pair with exact ChEMBL activity records, Europe PMC publications, and ClinicalTrials.gov studies.
7. Run native RDKit similarity/substructure searches and store protein representations in pgvector.
8. Compare known bioactivity evidence with versioned model output and record a human decision.
9. Save the pair as an auditable research candidate and advance it through projects, assays, and experiment plans.

## Advanced discovery operations

The `/advanced-discovery` workspace extends the evidence workbench with tenant-scoped execution and governance workflows:

- Batch evidence-readiness screening across the compound catalog
- Transparent Pareto triage across measured-evidence coverage, descriptor completeness, and threshold violations
- Versioned job contracts for ESM C, Chemprop, ADMET-AI, Boltz-2, DiffDock, AutoDock Vina, REINVENT4, and AiZynthFinder
- Dataset version, source, license, checksum, quality, and split-strategy registration
- Model validation records with measured metrics, calibration information, acceptance thresholds, and review state
- Human review decisions for screening, optimization, external-model jobs, and validation records
- PostgreSQL-backed local execution jobs with progress, cancellation, bounded retry, restart recovery, immutable events, checksummed artifacts, and PDF/CSV/JSON exports
- Interactive protein/ligand docking-pose review with explicit experimental-versus-computational labels

Evidence-readiness and Pareto workflows execute locally and state their non-predictive scope in every result. Four pinned scientific engines also execute through the local queue:

- AutoDock Vina 1.2.7 with RDKit/Meeko preparation, an explicit co-crystal-derived or user-supplied box, ranked poses, geometric contacts, and structure artifacts
- ADMET-AI 2.0.1 with Chemprop 2.3.0, returning its 104-endpoint panel as point estimates without invented calibrated intervals
- REINVENT4 4.8.24 with the checksummed public PubChem prior, a recorded random seed, and transparent descriptor constraints
- AiZynthFinder 4.4.1 with pinned public USPTO ONNX policies/templates and a checksummed ZINC reference stock

A heavyweight-model action creates a `blocked` job when its validated runner is absent. That job contains deployment requirements and explicitly records that no prediction was generated. Once a runner is installed and its model version is promoted from `not_configured`, the same API contract submits normalized protein, compound, objective, and constraint inputs to the isolated runner.

The advanced workflow schema is defined in `backend/migrations/005_advanced_discovery_workflows.sql`. It stores screening campaigns and ranked results, optimization frontiers, model-runner jobs, dataset versions, model validations, and human reviews in PostgreSQL.

## Protein AI Analyst

`POST /api/discovery/protein-analyst` combines the currently selected scientific record with structure evidence, reviewed UniProt annotations, stored protein–compound measurements, and term-matched literature. The default React action resolves the protein first, sends only this bounded evidence context to OpenRouter, validates returned citation identifiers against the source register, stores the versioned prediction job, and renders the result as a professional decision brief rather than raw JSON.

If OpenRouter is unavailable or returns incomplete JSON, the endpoint produces an explicitly labeled deterministic source summary. It never presents that fallback as AI output. Experimental PDB entries, AlphaFold predictions, docking hypotheses, and AI-complex predictions retain separate labels throughout the interface.

## Scientific integrity boundaries

- Experimental, AlphaFold-predicted, docked, and AI-predicted structures use different explicit labels.
- Seed evidence is a demonstration index and is marked for source verification. It is not a substitute for a curated assay record.
- OpenRouter organizes evidence and gaps. It is not treated as a binding, potency, toxicity, or clinical-outcome model.
- A scientific adapter returns `blocked` when its runner is absent. The API never manufactures substitute scores.
- Every prediction stores model and dataset versions, applicability, uncertainty, provenance, inputs, status, and timestamp.
- All predictions support research prioritization only. Laboratory, clinical, safety, regulatory, and IP validation remain mandatory.

## Data architecture

PostgreSQL is the system of record for source metadata, normalized proteins and compounds, structures, bioactivities, model versions, prediction jobs, candidates, artifacts, and provenance events. SDF files are content-addressed under ignored local object storage; PostgreSQL stores their URI, SHA-256 checksum, size, owner, and metadata.

The migration detects optional extensions:

- With `vector`, it creates `scientific_embeddings` using the native `vector` type.
- With `rdkit`, it creates `scientific_rdkit_molecules`, populates molecules from stored SMILES, and adds a GiST chemical index.
- Without either extension, the API remains functional and reports the fallback state. It does not claim native similarity or substructure capability.

The repository now includes `docker-compose.science.yml`, which builds PostgreSQL 16 with both extensions. The ignored `.env.science.local` makes `start.sh` use this service locally. Production deployments should replace local object storage and development credentials with managed services. Large structures, conformers, and model weights do not belong in database bytea columns.

## Source adapters

| Source | Capability | Provenance retained |
|---|---|---|
| UniProt REST | identifiers, sequence, function, pathways, diseases, features, isoforms | accession, URL, payload, retrieval time |
| RCSB Search | experimental PDB structures | PDB ID, mmCIF URL, entry URL, retrieval time |
| AlphaFold DB | predicted monomer structures and confidence metadata | entry ID, mmCIF URL, confidence, retrieval time |
| PubChem PUG REST | identity, SMILES, formula, descriptors, synonyms, 2D/3D resources | CID, URL, payload, retrieval time |
| ChEMBL | exact target/compound cross-references and measured bioactivities | activity, assay, document and molecule identifiers, payload, retrieval time |
| Europe PMC | term-matched publication metadata | PMID/PMCID/DOI, source URL, payload, retrieval time |
| ClinicalTrials.gov v2 | term-matched study registry records | NCT ID, status, phase, conditions, interventions, source payload |
| User SDF | research input | SHA-256, filename, size, tenant, uploader, timestamp |

BindingDB remains a registered source adapter but is not queried until a deployment-specific data-use and ingestion policy is configured. Registry or term matching never implies relevance, efficacy, causality, or safety.

## Model execution contract

Two transparent models execute now: a deterministic protein-composition representation and a measured-bioactivity consensus that reports the median, interquartile range, and record count without pooling away assay context. A deterministic physicochemical rules assessment is also available.

Scientific weights run outside Express through the isolated runner contract. The reference `model-runner` container is authenticated and health checked and executes only the transparent protein representation. The contract accepts model key/version, normalized protein, normalized compound, and task and returns result, uncertainty, applicability, and provenance.

`infrastructure/gpu` adds separate ESM C, Boltz-2, and DiffDock NVIDIA deployment slots, model-specific URLs/tokens, immutable weight mounts, artifact volumes, health checks, and a versioned OpenAPI contract. The profile deliberately refuses to start without digest-pinned accepted images and checkpoint versions. This Apple M2 Pro host has no CUDA device, so those GPU services remain configured but not launched or scientifically accepted here.

Current model status:

- **Ready and application-tested:** Vina 1.2.7, ADMET-AI 2.0.1, REINVENT4 4.8.24, AiZynthFinder 4.4.1
- **Installed adapter only:** Chemprop 2.3.0 (a target-specific labeled dataset/model is still required), Boltz-2 2.2.1, ESM 3.2.3
- **Not installed/accepted:** DiffDock GPU runner

Heavy runner images still requiring accelerator, weight, and benchmark acceptance are:

- ESM C protein embeddings
- Chemprop v2 target-specific QSAR
- Boltz-2 structure/affinity
- DiffDock pose prediction and DiffDock/Vina consensus

Before changing a model from `not_configured` to `ready`, record its exact weights, dataset, split strategy, validation metrics, calibration procedure, applicability domain, hardware/runtime image, upstream license, and acceptance threshold.

## Acceptance evidence

Executable acceptance is intentionally separated from prospective scientific validity:

- Vina: EGFR 4WKQ/gefitinib co-crystal redocking produced nine poses, a best Vina score of -8.372 kcal/mol, and a 1.315 Å best-pose heavy-atom RMSD against the recorded ≤2.0 Å geometric threshold.
- ADMET-AI: gefitinib completed all 104 deployed endpoints. The deployment does not claim calibrated intervals or replicate the upstream benchmark yet.
- REINVENT4: the recorded seed generated 15 unique valid molecules; 11 passed the demonstration MW/XlogP constraints. This is validity/reproducibility acceptance, not biological validation.
- AiZynthFinder: aspirin produced 12 displayed routes, all terminating in the configured reference stock; the top route had one reaction step. This does not establish yield or laboratory feasibility.

Run `./scripts/validate-local-scientific-runners.sh` for package and immutable-asset checks, or add `--execute` for full executable acceptance. Benchmark rows and human decisions remain in PostgreSQL; a successful executable check alone never promotes biological claims.

## Run and verify

```bash
./start.sh
```

The script terminates only listeners on this app's configured frontend/backend ports, applies idempotent migrations when enabled, provisions the local administrator, and starts React and Express on all local interfaces. It prints the detected LAN URL; open `http://<printed-ip>:<FRONTEND_PORT>/discovery`, use the visible demo-credential button on the login page, then run the EGFR/gefitinib example. Set `APP_PUBLIC_HOST` explicitly when automatic LAN-address detection is unsuitable.

```bash
(cd backend && npm test)
(cd frontend && npm run build)
./scripts/scientific-smoke.sh
LIVE_OPENROUTER=true ./scripts/scientific-smoke.sh
```
