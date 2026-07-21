# Completeness Review: AIAcceleratedrug

- **Review date:** 2026-07-18
- **Assessment basis:** Static source and configuration inspection only. Dependencies were not installed, and no build, database migration, external integration, or runtime workflow was executed.

## Classification

**Prototype-demo**

## Verdict

The repository presents a broad life-sciences decision support surface (75 source files and 36 route modules), but the static evidence is characteristic of a generated prototype. Pages and endpoints demonstrate concepts; they do not establish a verified execution path for use curated compound, trial, medication, and patient data in a traceable evidence workflow.

## Why it is not complete

- 29 files are explicitly named as gap/gap-feature implementations; route/page count therefore overstates completed product capability.
- 20 files reference model-provider or chat-completion behavior; these generic LLM paths are not a substitute for deterministic domain execution, grounding, or evaluation.
- 25 files contain mock, sample, placeholder, or random-data signals, leaving important outcomes disconnected from authoritative systems.
- No recognizable application test files were found in the inspected tree.
- No CI workflow was found to continuously verify builds, tests, migrations, or security checks.
- No environment example/template was found, so required configuration and secret boundaries are undocumented.

## Needed features

- 1. Implement a workflow to use curated compound, trial, medication, and patient data in a traceable evidence workflow.
- 2. Connect validated biomedical sources, trial registries, terminology services, and governed clinical systems; replace seed/demo records with durable, synchronized data and explicit failure handling.
- 3. Evaluate retrieval, interaction/risk rules, uncertainty, and subgroup performance against expert-reviewed cases.
- 4. Enforce clinical-use boundaries, consent, provenance, privacy, and mandatory professional review.
- 5. Add contract, integration, authorization, migration, and end-to-end tests in CI, plus a documented non-destructive deployment/run path.

## Risks or launch blockers

- Credential/secret fallback or demo-password patterns occur in 4 files and must be removed or made development-only.
- The root launcher can terminate unrelated processes occupying configured ports.
- The root launcher seeds, creates, migrates, or otherwise mutates database state during startup.
- The root launcher installs dependencies at run time, reducing reproducibility and expanding supply-chain risk.
- Ungrounded or malformed model output can become a domain action unless schemas, evidence, evaluations, and approval gates are added.

## Evidence inspected

- `backend/package.json` — declared scripts, runtime dependencies, and application boundaries.
- `frontend/package.json` — declared scripts, runtime dependencies, and application boundaries.
- `backend/src/server.js` — service composition, middleware, and registered routes.
- `frontend/src/App.jsx` — front-end navigation and visible workflow surface.
- `backend/src/routes/admet.js` — implemented API surface and domain/AI request handling.
- `backend/src/routes/ai.js` — implemented API surface and domain/AI request handling.

## Recommended next action

Treat this as a prototype: select one narrow life-sciences decision support outcome, remove or quarantine generated gap routes, and implement that outcome end to end with real data, deterministic rules, and tests before adding features.

## Implementation progress

**2026-07-18 — governed research-evidence workflow implemented; institutional/clinical validation remains.**

- **1:** `backend/src/domain/evidencePolicy.js`, `backend/src/routes/evidenceWorkflow.js`, and migration `001_evidence_workflows.sql` implement pseudonymous subject intake, curated evidence provenance, interaction-risk summary, uncertainty requirements, submission, and independent professional review.
- **2:** The local workflow requires source type/id/revision/retrieval/checksum and stores tenant-scoped, idempotent state, explicit failures, and audit events. Trial registries, terminology services, governed clinical systems, and validated biomedical feeds remain blocked on institutional access and credentials; generated import/provider routes are not mounted.
- **3:** Evidence uncertainty and high-risk interaction rules are represented and testable. Retrieval quality, interaction/risk performance, subgroup analysis, and expert-reviewed case evaluation still require approved datasets and qualified experts.
- **4:** Direct identifiers are rejected; consent/protocol references, provenance, role gates, independent professional review, credential reference, rationale, and attestation are mandatory. The terminal state is `reviewed_for_research`, and the stored boundary explicitly prohibits diagnosis, prescription, autonomous action, or a claim of clinical approval.
- **5:** Strong runtime/database configuration, `.env.example`, versioned migration, explicit bootstrap/migrate/guarded-seed scripts, safe startup, and CI test/build/migration checks plus an HTTP health-and-authorization smoke test were added. Three evidence/config tests pass.
- **Risk remediation:** Static JWT/DB fallbacks, visible demo credentials, the default batch-generated model/gap boundary, and destructive normal startup were removed. Historical routes return a tested `410` and cannot be enabled in production. Demo fixtures require explicit confirmation, non-production mode, and a supplied strong password.
- **Validation performed:** three Node tests and the production frontend build passed (with a non-blocking bundle-size warning); edited backend JS/JSON/shell syntax checks passed. No biomedical provider, governed clinical system, database, expert case set, privacy review, credential verification, or clinical validation was run locally.
