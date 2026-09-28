BEGIN;

INSERT INTO scientific_sources(key,name,homepage,license_note,access_method) VALUES
 ('europe_pmc','Europe PMC','https://europepmc.org','Publication metadata terms and source licenses apply.','REST API'),
 ('clinicaltrials','ClinicalTrials.gov','https://clinicaltrials.gov','Public registry data; record revisions and retrieval date retained.','API v2'),
 ('bindingdb','BindingDB','https://www.bindingdb.org','BindingDB data-use and citation terms apply.','Evidence adapter')
ON CONFLICT(key) DO UPDATE SET name=EXCLUDED.name,homepage=EXCLUDED.homepage,license_note=EXCLUDED.license_note,access_method=EXCLUDED.access_method;

CREATE TABLE IF NOT EXISTS discovery_science_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  therapeutic_area TEXT,
  hypothesis TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('planning','active','on_hold','completed','archived')),
  owner TEXT NOT NULL,
  protein_id BIGINT REFERENCES scientific_proteins(id),
  lead_compound_id BIGINT REFERENCES scientific_compounds(id),
  decision_criteria JSONB NOT NULL DEFAULT '[]',
  next_milestone TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id,name)
);

CREATE TABLE IF NOT EXISTS scientific_assay_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES discovery_science_projects(id) ON DELETE CASCADE,
  protein_id BIGINT REFERENCES scientific_proteins(id),
  compound_id BIGINT REFERENCES scientific_compounds(id),
  assay_name TEXT NOT NULL,
  assay_type TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  protocol_summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','scheduled','running','completed','failed','cancelled')),
  result_value NUMERIC,
  result_units TEXT,
  relation TEXT,
  quality_control JSONB NOT NULL DEFAULT '{}',
  source_type TEXT NOT NULL DEFAULT 'internal_plan',
  source_record_id TEXT,
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scientific_experiment_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  project_id UUID REFERENCES discovery_science_projects(id) ON DELETE CASCADE,
  candidate_id UUID REFERENCES discovery_candidates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  objective TEXT NOT NULL,
  protocol_summary TEXT NOT NULL,
  acceptance_criteria JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','running','completed','failed','cancelled')),
  owner TEXT NOT NULL,
  due_date DATE,
  linked_prediction_jobs JSONB NOT NULL DEFAULT '[]',
  result_summary TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scientific_publications (
  id BIGSERIAL PRIMARY KEY,
  doi TEXT UNIQUE,
  pmid TEXT UNIQUE,
  pmcid TEXT,
  title TEXT NOT NULL,
  abstract TEXT,
  journal TEXT,
  publication_year INTEGER,
  authors JSONB NOT NULL DEFAULT '[]',
  citation_count INTEGER,
  source_url TEXT NOT NULL,
  source_payload JSONB NOT NULL DEFAULT '{}',
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scientific_evidence_publications (
  protein_id BIGINT REFERENCES scientific_proteins(id) ON DELETE CASCADE,
  compound_id BIGINT REFERENCES scientific_compounds(id) ON DELETE CASCADE,
  publication_id BIGINT REFERENCES scientific_publications(id) ON DELETE CASCADE,
  relevance_note TEXT,
  PRIMARY KEY(protein_id,compound_id,publication_id)
);

CREATE TABLE IF NOT EXISTS scientific_clinical_trials (
  id BIGSERIAL PRIMARY KEY,
  nct_id TEXT UNIQUE NOT NULL,
  brief_title TEXT NOT NULL,
  overall_status TEXT,
  phases JSONB NOT NULL DEFAULT '[]',
  conditions JSONB NOT NULL DEFAULT '[]',
  interventions JSONB NOT NULL DEFAULT '[]',
  sponsor TEXT,
  enrollment INTEGER,
  start_date TEXT,
  completion_date TEXT,
  source_url TEXT NOT NULL,
  source_payload JSONB NOT NULL DEFAULT '{}',
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scientific_evidence_trials (
  protein_id BIGINT REFERENCES scientific_proteins(id) ON DELETE CASCADE,
  compound_id BIGINT REFERENCES scientific_compounds(id) ON DELETE CASCADE,
  trial_id BIGINT REFERENCES scientific_clinical_trials(id) ON DELETE CASCADE,
  relevance_note TEXT,
  PRIMARY KEY(protein_id,compound_id,trial_id)
);

CREATE TABLE IF NOT EXISTS scientific_prediction_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  prediction_job_id UUID NOT NULL REFERENCES scientific_prediction_jobs(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK(decision IN ('accept_for_prioritization','revise','reject','needs_evidence')),
  rationale TEXT NOT NULL,
  reviewer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS science_projects_tenant_idx ON discovery_science_projects(tenant_id,status);
CREATE INDEX IF NOT EXISTS science_assays_tenant_idx ON scientific_assay_records(tenant_id,status);
CREATE INDEX IF NOT EXISTS science_experiments_tenant_idx ON scientific_experiment_plans(tenant_id,status);
CREATE INDEX IF NOT EXISTS science_reviews_job_idx ON scientific_prediction_reviews(prediction_job_id,reviewed_at DESC);

COMMIT;
