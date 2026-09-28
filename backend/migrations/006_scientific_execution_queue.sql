BEGIN;

ALTER TABLE scientific_workflow_jobs DROP CONSTRAINT IF EXISTS scientific_workflow_jobs_status_check;
ALTER TABLE scientific_workflow_jobs ADD CONSTRAINT scientific_workflow_jobs_status_check
  CHECK(status IN ('queued','running','completed','blocked','failed','cancelled','reviewed'));
ALTER TABLE scientific_workflow_jobs ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND 100);
ALTER TABLE scientific_workflow_jobs ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0);
ALTER TABLE scientific_workflow_jobs ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 2 CHECK(max_attempts BETWEEN 1 AND 5);
ALTER TABLE scientific_workflow_jobs ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE scientific_workflow_jobs ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE scientific_workflow_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE scientific_workflow_jobs ADD COLUMN IF NOT EXISTS worker_metadata JSONB NOT NULL DEFAULT '{}';
ALTER TABLE scientific_workflow_jobs ADD COLUMN IF NOT EXISTS artifact_ids JSONB NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS scientific_job_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  job_id UUID NOT NULL REFERENCES scientific_workflow_jobs(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK(event_type IN ('queued','started','progress','completed','failed','retry_requested','cancel_requested','cancelled')),
  message TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scientific_job_events_job_idx ON scientific_job_events(job_id,occurred_at);

INSERT INTO scientific_structures(protein_id,structure_kind,external_id,format,uri,provenance,retrieved_at)
SELECT id,'experimental','4WKQ','PDB','https://files.rcsb.org/download/4WKQ.pdb',
  '{"source":"RCSB PDB","label":"Experimental wild-type EGFR kinase domain co-crystallized with gefitinib","referenceLigandCode":"IRE","resolutionAngstrom":1.85}'::jsonb,now()
FROM scientific_proteins WHERE uniprot_id='P00533'
ON CONFLICT(structure_kind,external_id,uri) DO UPDATE SET provenance=EXCLUDED.provenance,retrieved_at=EXCLUDED.retrieved_at;

INSERT INTO scientific_model_versions(key,version,display_name,task,provider,execution_mode,readiness,dataset_version,applicability_domain,validation_metrics,uncertainty_method,license_note,documentation_url)
VALUES('vina','1.2.7','AutoDock Vina','Rigid-receptor docking and pose scoring','AutoDock Vina','local','ready','No trained weights; executable acceptance 2026-08-01',
  'Prepared drug-like small molecules docked into an explicitly defined site in an experimental PDB receptor',
  '{"acceptanceStructure":"4WKQ","acceptanceLigand":"gefitinib","poseCount":9,"bestScoreKcalMol":-8.372,"coCrystalRedockingRmsdAngstrom":1.315,"redockingThresholdAngstrom":2.0,"redockingPassed":true,"scientificBoundary":"Co-crystal redocking geometry and executable acceptance only; no affinity or prospective predictive-accuracy claim"}',
  'Pose and score spread; preparation-state and rigid-receptor limitations','Apache-2.0','https://autodock-vina.readthedocs.io/en/latest/')
ON CONFLICT(key,version) DO UPDATE SET readiness=EXCLUDED.readiness,dataset_version=EXCLUDED.dataset_version,
  applicability_domain=EXCLUDED.applicability_domain,validation_metrics=EXCLUDED.validation_metrics,
  uncertainty_method=EXCLUDED.uncertainty_method,execution_mode=EXCLUDED.execution_mode;

COMMIT;
