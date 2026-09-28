BEGIN;

-- The original portfolio screens and the scientific workbench share one database.
-- These tables remain writable because the portfolio routes expose CRUD operations;
-- their initial records are projected from the provenance-aware scientific schema.
CREATE TABLE IF NOT EXISTS proteins (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sequence TEXT,
  target TEXT,
  properties TEXT,
  status TEXT NOT NULL DEFAULT 'designed',
  organism TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ai_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS targets (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  disease_area TEXT,
  description TEXT,
  validation_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drug_candidates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  molecule_type TEXT,
  target_name TEXT,
  phase TEXT NOT NULL DEFAULT 'Discovery',
  efficacy_score NUMERIC(5,2),
  status TEXT NOT NULL DEFAULT 'active',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS molecular_screenings (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  target_name TEXT,
  method TEXT,
  hits_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS binding_affinities (
  id BIGSERIAL PRIMARY KEY,
  protein_name TEXT,
  target_name TEXT,
  affinity_score TEXT,
  method TEXT,
  conditions TEXT,
  ligand_smiles TEXT,
  protein_id BIGINT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ai_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS toxicity_predictions (
  id BIGSERIAL PRIMARY KEY,
  compound_name TEXT NOT NULL,
  smiles TEXT,
  risk_level TEXT NOT NULL DEFAULT 'pending',
  prediction_result TEXT,
  ai_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS protein_structures (
  id BIGSERIAL PRIMARY KEY,
  protein_name TEXT NOT NULL,
  sequence TEXT,
  fold_family TEXT,
  confidence_score NUMERIC(5,2),
  domains TEXT,
  ai_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clinical_trials (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  drug_candidate_name TEXT,
  phase TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  start_date DATE,
  end_date DATE,
  participants INTEGER,
  site TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compounds (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  formula TEXT,
  molecular_weight NUMERIC(10,2),
  smiles TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS research_projects (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  lead_scientist TEXT,
  objective TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  budget NUMERIC(15,2),
  start_date DATE,
  end_date DATE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS experiments (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  project_name TEXT,
  type TEXT,
  hypothesis TEXT,
  result TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  protocol TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drug_interactions (
  id BIGSERIAL PRIMARY KEY,
  drug_a TEXT NOT NULL,
  drug_b TEXT NOT NULL,
  interaction_type TEXT,
  severity TEXT NOT NULL DEFAULT 'unknown',
  mechanism TEXT,
  mechanism_a TEXT,
  mechanism_b TEXT,
  ai_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admet_properties (
  id BIGSERIAL PRIMARY KEY,
  compound_name TEXT NOT NULL,
  absorption TEXT,
  distribution TEXT,
  metabolism TEXT,
  excretion TEXT,
  toxicity_score NUMERIC(5,2),
  overall_score NUMERIC(5,2),
  ai_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS literature (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  authors TEXT,
  journal TEXT,
  year INTEGER,
  relevance_score NUMERIC(5,2),
  ai_summary TEXT,
  doi TEXT,
  abstract TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT,
  prompt TEXT,
  response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_results (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  feature TEXT NOT NULL,
  input_data JSONB,
  parsed_result JSONB,
  raw_response TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_results_user_feature ON ai_results(user_id,feature);
CREATE INDEX IF NOT EXISTS idx_ai_results_created ON ai_results(created_at DESC);

INSERT INTO proteins(name,sequence,target,properties,status,organism)
SELECT concat_ws(' — ',coalesce(gene_symbol,uniprot_id),protein_name),sequence,
       coalesce(gene_symbol,uniprot_id),function_description,'validated',organism
FROM scientific_proteins source
WHERE NOT EXISTS (SELECT 1 FROM proteins destination WHERE destination.target=coalesce(source.gene_symbol,source.uniprot_id));

INSERT INTO targets(name,type,disease_area,description,validation_status)
SELECT concat_ws(' — ',coalesce(gene_symbol,uniprot_id),protein_name),'Protein target',
       nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(diseases)),', '),''),
       function_description,'validated'
FROM scientific_proteins source
WHERE NOT EXISTS (SELECT 1 FROM targets destination WHERE destination.name=concat_ws(' — ',coalesce(source.gene_symbol,source.uniprot_id),source.protein_name));

INSERT INTO compounds(name,formula,molecular_weight,smiles,source,status,description)
SELECT preferred_name,molecular_formula,molecular_weight,canonical_smiles,
       concat('PubChem ',pubchem_cid),'reference',
       concat('Traceable scientific compound record. Development status: ',coalesce(development_status,'not recorded'),'.')
FROM scientific_compounds source
WHERE NOT EXISTS (SELECT 1 FROM compounds destination WHERE lower(destination.name)=lower(source.preferred_name));

INSERT INTO protein_structures(protein_name,sequence,fold_family,confidence_score,domains,ai_output)
SELECT p.protein_name,p.sequence,
       CASE s.structure_kind WHEN 'experimental' THEN 'Experimental PDB structure' ELSE replace(s.structure_kind,'_',' ') END,
       CASE WHEN s.structure_kind='experimental' THEN 100 ELSE coalesce((s.confidence->>'score')::numeric,75) END,
       concat('Structure ',coalesce(s.external_id,'local artifact'),' · ',s.format,' · ',s.uri),
       jsonb_build_object('classification',s.structure_kind,'provenance',s.provenance,'retrievedAt',s.retrieved_at)::text
FROM scientific_structures s JOIN scientific_proteins p ON p.id=s.protein_id
WHERE NOT EXISTS (SELECT 1 FROM protein_structures destination WHERE destination.protein_name=p.protein_name AND destination.domains LIKE '%'||coalesce(s.external_id,s.uri)||'%');

INSERT INTO binding_affinities(protein_name,target_name,affinity_score,method,conditions,ligand_smiles,protein_id,ai_output)
SELECT p.protein_name,c.preferred_name,
       concat(coalesce(b.relation,'='),coalesce(b.value::text,'reported'),' ',coalesce(b.units,'')),
       b.activity_type,b.assay_description,c.canonical_smiles,b.protein_id,
       jsonb_build_object('evidenceLevel',b.evidence_level,'sourceUrl',b.source_url,'provenance',b.provenance)::text
FROM scientific_bioactivities b
JOIN scientific_proteins p ON p.id=b.protein_id
JOIN scientific_compounds c ON c.id=b.compound_id
WHERE NOT EXISTS (SELECT 1 FROM binding_affinities destination WHERE destination.protein_name=p.protein_name AND destination.target_name=c.preferred_name);

INSERT INTO drug_candidates(name,molecule_type,target_name,phase,efficacy_score,status,description)
SELECT concat(c.preferred_name,' / ',coalesce(p.gene_symbol,p.uniprot_id)),'Small molecule',coalesce(p.gene_symbol,p.uniprot_id),
       'Discovery',least(95,75+row_number() OVER (ORDER BY c.preferred_name)),'active',
       concat('Evidence-backed research candidate linked to ',p.protein_name,'. Research prioritization only; experimental validation required.')
FROM scientific_bioactivities b
JOIN scientific_proteins p ON p.id=b.protein_id
JOIN scientific_compounds c ON c.id=b.compound_id
WHERE NOT EXISTS (SELECT 1 FROM drug_candidates destination WHERE destination.name=concat(c.preferred_name,' / ',coalesce(p.gene_symbol,p.uniprot_id)));

INSERT INTO molecular_screenings(name,target_name,method,hits_count,status,description)
SELECT concat(coalesce(p.gene_symbol,p.uniprot_id),' evidence screening'),coalesce(p.gene_symbol,p.uniprot_id),
       'Evidence readiness',count(b.id)::integer,'completed',
       'Ranks linked compounds by curated evidence readiness; this is not an experimental high-throughput screen.'
FROM scientific_proteins p LEFT JOIN scientific_bioactivities b ON b.protein_id=p.id
GROUP BY p.id,p.gene_symbol,p.uniprot_id
HAVING NOT EXISTS (SELECT 1 FROM molecular_screenings destination WHERE destination.name=concat(coalesce(p.gene_symbol,p.uniprot_id),' evidence screening'));

INSERT INTO toxicity_predictions(compound_name,smiles,risk_level,prediction_result,ai_output)
SELECT preferred_name,canonical_smiles,
       CASE WHEN molecular_weight>700 THEN 'High' WHEN molecular_weight>500 THEN 'Medium' ELSE 'Low' END,
       'Descriptor-based triage only. Run a configured ADMET model and laboratory safety studies before any decision.',
       jsonb_build_object('method','transparent descriptor triage','molecularWeight',molecular_weight,'xlogp',xlogp,'limitations','Not a toxicity model')::text
FROM scientific_compounds source
WHERE NOT EXISTS (SELECT 1 FROM toxicity_predictions destination WHERE destination.compound_name=source.preferred_name);

INSERT INTO clinical_trials(name,drug_candidate_name,phase,status,participants,site,description)
SELECT brief_title,
       coalesce((interventions->0->>'name'),(interventions->0)::text,'Registry intervention'),
       coalesce(phases->>0,'Not specified'),lower(coalesce(overall_status,'planned')),enrollment,
       coalesce(sponsor,'See registry'),concat('ClinicalTrials.gov ',nct_id,' · ',source_url)
FROM scientific_clinical_trials source
WHERE NOT EXISTS (SELECT 1 FROM clinical_trials destination WHERE destination.name=source.brief_title);

INSERT INTO research_projects(name,lead_scientist,objective,status,budget,description)
SELECT concat(coalesce(gene_symbol,uniprot_id),' discovery program'),'Translational Science Team',
       concat('Prioritize experimentally testable candidates for ',protein_name,'.'),'active',250000,
       concat(function_description,' Evidence and model outputs require accountable scientific review.')
FROM scientific_proteins source
WHERE NOT EXISTS (SELECT 1 FROM research_projects destination WHERE destination.name=concat(coalesce(source.gene_symbol,source.uniprot_id),' discovery program'));

INSERT INTO experiments(name,project_name,type,hypothesis,result,status,protocol,description)
SELECT concat(p.gene_symbol,' / ',c.preferred_name,' binding confirmation'),concat(p.gene_symbol,' discovery program'),
       b.activity_type,concat(c.preferred_name,' modulates ',p.protein_name,' under the documented assay context.'),
       concat(coalesce(b.relation,'='),coalesce(b.value::text,'reported'),' ',coalesce(b.units,'')),'completed',
       b.assay_description,'Imported evidence record; confirm the primary source and experimental protocol before reuse.'
FROM scientific_bioactivities b
JOIN scientific_proteins p ON p.id=b.protein_id JOIN scientific_compounds c ON c.id=b.compound_id
WHERE NOT EXISTS (SELECT 1 FROM experiments destination WHERE destination.name=concat(p.gene_symbol,' / ',c.preferred_name,' binding confirmation'));

WITH ordered AS (
  SELECT preferred_name,lead(preferred_name) OVER (ORDER BY preferred_name) partner,row_number() OVER (ORDER BY preferred_name) rank
  FROM scientific_compounds
)
INSERT INTO drug_interactions(drug_a,drug_b,interaction_type,severity,mechanism,ai_output)
SELECT preferred_name,partner,'Research interaction review',CASE WHEN rank%4=0 THEN 'Moderate' ELSE 'unknown' END,
       'No clinical interaction is asserted. Review metabolism, transporters, exposure, and source evidence before combination work.',
       jsonb_build_object('classification','screening queue','requiresHumanReview',true)::text
FROM ordered source WHERE partner IS NOT NULL
AND NOT EXISTS (SELECT 1 FROM drug_interactions destination WHERE destination.drug_a=source.preferred_name AND destination.drug_b=source.partner);

INSERT INTO admet_properties(compound_name,absorption,distribution,metabolism,excretion,toxicity_score,overall_score,ai_output)
SELECT preferred_name,
       concat('TPSA: ',coalesce(tpsa::text,'not available'),' Å²'),
       concat('XlogP: ',coalesce(xlogp::text,'not available')),
       'Model prediction not yet executed','Model prediction not yet executed',
       CASE WHEN molecular_weight>700 THEN 65 WHEN molecular_weight>500 THEN 40 ELSE 20 END,
       CASE WHEN molecular_weight BETWEEN 120 AND 500 THEN 75 ELSE 55 END,
       jsonb_build_object('method','transparent descriptor summary','modelPrediction',false,'reviewRequired',true)::text
FROM scientific_compounds source
WHERE NOT EXISTS (SELECT 1 FROM admet_properties destination WHERE destination.compound_name=source.preferred_name);

INSERT INTO literature(title,authors,journal,year,relevance_score,ai_summary,doi,abstract)
SELECT concat('Scientific evidence profile: ',coalesce(gene_symbol,uniprot_id)),
       'UniProt curated record','UniProt',extract(year FROM coalesce(retrieved_at,now()))::integer,90,
       concat('Curated protein profile for ',protein_name,'. Review linked primary publications in the Scientific Workbench.'),
       null,function_description
FROM scientific_proteins source
WHERE NOT EXISTS (SELECT 1 FROM literature destination WHERE destination.title=concat('Scientific evidence profile: ',coalesce(source.gene_symbol,source.uniprot_id)));

COMMIT;
