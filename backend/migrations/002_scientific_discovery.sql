BEGIN;

CREATE TABLE IF NOT EXISTS scientific_capabilities (
  capability TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  detail TEXT NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO scientific_capabilities (capability, enabled, detail)
SELECT 'pgvector', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector'),
       CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector')
         THEN 'Native vector similarity is available.'
         ELSE 'Extension is not installed; embeddings are retained as JSON until pgvector is provisioned.' END
ON CONFLICT (capability) DO UPDATE SET enabled = EXCLUDED.enabled, detail = EXCLUDED.detail, checked_at = now();

INSERT INTO scientific_capabilities (capability, enabled, detail)
SELECT 'rdkit', EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'rdkit'),
       CASE WHEN EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'rdkit')
         THEN 'RDKit cartridge chemical search is available.'
         ELSE 'Cartridge is not installed; exact identifiers and external enrichment remain available.' END
ON CONFLICT (capability) DO UPDATE SET enabled = EXCLUDED.enabled, detail = EXCLUDED.detail, checked_at = now();

CREATE TABLE IF NOT EXISTS scientific_sources (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  homepage TEXT NOT NULL,
  license_note TEXT NOT NULL,
  access_method TEXT NOT NULL,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO scientific_sources (key, name, homepage, license_note, access_method) VALUES
  ('uniprot','UniProt','https://www.uniprot.org','Source-specific terms apply; attribution and retrieval date retained.','REST API'),
  ('rcsb','RCSB Protein Data Bank','https://www.rcsb.org','PDB data usage policy applies; entry identifiers retained.','Data/Search APIs'),
  ('alphafold','AlphaFold Protein Structure Database','https://alphafold.ebi.ac.uk','AlphaFold DB terms apply; predicted structures are labeled.','Prediction API'),
  ('pubchem','PubChem','https://pubchem.ncbi.nlm.nih.gov','Public database; record identifiers and retrieval dates retained.','PUG REST'),
  ('chembl','ChEMBL','https://www.ebi.ac.uk/chembl','ChEMBL license and attribution requirements apply.','REST API'),
  ('user_upload','User-provided research artifact','local://scientific-artifacts','Uploader is responsible for data rights and scientific validity.','Authenticated upload')
ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name, homepage=EXCLUDED.homepage,
  license_note=EXCLUDED.license_note, access_method=EXCLUDED.access_method;

CREATE TABLE IF NOT EXISTS scientific_proteins (
  id BIGSERIAL PRIMARY KEY,
  uniprot_id TEXT UNIQUE NOT NULL,
  entry_name TEXT,
  protein_name TEXT NOT NULL,
  gene_symbol TEXT,
  organism TEXT NOT NULL DEFAULT 'Homo sapiens',
  sequence TEXT,
  sequence_length INTEGER,
  function_description TEXT,
  pathways JSONB NOT NULL DEFAULT '[]',
  diseases JSONB NOT NULL DEFAULT '[]',
  features JSONB NOT NULL DEFAULT '[]',
  isoforms JSONB NOT NULL DEFAULT '[]',
  source_payload JSONB NOT NULL DEFAULT '{}',
  source_key TEXT NOT NULL DEFAULT 'uniprot' REFERENCES scientific_sources(key),
  source_url TEXT,
  retrieved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scientific_compounds (
  id BIGSERIAL PRIMARY KEY,
  pubchem_cid BIGINT UNIQUE,
  chembl_id TEXT UNIQUE,
  preferred_name TEXT NOT NULL,
  canonical_smiles TEXT,
  isomeric_smiles TEXT,
  inchi_key TEXT,
  molecular_formula TEXT,
  molecular_weight NUMERIC,
  xlogp NUMERIC,
  tpsa NUMERIC,
  hbond_donors INTEGER,
  hbond_acceptors INTEGER,
  rotatable_bonds INTEGER,
  synonyms JSONB NOT NULL DEFAULT '[]',
  indications JSONB NOT NULL DEFAULT '[]',
  development_status TEXT,
  source_payload JSONB NOT NULL DEFAULT '{}',
  source_key TEXT NOT NULL DEFAULT 'pubchem' REFERENCES scientific_sources(key),
  source_url TEXT,
  retrieved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scientific_compounds_inchi_idx ON scientific_compounds(inchi_key);
CREATE INDEX IF NOT EXISTS scientific_compounds_name_idx ON scientific_compounds(lower(preferred_name));

CREATE TABLE IF NOT EXISTS scientific_structures (
  id BIGSERIAL PRIMARY KEY,
  protein_id BIGINT REFERENCES scientific_proteins(id) ON DELETE CASCADE,
  compound_id BIGINT REFERENCES scientific_compounds(id) ON DELETE CASCADE,
  structure_kind TEXT NOT NULL CHECK (structure_kind IN ('experimental','alphafold_prediction','docking_hypothesis','ai_complex_prediction','compound_conformer')),
  external_id TEXT,
  format TEXT NOT NULL,
  uri TEXT NOT NULL,
  checksum TEXT,
  confidence JSONB NOT NULL DEFAULT '{}',
  provenance JSONB NOT NULL DEFAULT '{}',
  retrieved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (structure_kind, external_id, uri)
);

CREATE TABLE IF NOT EXISTS scientific_bioactivities (
  id BIGSERIAL PRIMARY KEY,
  protein_id BIGINT NOT NULL REFERENCES scientific_proteins(id) ON DELETE CASCADE,
  compound_id BIGINT NOT NULL REFERENCES scientific_compounds(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  relation TEXT NOT NULL DEFAULT '=',
  value NUMERIC,
  units TEXT,
  assay_description TEXT,
  evidence_level TEXT NOT NULL DEFAULT 'curated_example',
  source_key TEXT REFERENCES scientific_sources(key),
  source_record_id TEXT,
  source_url TEXT,
  retrieved_at TIMESTAMPTZ,
  provenance JSONB NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS scientific_model_versions (
  key TEXT NOT NULL,
  version TEXT NOT NULL,
  display_name TEXT NOT NULL,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  execution_mode TEXT NOT NULL CHECK (execution_mode IN ('local','remote_adapter','external_runner','llm_synthesis')),
  readiness TEXT NOT NULL CHECK (readiness IN ('ready','adapter_ready','not_configured')),
  dataset_version TEXT NOT NULL,
  applicability_domain TEXT NOT NULL,
  validation_metrics JSONB NOT NULL DEFAULT '{}',
  uncertainty_method TEXT NOT NULL,
  license_note TEXT NOT NULL,
  documentation_url TEXT NOT NULL,
  PRIMARY KEY (key, version)
);

INSERT INTO scientific_model_versions VALUES
 ('physchem-rules','1.0.0','Physicochemical rules','Drug-likeness triage','Local deterministic engine','local','ready','Rule set 2026-08','Small molecules with complete PubChem descriptors','{"method":"deterministic thresholds; not a trained model"}','Distance from rule thresholds','Internal implementation','https://pubchem.ncbi.nlm.nih.gov/docs/pug-rest'),
 ('esmc','2026-adapter','ESM C','Protein embeddings','EvolutionaryScale','external_runner','not_configured','Runner-managed','Protein amino-acid sequences','{}','Runner-provided representation confidence','Upstream license applies','https://github.com/evolutionaryscale/esm'),
 ('chemprop','2.2.3','Chemprop v2','Target activity / QSAR','Chemprop','external_runner','not_configured','Project-specific training set required','Molecules within the training-set chemical domain','{}','Ensemble variance or conformal interval','MIT','https://github.com/chemprop/chemprop'),
 ('admet-ai','1.x-adapter','ADMET-AI','ADMET and toxicity','ADMET-AI','external_runner','not_configured','Upstream release dataset','Drug-like small molecules','{}','Model ensemble uncertainty','Upstream license applies','https://github.com/swansonk14/admet_ai'),
 ('boltz-2','2.x-adapter','Boltz-2','Complex structure and affinity','Boltz','external_runner','not_configured','Upstream release weights','Biomolecular complexes supported by the configured runner','{}','Predicted confidence and affinity probability','MIT','https://github.com/jwohlwend/boltz'),
 ('diffdock','adapter','DiffDock','Pose prediction','MIT CSAIL','external_runner','not_configured','Runner-managed','Protein-small-molecule docking','{}','Pose confidence ranking','Upstream license applies','https://github.com/gcorso/DiffDock'),
 ('vina','1.2.x-adapter','AutoDock Vina','Physics-inspired docking','AutoDock Vina','external_runner','not_configured','Not applicable','Prepared receptor and ligand structures','{}','Pose spread and consensus disagreement','Apache-2.0','https://autodock-vina.readthedocs.io/en/latest/'),
 ('reinvent4','4.x-adapter','REINVENT4','Molecule generation','MolecularAI','external_runner','not_configured','Runner-managed','Configured chemical-space objectives','{}','Sampling diversity and scoring uncertainty','Apache-2.0','https://github.com/MolecularAI/REINVENT4'),
 ('aizynthfinder','4.x-adapter','AiZynthFinder','Retrosynthesis planning','MolecularAI','external_runner','not_configured','Configured reaction templates','Organic molecules covered by template library','{}','Route score and template coverage','MIT','https://github.com/MolecularAI/aizynthfinder'),
 ('openrouter-synthesis','configured','Evidence Synthesis','Scientific evidence synthesis','OpenRouter','llm_synthesis','adapter_ready','Provider/model selected at run time','Narrative synthesis only; never used as physical ground truth','{}','Explicit caveats and source completeness review','Provider and selected model terms apply','https://openrouter.ai/docs')
ON CONFLICT (key,version) DO UPDATE SET display_name=EXCLUDED.display_name, task=EXCLUDED.task,
 provider=EXCLUDED.provider, execution_mode=EXCLUDED.execution_mode, readiness=EXCLUDED.readiness,
 dataset_version=EXCLUDED.dataset_version, applicability_domain=EXCLUDED.applicability_domain,
 uncertainty_method=EXCLUDED.uncertainty_method, documentation_url=EXCLUDED.documentation_url;

CREATE TABLE IF NOT EXISTS scientific_prediction_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  protein_id BIGINT REFERENCES scientific_proteins(id),
  compound_id BIGINT REFERENCES scientific_compounds(id),
  model_key TEXT NOT NULL,
  model_version TEXT NOT NULL,
  task TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','blocked','failed')),
  input_snapshot JSONB NOT NULL,
  result JSONB,
  uncertainty JSONB NOT NULL DEFAULT '{}',
  applicability JSONB NOT NULL DEFAULT '{}',
  provenance JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  FOREIGN KEY (model_key, model_version) REFERENCES scientific_model_versions(key, version)
);

CREATE TABLE IF NOT EXISTS discovery_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  protein_id BIGINT REFERENCES scientific_proteins(id),
  compound_id BIGINT REFERENCES scientific_compounds(id),
  stage TEXT NOT NULL DEFAULT 'triage',
  priority TEXT NOT NULL DEFAULT 'medium',
  owner TEXT,
  rationale TEXT,
  decision_status TEXT NOT NULL DEFAULT 'research_review',
  evidence_snapshot JSONB NOT NULL DEFAULT '{}',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scientific_provenance_events (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  source_key TEXT,
  source_url TEXT,
  model_key TEXT,
  details JSONB NOT NULL DEFAULT '{}',
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS scientific_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  artifact_kind TEXT NOT NULL,
  format TEXT NOT NULL,
  object_uri TEXT NOT NULL,
  checksum_sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  source_filename TEXT,
  content_metadata JSONB NOT NULL DEFAULT '{}',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, checksum_sha256, artifact_kind)
);

DO $extensions$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='vector') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS scientific_embeddings (
      entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, model_key TEXT NOT NULL,
      model_version TEXT NOT NULL, embedding vector NOT NULL, metadata JSONB NOT NULL DEFAULT ''{}'',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(entity_type,entity_id,model_key,model_version))';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='rdkit') THEN
    EXECUTE 'CREATE TABLE IF NOT EXISTS scientific_rdkit_molecules (
      compound_id BIGINT PRIMARY KEY REFERENCES scientific_compounds(id) ON DELETE CASCADE, molecule mol NOT NULL)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS scientific_rdkit_molecule_gist ON scientific_rdkit_molecules USING gist(molecule)';
    EXECUTE 'INSERT INTO scientific_rdkit_molecules(compound_id,molecule)
      SELECT id,mol_from_smiles(canonical_smiles::cstring) FROM scientific_compounds
      WHERE canonical_smiles IS NOT NULL ON CONFLICT(compound_id) DO UPDATE SET molecule=EXCLUDED.molecule';
  END IF;
END $extensions$;

INSERT INTO scientific_proteins (uniprot_id,entry_name,protein_name,gene_symbol,sequence_length,function_description,pathways,diseases,source_url,retrieved_at) VALUES
 ('P00533','EGFR_HUMAN','Epidermal growth factor receptor','EGFR',1210,'Receptor tyrosine kinase controlling epithelial growth and survival.','["EGFR signaling","MAPK signaling"]','["Non-small-cell lung cancer","Glioblastoma"]','https://rest.uniprot.org/uniprotkb/P00533',now()),
 ('P15056','BRAF_HUMAN','Serine/threonine-protein kinase B-raf','BRAF',766,'MAP kinase pathway kinase frequently altered in cancer.','["MAPK signaling"]','["Melanoma","Thyroid cancer"]','https://rest.uniprot.org/uniprotkb/P15056',now()),
 ('P01116','RASK_HUMAN','GTPase KRas','KRAS',189,'Small GTPase that relays growth signals.','["RAS signaling"]','["Pancreatic cancer","Lung cancer"]','https://rest.uniprot.org/uniprotkb/P01116',now()),
 ('Q9UM73','ALK_HUMAN','ALK tyrosine kinase receptor','ALK',1620,'Receptor tyrosine kinase with oncogenic fusion forms.','["RTK signaling"]','["Lung cancer","Neuroblastoma"]','https://rest.uniprot.org/uniprotkb/Q9UM73',now()),
 ('O60674','JAK2_HUMAN','Tyrosine-protein kinase JAK2','JAK2',1132,'Cytoplasmic kinase mediating cytokine signaling.','["JAK-STAT signaling"]','["Myeloproliferative neoplasms"]','https://rest.uniprot.org/uniprotkb/O60674',now()),
 ('P10415','BCL2_HUMAN','Apoptosis regulator Bcl-2','BCL2',239,'Suppresses apoptosis through mitochondrial pathway regulation.','["Apoptosis"]','["Lymphoma","Leukemia"]','https://rest.uniprot.org/uniprotkb/P10415',now()),
 ('P42345','MTOR_HUMAN','Serine/threonine-protein kinase mTOR','MTOR',2549,'Central regulator of cell growth and metabolism.','["mTOR signaling"]','["Cancer","Tuberous sclerosis"]','https://rest.uniprot.org/uniprotkb/P42345',now()),
 ('P11802','CDK4_HUMAN','Cyclin-dependent kinase 4','CDK4',303,'Controls G1 cell-cycle progression.','["Cell cycle"]','["Breast cancer"]','https://rest.uniprot.org/uniprotkb/P11802',now()),
 ('P09874','PARP1_HUMAN','Poly [ADP-ribose] polymerase 1','PARP1',1014,'Detects DNA breaks and coordinates repair.','["DNA repair"]','["BRCA-mutated cancer"]','https://rest.uniprot.org/uniprotkb/P09874',now()),
 ('Q02750','MP2K1_HUMAN','Dual specificity mitogen-activated protein kinase kinase 1','MAP2K1',393,'Activates ERK kinases in MAPK signaling.','["MAPK signaling"]','["Melanoma"]','https://rest.uniprot.org/uniprotkb/Q02750',now()),
 ('P08581','MET_HUMAN','Hepatocyte growth factor receptor','MET',1390,'Receptor tyrosine kinase driving growth and motility.','["MET signaling"]','["Lung cancer"]','https://rest.uniprot.org/uniprotkb/P08581',now()),
 ('P15692','VEGFA_HUMAN','Vascular endothelial growth factor A','VEGFA',232,'Secreted growth factor promoting angiogenesis.','["Angiogenesis"]','["Cancer","Retinal disease"]','https://rest.uniprot.org/uniprotkb/P15692',now()),
 ('Q9NZQ7','PD1L1_HUMAN','Programmed cell death 1 ligand 1','CD274',290,'Immune checkpoint ligand that suppresses T-cell activity.','["Immune checkpoint"]','["Cancer"]','https://rest.uniprot.org/uniprotkb/Q9NZQ7',now()),
 ('P01375','TNFA_HUMAN','Tumor necrosis factor','TNF',233,'Pro-inflammatory cytokine coordinating immune responses.','["TNF signaling"]','["Autoimmune disease"]','https://rest.uniprot.org/uniprotkb/P01375',now()),
 ('P05231','IL6_HUMAN','Interleukin-6','IL6',212,'Cytokine involved in inflammation and B-cell maturation.','["JAK-STAT signaling"]','["Inflammatory disease"]','https://rest.uniprot.org/uniprotkb/P05231',now())
ON CONFLICT (uniprot_id) DO NOTHING;

INSERT INTO scientific_compounds (pubchem_cid,preferred_name,canonical_smiles,molecular_formula,molecular_weight,development_status,source_url,retrieved_at) VALUES
 (2244,'Aspirin','CC(=O)OC1=CC=CC=C1C(=O)O','C9H8O4',180.16,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/2244',now()),
 (5291,'Imatinib',NULL,'C29H31N7O',493.6,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/5291',now()),
 (123631,'Gefitinib',NULL,'C22H24ClFN4O3',446.9,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/123631',now()),
 (176870,'Erlotinib',NULL,'C22H23N3O4',393.4,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/176870',now()),
 (71496458,'Osimertinib',NULL,'C28H33N7O2',499.6,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/71496458',now()),
 (42611257,'Vemurafenib',NULL,'C23H18ClF2N3O3S',489.9,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/42611257',now()),
 (137278711,'Sotorasib',NULL,'C30H30F2N6O3',560.6,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/137278711',now()),
 (49846579,'Venetoclax',NULL,'C45H50ClN7O7S',868.4,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/49846579',now()),
 (25126798,'Ruxolitinib',NULL,'C17H18N6',306.4,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/25126798',now()),
 (5284616,'Sirolimus',NULL,'C51H79NO13',914.2,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/5284616',now()),
 (23725625,'Olaparib',NULL,'C24H23FN4O3',434.5,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/23725625',now()),
 (5330286,'Palbociclib',NULL,'C24H29N7O2',447.5,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/5330286',now()),
 (10127622,'Selumetinib',NULL,'C17H15BrClFN4O3',457.7,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/10127622',now()),
 (11626560,'Crizotinib',NULL,'C21H22Cl2FN5O',450.3,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/11626560',now()),
 (4091,'Metformin','CN(C)C(=N)N=C(N)N','C4H11N5',129.16,'Approved','https://pubchem.ncbi.nlm.nih.gov/compound/4091',now())
ON CONFLICT (pubchem_cid) DO NOTHING;

WITH pairs(protein_accession,cid,pdb_id,activity_type,value,units) AS (VALUES
 ('P00533',123631,'1M17','IC50',33,'nM'), ('P00533',176870,'4HJO','IC50',2,'nM'),
 ('P00533',71496458,'6JXT','IC50',1,'nM'), ('P15056',42611257,'3OG7','IC50',31,'nM'),
 ('P01116',137278711,'6OIM','IC50',6,'nM'), ('P10415',49846579,'6O0K','Ki',10,'pM'),
 ('O60674',25126798,'6VGL','IC50',3,'nM'), ('P42345',5284616,'4JSV','Kd',12,'nM'),
 ('P09874',23725625,'7KK4','IC50',5,'nM'), ('P11802',5330286,'2W96','IC50',11,'nM'),
 ('Q02750',10127622,'4U7Z','IC50',14,'nM'), ('Q9UM73',11626560,'2XP2','IC50',24,'nM'),
 ('P08581',11626560,'2WGJ','IC50',11,'nM'), ('P15692',2244,'2VPF','reported',NULL,NULL),
 ('P05231',4091,'1ALU','reported',NULL,NULL)
)
INSERT INTO scientific_structures(protein_id,structure_kind,external_id,format,uri,provenance,retrieved_at)
SELECT p.id,'experimental',pairs.pdb_id,'mmCIF','https://files.rcsb.org/download/'||pairs.pdb_id||'.cif',
 jsonb_build_object('source','RCSB PDB','label','Experimental structure; inspect entry experimental method and construct.'),now()
FROM pairs JOIN scientific_proteins p ON p.uniprot_id=pairs.protein_accession
ON CONFLICT DO NOTHING;

WITH pairs(protein_accession,cid,pdb_id,activity_type,value,units) AS (VALUES
 ('P00533',123631,'1M17','IC50',33,'nM'), ('P00533',176870,'4HJO','IC50',2,'nM'),
 ('P00533',71496458,'6JXT','IC50',1,'nM'), ('P15056',42611257,'3OG7','IC50',31,'nM'),
 ('P01116',137278711,'6OIM','IC50',6,'nM'), ('P10415',49846579,'6O0K','Ki',10,'pM'),
 ('O60674',25126798,'6VGL','IC50',3,'nM'), ('P42345',5284616,'4JSV','Kd',12,'nM'),
 ('P09874',23725625,'7KK4','IC50',5,'nM'), ('P11802',5330286,'2W96','IC50',11,'nM'),
 ('Q02750',10127622,'4U7Z','IC50',14,'nM'), ('Q9UM73',11626560,'2XP2','IC50',24,'nM'),
 ('P08581',11626560,'2WGJ','IC50',11,'nM'), ('P15692',2244,'2VPF','reported',NULL,NULL),
 ('P05231',4091,'1ALU','reported',NULL,NULL)
)
INSERT INTO scientific_bioactivities(protein_id,compound_id,activity_type,value,units,assay_description,evidence_level,source_key,source_url,retrieved_at,provenance)
SELECT p.id,c.id,pairs.activity_type,pairs.value,pairs.units,'Demonstration evidence link; verify against the cited primary database before decisions.',
 'seed_reference','rcsb','https://www.rcsb.org/structure/'||pairs.pdb_id,now(),jsonb_build_object('pdb_id',pairs.pdb_id,'verification_required',true)
FROM pairs JOIN scientific_proteins p ON p.uniprot_id=pairs.protein_accession
JOIN scientific_compounds c ON c.pubchem_cid=pairs.cid
WHERE NOT EXISTS (SELECT 1 FROM scientific_bioactivities b WHERE b.protein_id=p.id AND b.compound_id=c.id AND b.source_url='https://www.rcsb.org/structure/'||pairs.pdb_id);

COMMIT;
