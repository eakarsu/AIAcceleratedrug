BEGIN;

CREATE TABLE IF NOT EXISTS scientific_datasets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  modality TEXT NOT NULL CHECK(modality IN ('compound','protein','bioactivity','admet','structure','reaction','multimodal')),
  source_type TEXT NOT NULL CHECK(source_type IN ('public','internal','licensed','benchmark','user_upload')),
  source_url TEXT,
  license_note TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0 CHECK(row_count >= 0),
  checksum TEXT,
  split_strategy JSONB NOT NULL DEFAULT '{}',
  quality_summary JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','ready','quarantined','archived')),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,name,version)
);

CREATE TABLE IF NOT EXISTS scientific_screening_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  protein_id BIGINT REFERENCES scientific_proteins(id) ON DELETE SET NULL,
  method TEXT NOT NULL CHECK(method IN ('evidence_readiness','chemical_similarity','validated_model')),
  model_key TEXT,
  model_version TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','blocked','failed','reviewed')),
  input_snapshot JSONB NOT NULL DEFAULT '{}',
  thresholds JSONB NOT NULL DEFAULT '{}',
  candidate_count INTEGER NOT NULL DEFAULT 0,
  hit_count INTEGER NOT NULL DEFAULT 0,
  limitation TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS scientific_screening_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES scientific_screening_campaigns(id) ON DELETE CASCADE,
  compound_id BIGINT NOT NULL REFERENCES scientific_compounds(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL CHECK(rank > 0),
  score NUMERIC NOT NULL,
  score_components JSONB NOT NULL DEFAULT '{}',
  evidence_count INTEGER NOT NULL DEFAULT 0,
  applicability JSONB NOT NULL DEFAULT '{}',
  decision TEXT NOT NULL DEFAULT 'unreviewed' CHECK(decision IN ('unreviewed','prioritize','hold','reject')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(campaign_id,compound_id),
  UNIQUE(campaign_id,rank)
);

CREATE TABLE IF NOT EXISTS scientific_optimization_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  protein_id BIGINT REFERENCES scientific_proteins(id) ON DELETE SET NULL,
  method TEXT NOT NULL DEFAULT 'transparent_descriptor_pareto',
  objectives JSONB NOT NULL,
  constraints JSONB NOT NULL DEFAULT '{}',
  input_compound_ids JSONB NOT NULL DEFAULT '[]',
  frontier JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('queued','running','completed','blocked','failed','reviewed')),
  limitation TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS scientific_workflow_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  workflow_type TEXT NOT NULL CHECK(workflow_type IN ('protein_embedding','qsar','admet','complex_prediction','docking','molecule_generation','synthesis_planning')),
  protein_id BIGINT REFERENCES scientific_proteins(id) ON DELETE SET NULL,
  compound_id BIGINT REFERENCES scientific_compounds(id) ON DELETE SET NULL,
  model_key TEXT NOT NULL,
  model_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','running','completed','blocked','failed','reviewed')),
  input_snapshot JSONB NOT NULL DEFAULT '{}',
  output JSONB NOT NULL DEFAULT '{}',
  uncertainty JSONB NOT NULL DEFAULT '{}',
  applicability JSONB NOT NULL DEFAULT '{}',
  requirements JSONB NOT NULL DEFAULT '[]',
  error_message TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS scientific_model_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  model_key TEXT NOT NULL,
  model_version TEXT NOT NULL,
  dataset_id UUID REFERENCES scientific_datasets(id) ON DELETE SET NULL,
  validation_type TEXT NOT NULL CHECK(validation_type IN ('retrospective','temporal','scaffold_split','external','prospective')),
  metrics JSONB NOT NULL,
  calibration JSONB NOT NULL DEFAULT '{}',
  acceptance_thresholds JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','passed','failed','needs_review')),
  notes TEXT,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scientific_workflow_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('screening_campaign','optimization_campaign','workflow_job','model_validation')),
  entity_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('accept_for_prioritization','needs_evidence','revise','reject')),
  rationale TEXT NOT NULL,
  reviewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS science_datasets_tenant_idx ON scientific_datasets(tenant_id,status);
CREATE INDEX IF NOT EXISTS science_screening_tenant_idx ON scientific_screening_campaigns(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS science_screening_results_campaign_idx ON scientific_screening_results(campaign_id,rank);
CREATE INDEX IF NOT EXISTS science_optimization_tenant_idx ON scientific_optimization_campaigns(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS science_workflow_jobs_tenant_idx ON scientific_workflow_jobs(tenant_id,created_at DESC);
CREATE INDEX IF NOT EXISTS science_model_validations_tenant_idx ON scientific_model_validations(tenant_id,model_key,model_version);
CREATE INDEX IF NOT EXISTS science_workflow_reviews_entity_idx ON scientific_workflow_reviews(entity_type,entity_id,reviewed_at DESC);

COMMIT;
