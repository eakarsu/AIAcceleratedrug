const express = require('express');
const fetch = require('node-fetch');
const { authenticateToken } = require('../middleware/auth');
const { resolveProtein, resolveStructures, resolveCompound, fetchChEMBLEvidence,
  fetchLiteratureEvidence, fetchClinicalTrialEvidence } = require('../services/scientificSources');
const { storeTextArtifact, resolveLocalObject } = require('../services/objectStore');
const { groupProteinFeatures, sourceBackedProteinReport, normalizeProteinReport } = require('../services/proteinAnalyst');

const router = express.Router();
router.use(authenticateToken);

function tenant(req) {
  return String(req.user.tenantId || `user-${req.user.id}`);
}

function asNumber(value) {
  return value == null || value === '' ? null : Number(value);
}

function parseProviderJson(value) {
  const text = String(value || '').replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try { return JSON.parse(text); } catch (_) { /* Extract the first complete JSON object below. */ }
  const start = text.indexOf('{');
  if (start < 0) throw new Error('AI provider did not return a JSON object.');
  let depth = 0; let inString = false; let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index];
    if (escaped) { escaped = false; continue; }
    if (inString && character === '\\') { escaped = true; continue; }
    if (character === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (character === '{') depth += 1;
    if (character === '}') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error('AI provider JSON was truncated before completion.');
}

const assayTemplates = [
  ['Biochemical potency','biochemical','IC50'], ['Target engagement','cellular','EC50'],
  ['Binding kinetics','biophysical','Kd / kon / koff'], ['Selectivity panel','selectivity','off-target activity'],
  ['Cell viability','phenotypic','growth inhibition'], ['Microsomal stability','ADME','intrinsic clearance'],
  ['Caco-2 permeability','ADME','Papp'], ['Plasma protein binding','ADME','unbound fraction'],
  ['CYP inhibition','safety','IC50'], ['hERG current','safety','percent inhibition'],
  ['Ames mutagenicity','safety','mutagenic response'], ['Hepatocyte toxicity','safety','cell viability'],
  ['Solubility','developability','kinetic solubility'], ['Chemical stability','developability','half-life'],
  ['In vivo exposure','pharmacokinetics','AUC / Cmax'],
];

const experimentTemplates = [
  'Confirm biochemical potency','Measure direct target engagement','Establish concentration-response relationship',
  'Map selectivity against homologs','Validate disease-relevant cellular phenotype','Quantify metabolic stability',
  'Measure permeability and efflux','Determine unbound plasma fraction','Profile CYP inhibition liability',
  'Measure cardiac ion-channel risk','Assess bacterial mutagenicity','Evaluate primary hepatocyte tolerance',
  'Determine aqueous solubility','Test formulation and chemical stability','Establish pilot pharmacokinetics',
];

async function ensureTenantWorkspace(pool, req) {
  const selected = await pool.query(`SELECT
    (SELECT id FROM scientific_proteins WHERE uniprot_id='P00533' LIMIT 1) protein_id,
    (SELECT id FROM scientific_compounds WHERE pubchem_cid=123631 LIMIT 1) compound_id`);
  const proteinId = selected.rows[0]?.protein_id; const compoundId = selected.rows[0]?.compound_id;
  if (!proteinId || !compoundId) return;
  const project = await pool.query(
    `INSERT INTO discovery_science_projects(tenant_id,name,therapeutic_area,hypothesis,status,owner,protein_id,lead_compound_id,decision_criteria,next_milestone,created_by)
     VALUES ($1,'EGFR inhibitor evidence program','Oncology','A source-traceable EGFR inhibitor program can prioritize experiments while keeping predictions distinct from measured evidence.','active',$2,$3,$4,$5::jsonb,'Complete orthogonal potency and selectivity review',$6)
     ON CONFLICT(tenant_id,name) DO UPDATE SET updated_at=now() RETURNING id`,
    [tenant(req), req.user.name || 'Scientific team', proteinId, compoundId,
      JSON.stringify(['Verified biochemical potency', 'Cellular target engagement', 'Acceptable selectivity window', 'ADMET risk reviewed']), req.user.id]
  );
  const projectId = project.rows[0].id;
  const existingAssays = await pool.query('SELECT count(*)::int count FROM scientific_assay_records WHERE tenant_id=$1', [tenant(req)]);
  if (existingAssays.rows[0].count === 0) {
    for (let index = 0; index < assayTemplates.length; index += 1) {
      const [name, type, endpoint] = assayTemplates[index];
      await pool.query(
        `INSERT INTO scientific_assay_records(tenant_id,project_id,protein_id,compound_id,assay_name,assay_type,endpoint,protocol_summary,status,quality_control,scheduled_at,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,now()+make_interval(days => $11::int),$12)`,
        [tenant(req), projectId, proteinId, compoundId, name, type, endpoint,
          `Protocol plan for ${name.toLowerCase()} with positive, negative, vehicle, replicate, and data-quality controls.`,
          index < 3 ? 'scheduled' : 'planned', JSON.stringify({ minimumReplicates: 3, blindedAnalysis: index % 2 === 0, acceptanceStatus: 'pending' }), index + 1, req.user.id]
      );
    }
  }
  const existingExperiments = await pool.query('SELECT count(*)::int count FROM scientific_experiment_plans WHERE tenant_id=$1', [tenant(req)]);
  if (existingExperiments.rows[0].count === 0) {
    for (let index = 0; index < experimentTemplates.length; index += 1) {
      const title = experimentTemplates[index];
      await pool.query(
        `INSERT INTO scientific_experiment_plans(tenant_id,project_id,title,hypothesis,objective,protocol_summary,acceptance_criteria,status,owner,due_date,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,current_date+$10::int,$11)`,
        [tenant(req), projectId, title, `${title} will provide decision-relevant evidence for the selected protein–compound pair.`,
          `Generate reproducible evidence for ${title.toLowerCase()}.`,
          'Use a versioned protocol, predefined controls, replicate measurements, blinded analysis where feasible, and preserve raw data checksums.',
          JSON.stringify(['Controls pass', 'Replicates meet precision threshold', 'Raw data and analysis version retained']),
          index === 0 ? 'approved' : 'draft', req.user.name || 'Scientific team', 7 + index * 3, req.user.id]
      );
    }
  }
}

function physchemAssessment(compound) {
  const metrics = {
    molecularWeight: asNumber(compound.molecular_weight ?? compound.molecularWeight),
    xlogp: asNumber(compound.xlogp),
    tpsa: asNumber(compound.tpsa),
    hbondDonors: asNumber(compound.hbond_donors ?? compound.hbondDonors),
    hbondAcceptors: asNumber(compound.hbond_acceptors ?? compound.hbondAcceptors),
    rotatableBonds: asNumber(compound.rotatable_bonds ?? compound.rotatableBonds),
  };
  const checks = [
    ['Molecular weight ≤ 500', metrics.molecularWeight, 500, 'max'],
    ['XLogP ≤ 5', metrics.xlogp, 5, 'max'],
    ['H-bond donors ≤ 5', metrics.hbondDonors, 5, 'max'],
    ['H-bond acceptors ≤ 10', metrics.hbondAcceptors, 10, 'max'],
  ].map(([label, value, threshold, direction]) => ({
    label, value, threshold, status: value == null ? 'unknown' : direction === 'max' && value <= threshold ? 'within' : 'outside',
  }));
  const known = checks.filter((check) => check.status !== 'unknown');
  const violations = known.filter((check) => check.status === 'outside').length;
  const completeness = Math.round((known.length / checks.length) * 100);
  return {
    headline: violations === 0 ? 'No Lipinski threshold violations detected' : `${violations} Lipinski threshold violation${violations === 1 ? '' : 's'} detected`,
    summary: 'This deterministic triage summarizes physicochemical descriptors. It does not predict efficacy, toxicity, clinical success, or binding.',
    classification: completeness < 100 ? 'incomplete-data' : violations <= 1 ? 'rule-compatible' : 'review-required',
    metrics, checks,
    uncertainty: {
      type: 'descriptor completeness and threshold margin', completeness,
      note: 'Rule output is deterministic; uncertainty reflects missing descriptors and distance from thresholds, not biological uncertainty.',
    },
    applicability: {
      inDomain: metrics.molecularWeight != null && metrics.molecularWeight < 1500,
      domain: 'Small-molecule oral drug-likeness triage; not appropriate for biologics, peptides, or definitive developability decisions.',
    },
    actions: ['Verify source descriptors', 'Review target-specific potency evidence', 'Run validated ADMET models', 'Confirm experimentally before progression'],
  };
}

function quantile(sorted, fraction) {
  if (!sorted.length) return null;
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position); const remainder = position - lower;
  return sorted[lower + 1] === undefined ? sorted[lower] : sorted[lower] + remainder * (sorted[lower + 1] - sorted[lower]);
}

function proteinComposition(sequence) {
  const alphabet = 'ACDEFGHIKLMNPQRSTVWY'.split('');
  const normalized = String(sequence || '').toUpperCase();
  const vector = alphabet.map((symbol) => [...normalized].filter((item) => item === symbol).length / Math.max(1, normalized.length));
  vector.push(Math.min(normalized.length, 5000) / 5000);
  return { alphabet, vector, sequenceLength: normalized.length, standardResidueCoverage:
    normalized.split('').filter((symbol) => alphabet.includes(symbol)).length / Math.max(1, normalized.length) };
}

async function recordEvent(pool, req, entityType, entityId, action, details = {}, source = {}) {
  await pool.query(
    `INSERT INTO scientific_provenance_events
      (tenant_id,entity_type,entity_id,action,source_key,source_url,model_key,details,actor_user_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
    [tenant(req), entityType, String(entityId), action, source.key || null, source.url || null,
      source.modelKey || null, JSON.stringify(details), req.user.id]
  );
}

router.get('/bootstrap', async (req, res, next) => {
  try {
    const pool = req.app.get('db');
    await ensureTenantWorkspace(pool, req);
    const [proteins, compounds, models, capabilities, sources, candidates, projects, assays, experiments, counts] = await Promise.all([
      pool.query(`SELECT id,uniprot_id,protein_name,gene_symbol,organism,sequence_length,function_description,pathways,diseases,features,source_url,retrieved_at
                  FROM scientific_proteins ORDER BY protein_name LIMIT 30`),
      pool.query(`SELECT id,pubchem_cid,preferred_name,canonical_smiles,molecular_formula,molecular_weight,xlogp,tpsa,hbond_donors,hbond_acceptors,rotatable_bonds,development_status,source_url,retrieved_at
                  FROM scientific_compounds ORDER BY preferred_name LIMIT 30`),
      pool.query('SELECT * FROM scientific_model_versions ORDER BY readiness, display_name'),
      pool.query('SELECT * FROM scientific_capabilities ORDER BY capability'),
      pool.query('SELECT * FROM scientific_sources ORDER BY name'),
      pool.query('SELECT * FROM discovery_candidates WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 30', [tenant(req)]),
      pool.query(`SELECT p.*,sp.protein_name,sc.preferred_name lead_compound_name FROM discovery_science_projects p
                  LEFT JOIN scientific_proteins sp ON sp.id=p.protein_id LEFT JOIN scientific_compounds sc ON sc.id=p.lead_compound_id
                  WHERE p.tenant_id=$1 ORDER BY p.updated_at DESC`, [tenant(req)]),
      pool.query(`SELECT a.*,sp.protein_name,sc.preferred_name FROM scientific_assay_records a
                  LEFT JOIN scientific_proteins sp ON sp.id=a.protein_id LEFT JOIN scientific_compounds sc ON sc.id=a.compound_id
                  WHERE a.tenant_id=$1 ORDER BY a.scheduled_at NULLS LAST,a.created_at LIMIT 50`, [tenant(req)]),
      pool.query('SELECT * FROM scientific_experiment_plans WHERE tenant_id=$1 ORDER BY due_date NULLS LAST,created_at LIMIT 50', [tenant(req)]),
      pool.query(`SELECT (SELECT count(*) FROM scientific_proteins)::int proteins,
                         (SELECT count(*) FROM scientific_compounds)::int compounds,
                         (SELECT count(*) FROM scientific_structures)::int structures,
                         (SELECT count(*) FROM scientific_bioactivities)::int bioactivities,
                         (SELECT count(*) FROM scientific_model_versions)::int models`),
    ]);
    res.json({ proteins: proteins.rows, compounds: compounds.rows, models: models.rows,
      capabilities: capabilities.rows, sources: sources.rows, candidates: candidates.rows, projects: projects.rows,
      assays: assays.rows, experiments: experiments.rows, counts: counts.rows[0],
      researchUseNotice: 'Predictions support research prioritization only and do not replace laboratory, clinical, safety, or regulatory validation.' });
  } catch (error) { next(error); }
});

router.post('/resolve/protein', async (req, res, next) => {
  try {
    const pool = req.app.get('db');
    const profile = await resolveProtein(req.body.input, req.body.mode);
    const structures = await resolveStructures(profile.uniprotId);
    const result = await pool.query(
      `INSERT INTO scientific_proteins
       (uniprot_id,entry_name,protein_name,gene_symbol,organism,sequence,sequence_length,function_description,pathways,diseases,features,isoforms,source_payload,source_url,retrieved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,$14,now())
       ON CONFLICT (uniprot_id) DO UPDATE SET entry_name=EXCLUDED.entry_name,protein_name=EXCLUDED.protein_name,
        gene_symbol=EXCLUDED.gene_symbol,organism=EXCLUDED.organism,sequence=COALESCE(EXCLUDED.sequence,scientific_proteins.sequence),
        sequence_length=EXCLUDED.sequence_length,function_description=EXCLUDED.function_description,pathways=EXCLUDED.pathways,
        diseases=EXCLUDED.diseases,features=EXCLUDED.features,isoforms=EXCLUDED.isoforms,source_payload=EXCLUDED.source_payload,
        source_url=EXCLUDED.source_url,retrieved_at=now(),updated_at=now()
       RETURNING *`,
      [profile.uniprotId, profile.entryName || null, profile.proteinName, profile.geneSymbol || null, profile.organism,
       profile.sequence, profile.sequenceLength, profile.functionDescription, JSON.stringify(profile.pathways), JSON.stringify(profile.diseases),
       JSON.stringify(profile.features), JSON.stringify(profile.isoforms), JSON.stringify(profile.sourcePayload), profile.sourceUrl]
    );
    for (const structure of [...structures.experimental, ...structures.predicted]) {
      await pool.query(
        `INSERT INTO scientific_structures(protein_id,structure_kind,external_id,format,uri,confidence,provenance,retrieved_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,now()) ON CONFLICT DO NOTHING`,
        [result.rows[0].id, structure.kind, structure.externalId, structure.format, structure.uri,
          JSON.stringify(structure.confidence || {}), JSON.stringify({ sourceUrl: structure.sourceUrl, label: structure.label })]
      );
    }
    await recordEvent(pool, req, 'protein', result.rows[0].id, 'resolved',
      { accession: profile.uniprotId, structureCount: structures.experimental.length + structures.predicted.length },
      { key: profile.localSequence ? null : 'uniprot', url: profile.sourceUrl });
    res.json({ protein: result.rows[0], structures, source: { name: profile.localSequence ? 'User upload' : 'UniProt', url: profile.sourceUrl, retrievedAt: new Date().toISOString() } });
  } catch (error) { res.status(422).json({ error: error.message }); }
});

router.post('/resolve/compound', async (req, res) => {
  try {
    const pool = req.app.get('db');
    const profile = await resolveCompound(req.body.input, req.body.mode);
    const result = await pool.query(
      `INSERT INTO scientific_compounds
       (pubchem_cid,preferred_name,canonical_smiles,isomeric_smiles,inchi_key,molecular_formula,molecular_weight,xlogp,tpsa,hbond_donors,hbond_acceptors,rotatable_bonds,synonyms,source_payload,source_url,retrieved_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15,now())
       ON CONFLICT (pubchem_cid) DO UPDATE SET preferred_name=EXCLUDED.preferred_name,canonical_smiles=EXCLUDED.canonical_smiles,
        isomeric_smiles=EXCLUDED.isomeric_smiles,inchi_key=EXCLUDED.inchi_key,molecular_formula=EXCLUDED.molecular_formula,
        molecular_weight=EXCLUDED.molecular_weight,xlogp=EXCLUDED.xlogp,tpsa=EXCLUDED.tpsa,hbond_donors=EXCLUDED.hbond_donors,
        hbond_acceptors=EXCLUDED.hbond_acceptors,rotatable_bonds=EXCLUDED.rotatable_bonds,synonyms=EXCLUDED.synonyms,
        source_payload=EXCLUDED.source_payload,source_url=EXCLUDED.source_url,retrieved_at=now(),updated_at=now()
       RETURNING *`,
      [profile.pubchemCid, profile.preferredName, profile.canonicalSmiles, profile.isomericSmiles, profile.inchiKey,
       profile.molecularFormula, profile.molecularWeight, profile.xlogp, profile.tpsa, profile.hbondDonors,
       profile.hbondAcceptors, profile.rotatableBonds, JSON.stringify(profile.synonyms), JSON.stringify(profile.sourcePayload), profile.sourceUrl]
    );
    if (result.rows[0].canonical_smiles) {
      try {
        await pool.query(`INSERT INTO scientific_rdkit_molecules(compound_id,molecule) VALUES($1,mol_from_smiles($2::cstring))
                          ON CONFLICT(compound_id) DO UPDATE SET molecule=EXCLUDED.molecule`,
          [result.rows[0].id, result.rows[0].canonical_smiles]);
      } catch (_) { /* Capability endpoint reports when the optional cartridge is unavailable. */ }
    }
    await pool.query(
      `INSERT INTO scientific_structures(compound_id,structure_kind,external_id,format,uri,provenance,retrieved_at)
       VALUES ($1,'compound_conformer',$2,'SDF',$3,$4::jsonb,now()) ON CONFLICT DO NOTHING`,
      [result.rows[0].id, String(profile.pubchemCid), profile.conformerUrl, JSON.stringify({ source: 'PubChem', label: 'PubChem 3D conformer; not a bound pose.' })]
    );
    await recordEvent(pool, req, 'compound', result.rows[0].id, 'resolved', { cid: profile.pubchemCid }, { key: 'pubchem', url: profile.sourceUrl });
    res.json({ compound: result.rows[0], presentation: { imageUrl: profile.imageUrl, conformerUrl: profile.conformerUrl, description: profile.description },
      source: { name: 'PubChem', url: profile.sourceUrl, retrievedAt: new Date().toISOString() } });
  } catch (error) { res.status(422).json({ error: error.message }); }
});

router.post('/resolve/sdf', async (req, res) => {
  try {
    const sdf = String(req.body.sdf || '');
    if (sdf.length < 40 || sdf.length > 5_000_000 || !/(V2000|V3000)/.test(sdf)) {
      return res.status(422).json({ error: 'Provide a valid V2000/V3000 SDF record up to 5 MB.' });
    }
    const pool = req.app.get('db');
    const stored = await storeTextArtifact(sdf, 'sdf');
    const title = String(req.body.name || sdf.split(/\r?\n/)[0] || 'Uploaded compound').trim().slice(0, 200);
    const compoundResult = await pool.query(
      `INSERT INTO scientific_compounds(preferred_name,development_status,source_key,source_payload,retrieved_at)
       VALUES ($1,'Research input','user_upload',$2::jsonb,now()) RETURNING *`,
      [title || 'Uploaded compound', JSON.stringify({ checksum: stored.checksum, format: 'SDF', historicalEvidence: false })]
    );
    const compound = compoundResult.rows[0];
    const artifactResult = await pool.query(
      `INSERT INTO scientific_artifacts(tenant_id,entity_type,entity_id,artifact_kind,format,object_uri,checksum_sha256,size_bytes,source_filename,content_metadata,created_by)
       VALUES ($1,'compound',$2,'uploaded_structure','SDF',$3,$4,$5,$6,$7::jsonb,$8)
       ON CONFLICT(tenant_id,checksum_sha256,artifact_kind) DO UPDATE SET entity_id=EXCLUDED.entity_id RETURNING *`,
      [tenant(req), String(compound.id), stored.objectUri, stored.checksum, stored.sizeBytes,
       String(req.body.filename || '').slice(0, 255) || null, JSON.stringify({ label: 'User-uploaded structure; identity and chemistry not independently verified.' }), req.user.id]
    );
    const artifact = artifactResult.rows[0];
    const structure = await pool.query(
      `INSERT INTO scientific_structures(compound_id,structure_kind,external_id,format,uri,checksum,provenance,retrieved_at)
       VALUES ($1,'compound_conformer',$2,'SDF',$3,$2,$4::jsonb,now()) RETURNING *`,
      [compound.id, stored.checksum, `/api/discovery/artifacts/${artifact.id}`, JSON.stringify({ source: 'user_upload', label: 'Uploaded SDF; not a validated bound pose.' })]
    );
    await recordEvent(pool, req, 'compound', compound.id, 'sdf_uploaded', { artifactId: artifact.id, checksum: stored.checksum }, { key: 'user_upload' });
    res.status(201).json({ compound, artifact, structure: structure.rows[0],
      warning: 'The file is stored with a checksum. Chemical standardization and descriptors require the RDKit cartridge or an approved chemistry runner.' });
  } catch (error) { res.status(422).json({ error: error.message }); }
});

router.get('/artifacts/:id', async (req, res) => {
  try {
    const result = await req.app.get('db').query('SELECT * FROM scientific_artifacts WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant(req)]);
    if (!result.rows.length) return res.status(404).json({ error: 'Artifact not found.' });
    const artifact = result.rows[0];
    res.type(artifact.format === 'SDF' ? 'chemical/x-mdl-sdfile' : 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${artifact.source_filename || `${artifact.checksum_sha256}.sdf`}"`);
    return res.sendFile(resolveLocalObject(artifact.object_uri));
  } catch (error) { res.status(404).json({ error: 'Artifact is unavailable.' }); }
});

router.get('/evidence', async (req, res, next) => {
  try {
    const pool = req.app.get('db');
    const proteinId = Number(req.query.proteinId); const compoundId = Number(req.query.compoundId);
    const [structures, bioactivities] = await Promise.all([
      pool.query(`SELECT * FROM scientific_structures
                  WHERE (($1::bigint IS NOT NULL AND protein_id=$1) OR ($2::bigint IS NOT NULL AND compound_id=$2))
                  ORDER BY CASE structure_kind WHEN 'experimental' THEN 1 WHEN 'alphafold_prediction' THEN 2 ELSE 3 END, created_at DESC`,
        [Number.isFinite(proteinId) ? proteinId : null, Number.isFinite(compoundId) ? compoundId : null]),
      pool.query(`SELECT b.*,p.protein_name,c.preferred_name FROM scientific_bioactivities b JOIN scientific_proteins p ON p.id=b.protein_id
                  JOIN scientific_compounds c ON c.id=b.compound_id WHERE ($1::bigint IS NULL OR b.protein_id=$1) AND ($2::bigint IS NULL OR b.compound_id=$2) ORDER BY b.id`,
        [Number.isFinite(proteinId) ? proteinId : null, Number.isFinite(compoundId) ? compoundId : null]),
    ]);
    res.json({ structures: structures.rows, bioactivities: bioactivities.rows });
  } catch (error) { next(error); }
});

router.get('/structures', async (req, res, next) => {
  try {
    const pool = req.app.get('db');
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 24));
    const offset = (page - 1) * limit;
    const search = String(req.query.search || '').trim();
    const parameters = search ? [`%${search}%`, limit, offset] : [limit, offset];
    const where = search
      ? `WHERE s.protein_id IS NOT NULL AND (
          p.protein_name ILIKE $1 OR p.gene_symbol ILIKE $1 OR p.uniprot_id ILIKE $1
          OR s.external_id ILIKE $1 OR s.structure_kind ILIKE $1
        )`
      : 'WHERE s.protein_id IS NOT NULL';
    const limitParameter = search ? '$2' : '$1';
    const offsetParameter = search ? '$3' : '$2';
    const [records, count, summary] = await Promise.all([
      pool.query(
        `SELECT s.id,s.structure_kind,s.external_id,s.format,s.uri,s.checksum,s.confidence,s.provenance,
                s.retrieved_at,s.created_at,p.id protein_id,p.protein_name,p.gene_symbol,p.uniprot_id,p.organism,
                p.sequence_length,p.source_url protein_source_url
         FROM scientific_structures s
         JOIN scientific_proteins p ON p.id=s.protein_id
         ${where}
         ORDER BY CASE s.structure_kind WHEN 'experimental' THEN 1 WHEN 'alphafold_prediction' THEN 2 ELSE 3 END,
                  p.protein_name,s.external_id
         LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
        parameters
      ),
      pool.query(
        `SELECT count(*)::int total FROM scientific_structures s
         JOIN scientific_proteins p ON p.id=s.protein_id ${where}`,
        search ? [parameters[0]] : []
      ),
      pool.query(
        `SELECT count(*)::int total,
                count(*) FILTER (WHERE structure_kind='experimental')::int experimental,
                count(*) FILTER (WHERE structure_kind='alphafold_prediction')::int predicted,
                count(DISTINCT protein_id)::int proteins
         FROM scientific_structures WHERE protein_id IS NOT NULL`
      ),
    ]);
    const total = count.rows[0].total;
    res.json({
      data: records.rows,
      summary: summary.rows[0],
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) { next(error); }
});

router.post('/protein-analyst', async (req, res) => {
  const pool = req.app.get('db');
  try {
    const proteinId = Number(req.body.proteinId);
    if (!Number.isFinite(proteinId)) return res.status(422).json({ error: 'Resolve and select a protein first.' });
    const question = String(req.body.question || 'Describe this protein, its biological role, structural evidence, therapeutic relevance, and evidence gaps.').trim().slice(0, 1200);
    const proteinResult = await pool.query('SELECT * FROM scientific_proteins WHERE id=$1', [proteinId]);
    const protein = proteinResult.rows[0];
    if (!protein) return res.status(404).json({ error: 'Protein not found.' });
    const compoundResult = req.body.compoundId
      ? await pool.query('SELECT * FROM scientific_compounds WHERE id=$1', [req.body.compoundId]) : { rows: [] };
    const compound = compoundResult.rows[0] || null;
    const [structureResult, ligandResult, publicationResult] = await Promise.all([
      pool.query(`SELECT s.*,CASE WHEN s.structure_kind='experimental'
                    THEN 'https://www.rcsb.org/structure/'||s.external_id
                    ELSE COALESCE(s.provenance->>'sourceUrl',s.uri) END source_url
                  FROM scientific_structures s WHERE s.protein_id=$1
                  ORDER BY CASE s.structure_kind WHEN 'experimental' THEN 1 WHEN 'alphafold_prediction' THEN 2 ELSE 3 END,s.external_id LIMIT 20`, [protein.id]),
      pool.query(`SELECT c.id,c.preferred_name,c.pubchem_cid,c.chembl_id,c.development_status,
                         count(b.id)::int evidence_count,min(b.source_url) source_url,
                         jsonb_agg(DISTINCT jsonb_build_object('type',b.activity_type,'value',b.value,'units',b.units,'level',b.evidence_level)) evidence
                  FROM scientific_bioactivities b JOIN scientific_compounds c ON c.id=b.compound_id
                  WHERE b.protein_id=$1 GROUP BY c.id ORDER BY count(b.id) DESC,c.preferred_name LIMIT 15`, [protein.id]),
      fetchLiteratureEvidence(protein, compound).catch(() => []),
    ]);
    const annotations = groupProteinFeatures(protein.features);
    const structures = structureResult.rows.map((item, index) => ({ ...item, source_id: `S${index + 2}` }));
    const nextSourceIndex = structures.length + 2;
    const knownLigands = ligandResult.rows.map((item, index) => ({ ...item, source_id: `S${nextSourceIndex + index}` }));
    const nextPublicationIndex = nextSourceIndex + knownLigands.length;
    const publications = publicationResult.slice(0, 8).map((item, index) => ({ ...item, source_id: `S${nextPublicationIndex + index}` }));
    const sources = [
      { id: 'S1', source: 'UniProtKB', title: `${protein.protein_name} (${protein.uniprot_id})`, url: protein.source_url, evidenceType: 'Reviewed protein record', retrievedAt: protein.retrieved_at },
      ...structures.map((item) => ({ id: item.source_id, source: item.structure_kind === 'experimental' ? 'RCSB PDB' : 'AlphaFold DB',
        title: `${item.external_id} · ${item.structure_kind.replace(/_/g, ' ')}`, url: item.source_url, evidenceType: item.structure_kind, retrievedAt: item.retrieved_at })),
      ...knownLigands.map((item) => ({ id: item.source_id, source: item.chembl_id ? 'ChEMBL / stored bioactivity' : 'Stored bioactivity evidence',
        title: `${item.preferred_name} · ${item.evidence_count} evidence record${item.evidence_count === 1 ? '' : 's'}`,
        url: item.source_url || (item.pubchem_cid ? `https://pubchem.ncbi.nlm.nih.gov/compound/${item.pubchem_cid}` : null), evidenceType: 'Protein–compound evidence', retrievedAt: null })),
      ...publications.map((item) => ({ id: item.source_id, source: 'Europe PMC', title: item.title, url: item.sourceUrl,
        evidenceType: 'Term-matched publication', retrievedAt: new Date().toISOString() })),
    ];
    const fallback = sourceBackedProteinReport({ protein, annotations, structures, knownLigands, publications, question });
    let report = fallback;
    let analysis = { status: 'source_summary', provider: 'Deterministic source synthesis', model: 'source-backed-v1', generatedAt: new Date().toISOString(), jobId: null };
    let warning = null;

    if (req.body.useAi !== false && process.env.OPENROUTER_API_KEY) {
      try {
        const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
        const context = {
          question,
          protein: { accession: protein.uniprot_id, name: protein.protein_name, gene: protein.gene_symbol, organism: protein.organism,
            sequenceLength: protein.sequence_length, function: protein.function_description, pathways: protein.pathways, diseases: protein.diseases,
            annotations, isoforms: protein.isoforms },
          selectedCompound: compound && { name: compound.preferred_name, cid: compound.pubchem_cid, formula: compound.molecular_formula },
          structures: structures.map((item) => ({ sourceId: item.source_id, kind: item.structure_kind, id: item.external_id, confidence: item.confidence, provenance: item.provenance })),
          linkedCompounds: knownLigands.map((item) => ({ sourceId: item.source_id, name: item.preferred_name, evidenceCount: item.evidence_count, evidence: item.evidence })),
          publications: publications.map((item) => ({ sourceId: item.source_id, title: item.title, year: item.publicationYear, journal: item.journal })),
        };
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: {
          'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:3000', 'X-Title': 'AIAcceleratedrug Protein AI Analyst',
        }, body: JSON.stringify({ model, temperature: 0.1, max_tokens: 5000, reasoning: { effort: 'none', exclude: true },
          plugins: [{ id: 'response-healing' }],
          messages: [{ role: 'system', content: `You are a protein scientific evidence analyst. Use only the supplied context. Never invent structures, residues, measurements, mechanisms, efficacy, safety, or clinical claims. Distinguish experimental structures from AlphaFold predictions. Cite claims using only supplied source IDs. Return strict JSON with: headline, executiveSummary, answer, keyFacts [{label,value,interpretation,citations:["S1"]}], sections [{title,detail,citations:["S1"]}], evidenceGaps [string], nextSteps [string], limitations [string]. Keep the answer concise: at most 6 key facts, 5 sections, 6 evidence gaps, 6 next steps, and 5 limitations; keep every prose field under 500 characters. State when evidence is absent and require laboratory validation.` },
            { role: 'user', content: JSON.stringify(context) }], response_format: { type: 'json_object' } }) });
        const payload = await response.json();
        if (!response.ok || payload.error) throw new Error(payload.error?.message || `OpenRouter returned ${response.status}`);
        const content = payload.choices?.[0]?.message?.content || '{}';
        const parsed = parseProviderJson(content);
        report = normalizeProteinReport(parsed, fallback, sources);
        const modelVersionResult = await pool.query(`SELECT * FROM scientific_model_versions WHERE key='openrouter-synthesis' ORDER BY version DESC LIMIT 1`);
        const modelVersion = modelVersionResult.rows[0];
        const job = await pool.query(
          `INSERT INTO scientific_prediction_jobs(tenant_id,user_id,protein_id,compound_id,model_key,model_version,task,status,input_snapshot,result,uncertainty,applicability,provenance,completed_at)
           VALUES($1,$2,$3,$4,'openrouter-synthesis',$5,'protein-description','completed',$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,now()) RETURNING id`,
          [tenant(req), req.user.id, protein.id, compound?.id || null, modelVersion?.version || 'configured',
            JSON.stringify({ question, sourceIds: sources.map((source) => source.id) }), JSON.stringify(report),
            JSON.stringify({ type: 'narrative model output', note: 'Not a calibrated biological or physical prediction.' }),
            JSON.stringify({ inDomain: true, domain: 'Source-grounded protein evidence organization only.' }),
            JSON.stringify({ provider: 'OpenRouter', model, sourceCount: sources.length, generatedAt: new Date().toISOString() })]
        );
        analysis = { status: 'completed', provider: 'OpenRouter', model, generatedAt: new Date().toISOString(), jobId: job.rows[0].id };
        await recordEvent(pool, req, 'protein', protein.id, 'ai_description_generated', { question, sourceCount: sources.length, jobId: job.rows[0].id }, { modelKey: 'openrouter-synthesis' });
      } catch (error) {
        warning = `AI synthesis was unavailable; displaying the source-backed report. ${error.message}`;
      }
    } else if (req.body.useAi !== false) {
      warning = 'OpenRouter is not configured; displaying the source-backed report.';
    }

    res.json({ protein, selectedCompound: compound, annotations, structures, knownLigands, publications, sources, report, analysis, warning,
      researchUseNotice: 'Research prioritization only. Verify citations and validate all findings experimentally and clinically.' });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

router.post('/enrich/evidence', async (req, res) => {
  try {
    const pool = req.app.get('db');
    const [proteinResult, compoundResult] = await Promise.all([
      pool.query('SELECT * FROM scientific_proteins WHERE id=$1', [req.body.proteinId]),
      pool.query('SELECT * FROM scientific_compounds WHERE id=$1', [req.body.compoundId]),
    ]);
    const protein = proteinResult.rows[0]; const compound = compoundResult.rows[0];
    if (!protein || !compound) return res.status(422).json({ error: 'Select a valid protein and compound.' });
    const settled = await Promise.allSettled([
      fetchChEMBLEvidence(protein, compound), fetchLiteratureEvidence(protein, compound), fetchClinicalTrialEvidence(protein, compound),
    ]);
    const chembl = settled[0].status === 'fulfilled' ? settled[0].value : { activities: [], warning: settled[0].reason.message };
    const publications = settled[1].status === 'fulfilled' ? settled[1].value : [];
    const trials = settled[2].status === 'fulfilled' ? settled[2].value : [];
    if (chembl.molecule?.id) await pool.query('UPDATE scientific_compounds SET chembl_id=$1,updated_at=now() WHERE id=$2', [chembl.molecule.id, compound.id]);
    for (const activity of chembl.activities || []) {
      await pool.query(
        `INSERT INTO scientific_bioactivities(protein_id,compound_id,activity_type,relation,value,units,assay_description,evidence_level,source_key,source_record_id,source_url,retrieved_at,provenance)
         SELECT $1,$2,$3,$4,$5,$6,$7,'curated_database','chembl',$8,$9,now(),$10::jsonb
         WHERE NOT EXISTS(SELECT 1 FROM scientific_bioactivities WHERE source_key='chembl' AND source_record_id=$8)`,
        [protein.id, compound.id, activity.type || 'reported', activity.relation || '=', activity.value, activity.units,
          activity.assayDescription, activity.activityId, activity.sourceUrl,
          JSON.stringify({ pchemblValue: activity.pchemblValue, assayId: activity.assayId, documentId: activity.documentId })]
      );
    }
    let storedPublications = 0;
    for (const publication of publications) {
      if (!publication.pmid && !publication.doi) continue;
      let inserted = await pool.query(
        `INSERT INTO scientific_publications(doi,pmid,pmcid,title,abstract,journal,publication_year,authors,citation_count,source_url,source_payload,retrieved_at)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,now()) ON CONFLICT DO NOTHING RETURNING id`,
        [publication.doi, publication.pmid, publication.pmcid, publication.title, publication.abstract, publication.journal,
          publication.publicationYear, JSON.stringify(publication.authors), publication.citationCount, publication.sourceUrl, JSON.stringify(publication.raw)]
      );
      if (!inserted.rows.length) inserted = await pool.query(
        'SELECT id FROM scientific_publications WHERE ($1::text IS NOT NULL AND doi=$1) OR ($2::text IS NOT NULL AND pmid=$2) LIMIT 1',
        [publication.doi, publication.pmid]);
      if (inserted.rows.length) {
        await pool.query(`INSERT INTO scientific_evidence_publications(protein_id,compound_id,publication_id,relevance_note)
                          VALUES($1,$2,$3,'Matched by target and compound terms; scientist must verify relevance.') ON CONFLICT DO NOTHING`,
          [protein.id, compound.id, inserted.rows[0].id]);
        storedPublications += 1;
      }
    }
    let storedTrials = 0;
    for (const trial of trials) {
      const inserted = await pool.query(
        `INSERT INTO scientific_clinical_trials(nct_id,brief_title,overall_status,phases,conditions,interventions,sponsor,enrollment,start_date,completion_date,source_url,source_payload,retrieved_at)
         VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12::jsonb,now())
         ON CONFLICT(nct_id) DO UPDATE SET brief_title=EXCLUDED.brief_title,overall_status=EXCLUDED.overall_status,phases=EXCLUDED.phases,
           conditions=EXCLUDED.conditions,interventions=EXCLUDED.interventions,sponsor=EXCLUDED.sponsor,enrollment=EXCLUDED.enrollment,
           start_date=EXCLUDED.start_date,completion_date=EXCLUDED.completion_date,source_payload=EXCLUDED.source_payload,retrieved_at=now()
         RETURNING id`,
        [trial.nctId, trial.briefTitle, trial.overallStatus, JSON.stringify(trial.phases), JSON.stringify(trial.conditions),
          JSON.stringify(trial.interventions), trial.sponsor, trial.enrollment, trial.startDate, trial.completionDate, trial.sourceUrl, JSON.stringify(trial.raw)]
      );
      await pool.query(`INSERT INTO scientific_evidence_trials(protein_id,compound_id,trial_id,relevance_note)
                        VALUES($1,$2,$3,'Matched by target and compound terms; trial context is not proof of efficacy.') ON CONFLICT DO NOTHING`,
        [protein.id, compound.id, inserted.rows[0].id]);
      storedTrials += 1;
    }
    await recordEvent(pool, req, 'evidence_pair', `${protein.id}:${compound.id}`, 'external_evidence_enriched',
      { chemblActivities: chembl.activities?.length || 0, publications: storedPublications, trials: storedTrials,
        warnings: settled.filter((item) => item.status === 'rejected').map((item) => item.reason.message) });
    res.json({ chembl: { target: chembl.target, molecule: chembl.molecule, activities: chembl.activities || [], warning: chembl.warning },
      publications, trials, stored: { activities: chembl.activities?.length || 0, publications: storedPublications, trials: storedTrials },
      sourceNotice: 'Term-matched literature and trials require human relevance review; registry presence is not evidence of efficacy.' });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

router.get('/evidence/library', async (req, res, next) => {
  try {
    const pool = req.app.get('db'); const proteinId = req.query.proteinId; const compoundId = req.query.compoundId;
    const [publications, trials] = await Promise.all([
      pool.query(`SELECT p.*,ep.relevance_note FROM scientific_publications p JOIN scientific_evidence_publications ep ON ep.publication_id=p.id
                  WHERE ep.protein_id=$1 AND ep.compound_id=$2 ORDER BY p.citation_count DESC NULLS LAST,p.publication_year DESC LIMIT 50`, [proteinId, compoundId]),
      pool.query(`SELECT t.*,et.relevance_note FROM scientific_clinical_trials t JOIN scientific_evidence_trials et ON et.trial_id=t.id
                  WHERE et.protein_id=$1 AND et.compound_id=$2 ORDER BY t.retrieved_at DESC LIMIT 50`, [proteinId, compoundId]),
    ]);
    res.json({ publications: publications.rows, trials: trials.rows });
  } catch (error) { next(error); }
});

router.post('/search/chemistry', async (req, res) => {
  try {
    const pool = req.app.get('db');
    const compoundResult = await pool.query('SELECT * FROM scientific_compounds WHERE id=$1', [req.body.compoundId]);
    const compound = compoundResult.rows[0];
    if (!compound) return res.status(422).json({ error: 'Select a valid compound.' });
    const mode = req.body.mode === 'substructure' ? 'substructure' : 'similarity';
    const capability = await pool.query("SELECT enabled FROM scientific_capabilities WHERE capability='rdkit'");
    if (capability.rows[0]?.enabled && compound.canonical_smiles) {
      let result;
      if (mode === 'similarity') {
        result = await pool.query(
          `WITH q AS (SELECT mol_from_smiles($1::cstring) molecule)
           SELECT c.id,c.pubchem_cid,c.preferred_name,c.canonical_smiles,c.molecular_formula,c.molecular_weight,
                  tanimoto_sml(morganbv_fp(m.molecule),morganbv_fp(q.molecule)) similarity
           FROM scientific_rdkit_molecules m JOIN scientific_compounds c ON c.id=m.compound_id CROSS JOIN q
           ORDER BY tanimoto_sml(morganbv_fp(m.molecule),morganbv_fp(q.molecule)) DESC LIMIT 25`, [compound.canonical_smiles]);
      } else {
        result = await pool.query(
          `WITH q AS (SELECT mol_from_smiles($1::cstring) molecule)
           SELECT c.id,c.pubchem_cid,c.preferred_name,c.canonical_smiles,c.molecular_formula,c.molecular_weight,1.0 similarity
           FROM scientific_rdkit_molecules m JOIN scientific_compounds c ON c.id=m.compound_id CROSS JOIN q
           WHERE m.molecule @> q.molecule LIMIT 25`, [compound.canonical_smiles]);
      }
      return res.json({ method: `RDKit ${mode}`, native: true, query: compound, results: result.rows,
        interpretation: mode === 'similarity' ? 'Tanimoto similarity over RDKit fingerprints.' : 'Exact graph substructure containment using the RDKit cartridge.' });
    }
    if (!compound.pubchem_cid && !compound.canonical_smiles) return res.status(422).json({ error: 'A PubChem CID or standardized SMILES is required.' });
    const namespace = compound.pubchem_cid ? `cid/${compound.pubchem_cid}` : `smiles/${encodeURIComponent(compound.canonical_smiles)}`;
    const operation = mode === 'similarity' ? 'fastsimilarity_2d' : 'fastsubstructure';
    const identifiers = await require('../services/scientificSources').fetchJson(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/${operation}/${namespace}/cids/JSON?MaxRecords=25${mode === 'similarity' ? '&Threshold=85' : ''}`);
    const cids = (identifiers.IdentifierList?.CID || []).slice(0, 25);
    const properties = cids.length ? await require('../services/scientificSources').fetchJson(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cids.join(',')}/property/Title,MolecularFormula,MolecularWeight,ConnectivitySMILES,InChIKey/JSON`) : { PropertyTable: { Properties: [] } };
    res.json({ method: `PubChem ${mode}`, native: false, query: compound, results: properties.PropertyTable?.Properties || [],
      interpretation: 'External search fallback. Install/use the scientific PostgreSQL service for native tenant-local chemical search.' });
  } catch (error) { res.status(422).json({ error: error.message }); }
});

router.post('/search/proteins', async (req, res) => {
  try {
    const source = String(req.body.sequence || '').replace(/\s/g, '').toUpperCase();
    if (!/^[ACDEFGHIKLMNPQRSTVWYBXZJUO]{20,10000}$/.test(source)) return res.status(422).json({ error: 'A valid 20–10,000 residue sequence is required.' });
    const records = await req.app.get('db').query('SELECT id,uniprot_id,protein_name,gene_symbol,sequence FROM scientific_proteins WHERE sequence IS NOT NULL');
    const kmers = (sequence, size = 3) => { const output = new Set(); for (let i = 0; i <= sequence.length - size; i += 1) output.add(sequence.slice(i, i + size)); return output; };
    const querySet = kmers(source);
    const results = records.rows.map((record) => {
      const candidate = kmers(record.sequence); let overlap = 0; for (const item of querySet) if (candidate.has(item)) overlap += 1;
      return { id: record.id, uniprotId: record.uniprot_id, proteinName: record.protein_name, geneSymbol: record.gene_symbol,
        similarity: overlap / Math.max(1, querySet.size + candidate.size - overlap) };
    }).sort((a,b) => b.similarity-a.similarity).slice(0,25);
    res.json({ method: '3-mer Jaccard screening', results,
      limitation: 'This is a rapid local screening heuristic, not sequence identity, an alignment, or an evolutionary inference. Confirm with an approved alignment service or protein embedding model.' });
  } catch (error) { res.status(422).json({ error: error.message }); }
});

router.post('/predictions', async (req, res) => {
  const pool = req.app.get('db');
  const modelKey = String(req.body.modelKey || 'physchem-rules');
  try {
    const modelResult = await pool.query('SELECT * FROM scientific_model_versions WHERE key=$1 ORDER BY version DESC LIMIT 1', [modelKey]);
    if (!modelResult.rows.length) return res.status(404).json({ error: 'Unknown model.' });
    const model = modelResult.rows[0];
    const compoundResult = req.body.compoundId
      ? await pool.query('SELECT * FROM scientific_compounds WHERE id=$1', [req.body.compoundId]) : { rows: [] };
    const proteinResult = req.body.proteinId
      ? await pool.query('SELECT * FROM scientific_proteins WHERE id=$1', [req.body.proteinId]) : { rows: [] };
    const compound = compoundResult.rows[0]; const protein = proteinResult.rows[0];
    const inputSnapshot = { proteinId: protein?.id || null, compoundId: compound?.id || null, task: req.body.task || model.task };
    let status = 'blocked'; let result = null; let uncertainty = {}; let applicability = {};

    if (modelKey === 'physchem-rules') {
      if (!compound) return res.status(422).json({ error: 'Select a resolved compound for physicochemical assessment.' });
      result = physchemAssessment(compound); uncertainty = result.uncertainty; applicability = result.applicability; status = 'completed';
    } else if (modelKey === 'bioactivity-consensus') {
      if (!protein || !compound) return res.status(422).json({ error: 'Select a resolved protein and compound.' });
      const evidence = await pool.query(
        `SELECT (provenance->>'pchemblValue')::numeric pchembl_value,activity_type,source_record_id
         FROM scientific_bioactivities WHERE protein_id=$1 AND compound_id=$2
           AND provenance ? 'pchemblValue' AND provenance->>'pchemblValue' IS NOT NULL ORDER BY 1`, [protein.id, compound.id]);
      const values = evidence.rows.map((row) => Number(row.pchembl_value)).filter(Number.isFinite).sort((a,b) => a-b);
      const median = quantile(values, .5); const q1 = quantile(values, .25); const q3 = quantile(values, .75);
      result = { headline: values.length >= 3 ? 'Measured bioactivity consensus is available' : 'Insufficient comparable measurements',
        summary: values.length ? `The median stored pChEMBL value is ${median.toFixed(2)} across ${values.length} source records.` : 'No comparable pChEMBL measurements are stored for this pair.',
        classification: values.length >= 3 ? 'evidence-consensus' : 'insufficient-evidence',
        metrics: [{ label: 'Comparable records', value: values.length }, { label: 'Median pChEMBL', value: median },
          { label: 'Interquartile range', value: q1 == null ? null : `${q1.toFixed(2)}–${q3.toFixed(2)}` }],
        sections: [{ title: 'Interpretation boundary', detail: 'This summarizes stored measurements. It does not pool incompatible assay contexts, infer causality, or create a new potency measurement.' }],
        actions: values.length >= 3 ? ['Inspect assay contexts and constructs', 'Exclude incompatible endpoints before formal meta-analysis', 'Confirm with an orthogonal internal assay'] : ['Enrich ChEMBL evidence', 'Collect comparable replicated measurements'],
      };
      uncertainty = { type: 'measurement dispersion', recordCount: values.length, q1, q3, interquartileRange: q1 == null ? null : q3-q1,
        note: 'Dispersion does not capture all assay, construct, and laboratory heterogeneity.' };
      applicability = { inDomain: values.length >= 3, domain: model.applicability_domain }; status = 'completed';
    } else if (modelKey === 'protein-composition') {
      if (!protein?.sequence) return res.status(422).json({ error: 'Resolve the protein from UniProt or FASTA before generating a representation.' });
      const representation = proteinComposition(protein.sequence);
      result = { headline: 'Transparent protein representation generated',
        summary: `Generated a deterministic 21-component representation for a ${representation.sequenceLength}-residue sequence.`,
        classification: 'baseline-representation',
        metrics: representation.alphabet.map((symbol,index) => ({ label: `${symbol} fraction`, value: Number(representation.vector[index].toFixed(5)) })),
        sections: [{ title: 'Intended use', detail: 'Data-quality checks and a reproducible baseline. This is not ESM C, sequence identity, an alignment, or a functional prediction.' }],
        actions: ['Use an approved ESM C runner for learned embeddings', 'Validate similar-protein results with alignment and domain expertise'],
      };
      try {
        await pool.query(`INSERT INTO scientific_embeddings(entity_type,entity_id,model_key,model_version,embedding,metadata)
          VALUES('protein',$1,$2,$3,$4::vector,$5::jsonb)
          ON CONFLICT(entity_type,entity_id,model_key,model_version) DO UPDATE SET embedding=EXCLUDED.embedding,metadata=EXCLUDED.metadata,created_at=now()`,
          [String(protein.id), model.key, model.version, `[${representation.vector.join(',')}]`, JSON.stringify({ sequenceLength: representation.sequenceLength, standardResidueCoverage: representation.standardResidueCoverage })]);
      } catch (_) { /* pgvector capability is reported separately. */ }
      uncertainty = { type: 'representation coverage', standardResidueCoverage: representation.standardResidueCoverage,
        note: 'Composition discards residue order, domains, structure, and evolutionary context.' };
      applicability = { inDomain: representation.standardResidueCoverage > .99, domain: model.applicability_domain }; status = 'completed';
    } else if (modelKey === 'openrouter-synthesis') {
      if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: 'OpenRouter is not configured on the server.' });
      const evidence = { protein: protein && { accession: protein.uniprot_id, name: protein.protein_name, function: protein.function_description },
        compound: compound && { cid: compound.pubchem_cid, name: compound.preferred_name, formula: compound.molecular_formula, molecularWeight: compound.molecular_weight },
        instruction: String(req.body.instruction || 'Synthesize the evidence gaps and next validation steps.') };
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', headers: {
        'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:3000', 'X-Title': 'AIAcceleratedrug Scientific Workbench',
      }, body: JSON.stringify({ model: process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet', temperature: 0.1, max_tokens: 900,
        messages: [{ role: 'system', content: 'You are a scientific evidence-review assistant. Never invent experimental results. Return strict JSON with keys headline, executiveSummary, evidenceGaps (array), limitations (array), nextExperiments (array), and decisionNote. State that predictions require laboratory validation.' },
          { role: 'user', content: JSON.stringify(evidence) }], response_format: { type: 'json_object' } }) });
      const payload = await response.json();
      if (!response.ok || payload.error) throw new Error(payload.error?.message || `OpenRouter returned ${response.status}`);
      const text = payload.choices?.[0]?.message?.content || '{}';
      try { result = parseProviderJson(text); } catch (_) {
        result = { headline: 'Evidence synthesis completed', executiveSummary: text, evidenceGaps: [], limitations: ['Provider response was not structured JSON.'], nextExperiments: [], decisionNote: 'Human scientific review required.' };
      }
      uncertainty = { type: 'narrative model output', note: 'Language-model synthesis is not a calibrated physical or biological prediction.' };
      applicability = { inDomain: true, domain: 'Evidence organization and gap analysis only.' }; status = 'completed';
    } else if (process.env.MODEL_RUNNER_URL && model.readiness !== 'not_configured') {
      const response = await fetch(`${process.env.MODEL_RUNNER_URL.replace(/\/$/, '')}/predict`, { method: 'POST', headers: {
        'Content-Type': 'application/json', ...(process.env.MODEL_RUNNER_TOKEN ? { Authorization: `Bearer ${process.env.MODEL_RUNNER_TOKEN}` } : {}),
      }, body: JSON.stringify({ model: { key: model.key, version: model.version }, protein, compound, task: inputSnapshot.task }) });
      if (!response.ok) throw new Error(`Model runner returned ${response.status}`);
      result = await response.json(); uncertainty = result.uncertainty || {}; applicability = result.applicability || {}; status = 'completed';
    } else {
      result = { headline: `${model.display_name} runner is not configured`, requirements: ['Provision the upstream model and weights under its license.', 'Expose the approved model-runner API.', 'Set MODEL_RUNNER_URL and validate with a benchmark dataset.'],
        scientificStatus: 'No prediction was generated.' };
      uncertainty = { note: 'Unavailable because no model ran.' }; applicability = { inDomain: null, domain: model.applicability_domain };
    }

    const job = await pool.query(
      `INSERT INTO scientific_prediction_jobs(tenant_id,user_id,protein_id,compound_id,model_key,model_version,task,status,input_snapshot,result,uncertainty,applicability,provenance,completed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13::jsonb,CASE WHEN $8='completed' THEN now() ELSE NULL END) RETURNING *`,
      [tenant(req), req.user.id, protein?.id || null, compound?.id || null, model.key, model.version, inputSnapshot.task, status,
       JSON.stringify(inputSnapshot), JSON.stringify(result), JSON.stringify(uncertainty), JSON.stringify(applicability),
       JSON.stringify({ modelVersion: model.version, datasetVersion: model.dataset_version, provider: model.provider, generatedAt: new Date().toISOString() })]
    );
    await recordEvent(pool, req, 'prediction_job', job.rows[0].id, status, { task: inputSnapshot.task }, { modelKey: model.key });
    res.status(status === 'blocked' ? 202 : 200).json({ job: job.rows[0], model,
      researchUseNotice: 'Research prioritization only. Validate all findings experimentally and clinically.' });
  } catch (error) { res.status(502).json({ error: error.message }); }
});

router.get('/predictions', async (req, res, next) => {
  try {
    const result = await req.app.get('db').query(
      `SELECT j.*,m.display_name,m.provider,m.dataset_version,m.applicability_domain,m.validation_metrics,m.uncertainty_method
       FROM scientific_prediction_jobs j JOIN scientific_model_versions m ON m.key=j.model_key AND m.version=j.model_version
       WHERE j.tenant_id=$1 ORDER BY j.created_at DESC LIMIT 50`, [tenant(req)]);
    res.json({ data: result.rows });
  } catch (error) { next(error); }
});

router.post('/candidates', async (req, res, next) => {
  try {
    if (!req.body.proteinId || !req.body.compoundId) return res.status(422).json({ error: 'Protein and compound are required.' });
    const pool = req.app.get('db');
    const result = await pool.query(
      `INSERT INTO discovery_candidates(tenant_id,name,protein_id,compound_id,stage,priority,owner,rationale,evidence_snapshot,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
      [tenant(req), String(req.body.name || 'Research candidate').slice(0, 200), req.body.proteinId, req.body.compoundId,
       req.body.stage || 'triage', req.body.priority || 'medium', req.body.owner || req.user.name,
       String(req.body.rationale || '').slice(0, 4000), JSON.stringify(req.body.evidenceSnapshot || {}), req.user.id]);
    await recordEvent(pool, req, 'candidate', result.rows[0].id, 'created', { priority: result.rows[0].priority });
    res.status(201).json({ candidate: result.rows[0] });
  } catch (error) { next(error); }
});

router.get('/operations', async (req, res, next) => {
  try {
    const pool = req.app.get('db'); await ensureTenantWorkspace(pool, req);
    const [projects, assays, experiments, reviews] = await Promise.all([
      pool.query(`SELECT p.*,sp.protein_name,sc.preferred_name lead_compound_name FROM discovery_science_projects p
                  LEFT JOIN scientific_proteins sp ON sp.id=p.protein_id LEFT JOIN scientific_compounds sc ON sc.id=p.lead_compound_id
                  WHERE p.tenant_id=$1 ORDER BY p.updated_at DESC`, [tenant(req)]),
      pool.query(`SELECT a.*,sp.protein_name,sc.preferred_name FROM scientific_assay_records a
                  LEFT JOIN scientific_proteins sp ON sp.id=a.protein_id LEFT JOIN scientific_compounds sc ON sc.id=a.compound_id
                  WHERE a.tenant_id=$1 ORDER BY a.scheduled_at NULLS LAST,a.created_at`, [tenant(req)]),
      pool.query('SELECT * FROM scientific_experiment_plans WHERE tenant_id=$1 ORDER BY due_date NULLS LAST,created_at', [tenant(req)]),
      pool.query(`SELECT r.*,j.model_key,j.model_version,j.task FROM scientific_prediction_reviews r
                  JOIN scientific_prediction_jobs j ON j.id=r.prediction_job_id WHERE r.tenant_id=$1 ORDER BY r.reviewed_at DESC`, [tenant(req)]),
    ]);
    res.json({ projects: projects.rows, assays: assays.rows, experiments: experiments.rows, reviews: reviews.rows });
  } catch (error) { next(error); }
});

router.post('/projects', async (req, res, next) => {
  try {
    if (!req.body.name || !req.body.hypothesis) return res.status(422).json({ error: 'Project name and hypothesis are required.' });
    const result = await req.app.get('db').query(
      `INSERT INTO discovery_science_projects(tenant_id,name,therapeutic_area,hypothesis,status,owner,protein_id,lead_compound_id,decision_criteria,next_milestone,created_by)
       VALUES($1,$2,$3,$4,'planning',$5,$6,$7,$8::jsonb,$9,$10) RETURNING *`,
      [tenant(req), String(req.body.name).slice(0,200), req.body.therapeuticArea || null, String(req.body.hypothesis).slice(0,4000),
        req.body.owner || req.user.name, req.body.proteinId || null, req.body.compoundId || null,
        JSON.stringify(req.body.decisionCriteria || []), req.body.nextMilestone || null, req.user.id]);
    res.status(201).json({ project: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/assays', async (req, res, next) => {
  try {
    if (!req.body.assayName || !req.body.endpoint || !req.body.protocolSummary) return res.status(422).json({ error: 'Assay name, endpoint, and protocol are required.' });
    const result = await req.app.get('db').query(
      `INSERT INTO scientific_assay_records(tenant_id,project_id,protein_id,compound_id,assay_name,assay_type,endpoint,protocol_summary,status,quality_control,scheduled_at,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,'planned',$9::jsonb,$10,$11) RETURNING *`,
      [tenant(req), req.body.projectId || null, req.body.proteinId || null, req.body.compoundId || null,
        String(req.body.assayName).slice(0,200), req.body.assayType || 'custom', String(req.body.endpoint).slice(0,200),
        String(req.body.protocolSummary).slice(0,6000), JSON.stringify(req.body.qualityControl || {}), req.body.scheduledAt || null, req.user.id]);
    res.status(201).json({ assay: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/experiments', async (req, res, next) => {
  try {
    if (!req.body.title || !req.body.hypothesis || !req.body.objective || !req.body.protocolSummary) return res.status(422).json({ error: 'Title, hypothesis, objective, and protocol are required.' });
    const result = await req.app.get('db').query(
      `INSERT INTO scientific_experiment_plans(tenant_id,project_id,candidate_id,title,hypothesis,objective,protocol_summary,acceptance_criteria,status,owner,due_date,linked_prediction_jobs,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,'draft',$9,$10,$11::jsonb,$12) RETURNING *`,
      [tenant(req), req.body.projectId || null, req.body.candidateId || null, String(req.body.title).slice(0,200),
        String(req.body.hypothesis).slice(0,4000), String(req.body.objective).slice(0,4000), String(req.body.protocolSummary).slice(0,8000),
        JSON.stringify(req.body.acceptanceCriteria || []), req.body.owner || req.user.name, req.body.dueDate || null,
        JSON.stringify(req.body.linkedPredictionJobs || []), req.user.id]);
    res.status(201).json({ experiment: result.rows[0] });
  } catch (error) { next(error); }
});

router.patch('/operations/:kind/:id/status', async (req, res, next) => {
  const config = {
    projects: { table: 'discovery_science_projects', allowed: ['planning','active','on_hold','completed','archived'] },
    assays: { table: 'scientific_assay_records', allowed: ['planned','scheduled','running','completed','failed','cancelled'] },
    experiments: { table: 'scientific_experiment_plans', allowed: ['draft','approved','running','completed','failed','cancelled'] },
  }[req.params.kind];
  if (!config || !config.allowed.includes(req.body.status)) return res.status(422).json({ error: 'Invalid operation kind or status.' });
  try {
    const result = await req.app.get('db').query(
      `UPDATE ${config.table} SET status=$1${req.params.kind === 'projects' || req.params.kind === 'experiments' ? ',updated_at=now()' : ''}
       WHERE id=$2 AND tenant_id=$3 RETURNING *`, [req.body.status, req.params.id, tenant(req)]);
    if (!result.rows.length) return res.status(404).json({ error: 'Operation record not found.' });
    res.json({ record: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/predictions/:id/reviews', async (req, res, next) => {
  try {
    const allowed = ['accept_for_prioritization','revise','reject','needs_evidence'];
    if (!allowed.includes(req.body.decision) || !String(req.body.rationale || '').trim()) return res.status(422).json({ error: 'A valid decision and rationale are required.' });
    const job = await req.app.get('db').query('SELECT id FROM scientific_prediction_jobs WHERE id=$1 AND tenant_id=$2', [req.params.id, tenant(req)]);
    if (!job.rows.length) return res.status(404).json({ error: 'Prediction job not found.' });
    const result = await req.app.get('db').query(
      `INSERT INTO scientific_prediction_reviews(tenant_id,prediction_job_id,decision,rationale,reviewer_user_id)
       VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [tenant(req), req.params.id, req.body.decision, String(req.body.rationale).slice(0,6000), req.user.id]);
    res.status(201).json({ review: result.rows[0] });
  } catch (error) { next(error); }
});

router.get('/provenance', async (req, res, next) => {
  try {
    const result = await req.app.get('db').query('SELECT * FROM scientific_provenance_events WHERE tenant_id=$1 ORDER BY occurred_at DESC LIMIT 100', [tenant(req)]);
    res.json({ data: result.rows });
  } catch (error) { next(error); }
});

module.exports = router;
module.exports.physchemAssessment = physchemAssessment;
module.exports.proteinComposition = proteinComposition;
module.exports.parseProviderJson = parseProviderJson;
