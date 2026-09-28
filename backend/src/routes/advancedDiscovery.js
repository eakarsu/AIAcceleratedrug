const express = require('express');
const fetch = require('node-fetch');
const PDFDocument = require('pdfkit');
const { authenticateToken } = require('../middleware/auth');
const { enqueueScientificJob, cancelJob } = require('../services/scientificJobQueue');

const router = express.Router();
router.use(authenticateToken);

const WORKFLOW_MODELS = {
  protein_embedding: 'esmc',
  qsar: 'chemprop',
  admet: 'admet-ai',
  complex_prediction: 'boltz-2',
  docking: 'diffdock',
  molecule_generation: 'reinvent4',
  synthesis_planning: 'aizynthfinder',
};

const WORKFLOW_LABELS = {
  protein_embedding: 'Protein embedding',
  qsar: 'Target-specific QSAR',
  admet: 'ADMET and toxicity',
  complex_prediction: 'Protein–drug complex',
  docking: 'Docking pose',
  molecule_generation: 'Constrained molecule generation',
  synthesis_planning: 'Retrosynthesis planning',
};

function tenant(req) {
  return String(req.user.tenantId || `user-${req.user.id}`);
}

function externalRunner(modelKey) {
  const suffix=String(modelKey || '').toUpperCase().replace(/[^A-Z0-9]+/g,'_');
  // Predictive/generative adapters require their own accepted endpoint. The
  // transparent reference runner must never make an unrelated model appear ready.
  const url=process.env[`MODEL_RUNNER_${suffix}_URL`] || '';
  const token=process.env[`MODEL_RUNNER_${suffix}_TOKEN`] || process.env.MODEL_RUNNER_TOKEN || '';
  return {url:url.replace(/\/$/,''),token};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function descriptorReadiness(compound, evidenceCount = 0) {
  const descriptorValues = [compound.molecular_weight, compound.xlogp, compound.tpsa,
    compound.hbond_donors, compound.hbond_acceptors, compound.rotatable_bonds];
  const descriptorCompleteness = descriptorValues.filter((value) => finite(value) != null).length / descriptorValues.length;
  const checks = [
    finite(compound.molecular_weight) == null ? null : finite(compound.molecular_weight) <= 500,
    finite(compound.xlogp) == null ? null : finite(compound.xlogp) <= 5,
    finite(compound.hbond_donors) == null ? null : finite(compound.hbond_donors) <= 5,
    finite(compound.hbond_acceptors) == null ? null : finite(compound.hbond_acceptors) <= 10,
  ].filter((value) => value != null);
  const ruleCompatibility = checks.length ? checks.filter(Boolean).length / checks.length : 0;
  const evidenceCoverage = Math.min(Number(evidenceCount || 0) / 5, 1);
  const score = 100 * (descriptorCompleteness * 0.45 + ruleCompatibility * 0.35 + evidenceCoverage * 0.20);
  return {
    score: Number(score.toFixed(2)), descriptorCompleteness: Number(descriptorCompleteness.toFixed(3)),
    ruleCompatibility: Number(ruleCompatibility.toFixed(3)), evidenceCoverage: Number(evidenceCoverage.toFixed(3)),
    lipinskiViolations: checks.filter((value) => !value).length,
  };
}

function paretoFrontier(entries) {
  const dominates = (left, right) => {
    const atLeastAsGood = left.evidenceCount >= right.evidenceCount
      && left.readiness.descriptorCompleteness >= right.readiness.descriptorCompleteness
      && left.readiness.lipinskiViolations <= right.readiness.lipinskiViolations;
    const strictlyBetter = left.evidenceCount > right.evidenceCount
      || left.readiness.descriptorCompleteness > right.readiness.descriptorCompleteness
      || left.readiness.lipinskiViolations < right.readiness.lipinskiViolations;
    return atLeastAsGood && strictlyBetter;
  };
  return entries.filter((candidate) => !entries.some((other) => other !== candidate && dominates(other, candidate)));
}

async function seedAdvancedWorkspace(pool, req) {
  const seedDatasets = [
    ['ChEMBL EGFR evidence snapshot','2026-demo-1','bioactivity','public','https://www.ebi.ac.uk/chembl/','ChEMBL terms apply',65,
      { strategy: 'source-preserving demonstration index' }, { provenanceComplete: true, intendedUse: 'workflow demonstration' }],
    ['Curated compound descriptor catalog','2026-demo-1','compound','internal',null,'Internal demonstration data',15,
      { strategy: 'not a training split' }, { descriptorCoverageTarget: 0.9, intendedUse: 'deterministic triage' }],
    ['Protein structure evidence register','2026-demo-1','structure','public','https://www.rcsb.org/','RCSB PDB and source terms apply',15,
      { strategy: 'not a training split' }, { labels: ['experimental','alphafold_prediction'], intendedUse: 'visual evidence review' }],
  ];
  for (const dataset of seedDatasets) {
    await pool.query(
      `INSERT INTO scientific_datasets(tenant_id,name,version,modality,source_type,source_url,license_note,row_count,split_strategy,quality_summary,status,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'ready',$11)
       ON CONFLICT(tenant_id,name,version) DO NOTHING`,
      [tenant(req), ...dataset.slice(0,7), JSON.stringify(dataset[7]), JSON.stringify(dataset[8]), req.user.id]
    );
  }
  const validationCount = await pool.query('SELECT count(*)::int count FROM scientific_model_validations WHERE tenant_id=$1', [tenant(req)]);
  if (validationCount.rows[0].count === 0) {
    const dataset = await pool.query("SELECT id FROM scientific_datasets WHERE tenant_id=$1 AND modality='compound' LIMIT 1", [tenant(req)]);
    await pool.query(
      `INSERT INTO scientific_model_validations(tenant_id,model_key,model_version,dataset_id,validation_type,metrics,calibration,acceptance_thresholds,status,notes,reviewed_by,reviewed_at,created_by)
       VALUES($1,'physchem-rules','1.0.0',$2,'external',$3::jsonb,$4::jsonb,$5::jsonb,'passed',$6,$7,now(),$7)`,
      [tenant(req), dataset.rows[0]?.id || null,
        JSON.stringify({ deterministicRepeatability: 1, descriptorMappingChecks: 6, descriptorMappingChecksPassed: 6 }),
        JSON.stringify({ calibratedPrediction: false, reason: 'This model applies explicit rules and does not estimate a probability.' }),
        JSON.stringify({ deterministicRepeatability: 1, descriptorMappingChecksPassed: 6 }),
        'Software acceptance only. This is not a biological predictive-performance claim.', req.user.id]
    );
  }
  const vinaValidation=await pool.query("SELECT 1 FROM scientific_model_validations WHERE tenant_id=$1 AND model_key='vina' AND model_version='1.2.7' LIMIT 1",[tenant(req)]);
  if (!vinaValidation.rows.length) {
    const dataset=await pool.query("SELECT id FROM scientific_datasets WHERE tenant_id=$1 AND modality='structure' ORDER BY created_at LIMIT 1",[tenant(req)]);
    await pool.query(`INSERT INTO scientific_model_validations(tenant_id,model_key,model_version,dataset_id,validation_type,metrics,calibration,acceptance_thresholds,status,notes,reviewed_by,reviewed_at,created_by)
      VALUES($1,'vina','1.2.7',$2,'retrospective',$3::jsonb,$4::jsonb,$5::jsonb,'passed',$6,$7,now(),$7)`,[tenant(req),dataset.rows[0]?.id || null,
      JSON.stringify({structure:'4WKQ',ligand:'IRE / gefitinib',bestPoseHeavyAtomRmsdAngstrom:1.315,poseCount:9,bestScoreKcalMol:-8.372}),
      JSON.stringify({calibratedAffinity:false,reason:'Vina score is not calibrated as binding affinity.'}),JSON.stringify({bestPoseHeavyAtomRmsdAngstrom:{maximum:2.0}}),
      'Passed a co-crystal redocking geometry check. This is not prospective validation, affinity validation, or evidence of biological activity.',req.user.id]);
  }

  const selected = await pool.query(`SELECT
    (SELECT id FROM scientific_proteins WHERE uniprot_id='P00533' LIMIT 1) protein_id,
    (SELECT id FROM scientific_compounds WHERE pubchem_cid=123631 LIMIT 1) compound_id`);
  const proteinId=selected.rows[0]?.protein_id; const compoundId=selected.rows[0]?.compound_id;
  if (!proteinId || !compoundId) return;

  const campaignCount=await pool.query('SELECT count(*)::int count FROM scientific_screening_campaigns WHERE tenant_id=$1',[tenant(req)]);
  if (campaignCount.rows[0].count === 0) {
    const compounds=await pool.query(
      `SELECT c.*,count(b.id)::int evidence_count FROM scientific_compounds c
       LEFT JOIN scientific_bioactivities b ON b.compound_id=c.id AND b.protein_id=$1
       GROUP BY c.id ORDER BY c.preferred_name LIMIT 500`,[proteinId]);
    const ranked=compounds.rows.map((compound)=>({compound,evidenceCount:compound.evidence_count,
      readiness:descriptorReadiness(compound,compound.evidence_count)}))
      .sort((left,right)=>right.readiness.score-left.readiness.score || right.evidenceCount-left.evidenceCount);
    const campaign=await pool.query(
      `INSERT INTO scientific_screening_campaigns(tenant_id,name,protein_id,method,status,input_snapshot,thresholds,candidate_count,hit_count,limitation,created_by,completed_at)
       VALUES($1,'EGFR evidence-readiness demonstration',$2,'evidence_readiness','completed',$3::jsonb,'{"minimumReadinessScore":65}'::jsonb,$4,$5,$6,$7,now()) RETURNING id`,
      [tenant(req),proteinId,JSON.stringify({proteinId,compoundCount:ranked.length,seededDemonstration:true}),ranked.length,
        ranked.filter((item)=>item.readiness.score>=65).length,
        'Seeded workflow demonstration. Ranks evidence and descriptor readiness only; it does not predict binding, efficacy, toxicity, or clinical success.',req.user.id]);
    for (let index=0;index<ranked.length;index+=1) {
      const item=ranked[index];
      await pool.query(`INSERT INTO scientific_screening_results(campaign_id,compound_id,rank,score,score_components,evidence_count,applicability)
        VALUES($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)`,[campaign.rows[0].id,item.compound.id,index+1,item.readiness.score,
        JSON.stringify(item.readiness),item.evidenceCount,JSON.stringify({inDomain:item.readiness.descriptorCompleteness>=.8,domain:'Small-molecule evidence-readiness triage'})]);
    }
  }

  const optimizationCount=await pool.query('SELECT count(*)::int count FROM scientific_optimization_campaigns WHERE tenant_id=$1',[tenant(req)]);
  if (optimizationCount.rows[0].count === 0) {
    const compounds=await pool.query(`SELECT c.*,count(b.id)::int evidence_count FROM scientific_compounds c
      LEFT JOIN scientific_bioactivities b ON b.compound_id=c.id AND b.protein_id=$1 GROUP BY c.id ORDER BY c.preferred_name`,[proteinId]);
    const entries=compounds.rows.map((compound)=>({id:compound.id,name:compound.preferred_name,evidenceCount:compound.evidence_count,
      molecularWeight:finite(compound.molecular_weight),xlogp:finite(compound.xlogp),tpsa:finite(compound.tpsa),
      readiness:descriptorReadiness(compound,compound.evidence_count)}));
    const frontier=paretoFrontier(entries).sort((left,right)=>right.readiness.score-left.readiness.score);
    await pool.query(`INSERT INTO scientific_optimization_campaigns(tenant_id,name,protein_id,objectives,constraints,input_compound_ids,frontier,status,limitation,created_by,completed_at)
      VALUES($1,'EGFR transparent Pareto demonstration',$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,'completed',$7,$8,now())`,
      [tenant(req),proteinId,JSON.stringify([{key:'evidenceCount',direction:'maximize'},{key:'descriptorCompleteness',direction:'maximize'},{key:'lipinskiViolations',direction:'minimize'}]),
        JSON.stringify({intendedUse:'workflow demonstration'}),JSON.stringify(entries.map((item)=>item.id)),JSON.stringify(frontier),
        'Seeded workflow demonstration over recorded evidence and descriptors; no potency, selectivity, ADMET, or clinical prediction was generated.',req.user.id]);
  }

  for (const [workflowType,modelKey] of Object.entries(WORKFLOW_MODELS)) {
    const exists=await pool.query('SELECT 1 FROM scientific_workflow_jobs WHERE tenant_id=$1 AND workflow_type=$2 LIMIT 1',[tenant(req),workflowType]);
    if (exists.rows.length) continue;
    const model=await pool.query(`SELECT * FROM scientific_model_versions WHERE key=$1
      ORDER BY CASE readiness WHEN 'ready' THEN 0 WHEN 'adapter_ready' THEN 1 ELSE 2 END, version DESC LIMIT 1`,[modelKey]);
    if (!model.rows.length) continue;
    await pool.query(`INSERT INTO scientific_workflow_jobs(tenant_id,workflow_type,protein_id,compound_id,model_key,model_version,status,input_snapshot,output,uncertainty,applicability,requirements,created_by)
      VALUES($1,$2,$3,$4,$5,$6,'blocked',$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12)`,
      [tenant(req),workflowType,proteinId,compoundId,modelKey,model.rows[0].version,
        JSON.stringify({proteinId,compoundId,seededDemonstration:true}),JSON.stringify({headline:`${model.rows[0].display_name} deployment required`,
          explanation:'Demonstration execution contract only.',scientificStatus:'No prediction was generated.'}),
        JSON.stringify({note:'Unavailable because no validated model executed.'}),JSON.stringify({inDomain:null,domain:model.rows[0].applicability_domain}),
        JSON.stringify([`Install and pin ${model.rows[0].display_name} with licensed weights.`,'Attach benchmark and calibration evidence.','Pass the isolated runner acceptance suite.']),req.user.id]);
  }
}

async function advancedSnapshot(pool, req) {
  await seedAdvancedWorkspace(pool, req);
  const [proteins, compounds, models, structures, datasets, screenings, screeningResults, optimizations, jobs, validations, reviews] = await Promise.all([
    pool.query('SELECT id,uniprot_id,protein_name,gene_symbol,organism FROM scientific_proteins ORDER BY protein_name LIMIT 50'),
    pool.query('SELECT id,pubchem_cid,preferred_name,canonical_smiles,molecular_formula,molecular_weight,xlogp,tpsa,hbond_donors,hbond_acceptors,rotatable_bonds FROM scientific_compounds ORDER BY preferred_name LIMIT 100'),
    pool.query(`SELECT DISTINCT ON (key) * FROM scientific_model_versions
                ORDER BY key,CASE readiness WHEN 'ready' THEN 0 WHEN 'adapter_ready' THEN 1 ELSE 2 END,version DESC`),
    pool.query(`SELECT s.id,s.protein_id,s.structure_kind,s.external_id,s.format,s.uri,s.confidence,s.provenance,s.retrieved_at,
                p.protein_name FROM scientific_structures s JOIN scientific_proteins p ON p.id=s.protein_id
                WHERE s.structure_kind='experimental' ORDER BY p.protein_name,s.external_id LIMIT 100`),
    pool.query('SELECT * FROM scientific_datasets WHERE tenant_id=$1 ORDER BY created_at DESC', [tenant(req)]),
    pool.query(`SELECT c.*,p.protein_name FROM scientific_screening_campaigns c LEFT JOIN scientific_proteins p ON p.id=c.protein_id
                WHERE c.tenant_id=$1 ORDER BY c.created_at DESC LIMIT 20`, [tenant(req)]),
    pool.query(`SELECT r.*,c.preferred_name,c.pubchem_cid FROM scientific_screening_results r
                JOIN scientific_screening_campaigns sc ON sc.id=r.campaign_id JOIN scientific_compounds c ON c.id=r.compound_id
                WHERE sc.tenant_id=$1 AND sc.id=(SELECT id FROM scientific_screening_campaigns WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1)
                ORDER BY r.rank LIMIT 100`, [tenant(req)]),
    pool.query('SELECT * FROM scientific_optimization_campaigns WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 20', [tenant(req)]),
    pool.query(`SELECT j.*,p.protein_name,c.preferred_name,m.display_name,m.readiness model_readiness,
                COALESCE((SELECT jsonb_agg(jsonb_build_object('eventType',e.event_type,'message',e.message,'details',e.details,'occurredAt',e.occurred_at) ORDER BY e.occurred_at)
                  FROM scientific_job_events e WHERE e.job_id=j.id),'[]'::jsonb) events
                FROM scientific_workflow_jobs j LEFT JOIN scientific_proteins p ON p.id=j.protein_id
                LEFT JOIN scientific_compounds c ON c.id=j.compound_id
                LEFT JOIN scientific_model_versions m ON m.key=j.model_key AND m.version=j.model_version
                WHERE j.tenant_id=$1 ORDER BY j.created_at DESC LIMIT 50`, [tenant(req)]),
    pool.query(`SELECT v.*,d.name dataset_name,m.display_name FROM scientific_model_validations v
                LEFT JOIN scientific_datasets d ON d.id=v.dataset_id
                LEFT JOIN scientific_model_versions m ON m.key=v.model_key AND m.version=v.model_version
                WHERE v.tenant_id=$1 ORDER BY v.created_at DESC`, [tenant(req)]),
    pool.query('SELECT * FROM scientific_workflow_reviews WHERE tenant_id=$1 ORDER BY reviewed_at DESC LIMIT 50', [tenant(req)]),
  ]);
  return { proteins: proteins.rows, compounds: compounds.rows, models: models.rows, structures: structures.rows, datasets: datasets.rows,
    screenings: screenings.rows, screeningResults: screeningResults.rows, optimizations: optimizations.rows,
    jobs: jobs.rows, validations: validations.rows, reviews: reviews.rows,
    boundaries: {
      executableNow: ['AutoDock Vina 1.2.7 docking','ADMET-AI 2.0.1 endpoint panel','REINVENT4 4.8.24 molecule generation','AiZynthFinder 4.4.1 retrosynthesis','Evidence-readiness batch screening','Descriptor Pareto optimization','RDKit chemical search','Protein composition baseline','Measured bioactivity consensus'],
      externalRunners: Object.entries(WORKFLOW_MODELS).map(([workflowType,modelKey]) => ({ workflowType, label: WORKFLOW_LABELS[workflowType], modelKey })),
      notice: 'Scores are labeled by method. Blocked external-model jobs contain no prediction. All outputs require scientific review and experimental validation.',
    } };
}

router.get('/bootstrap', async (req, res, next) => {
  try { res.json(await advancedSnapshot(req.app.get('db'), req)); } catch (error) { next(error); }
});

router.get('/runner-status', async (_req,res,next) => {
  try {
    const keys=['esmc','chemprop','boltz-2','diffdock'];
    const runners=await Promise.all(keys.map(async(modelKey)=>{
      const runner=externalRunner(modelKey);
      if (!runner.url) return {modelKey,configured:false,status:'not_configured'};
      try {
        const response=await fetch(`${runner.url}/health`,{headers:runner.token?{Authorization:`Bearer ${runner.token}`}:{},timeout:3000});
        const payload=await response.json().catch(()=>({}));
        return {modelKey,configured:true,status:response.ok?String(payload.status || 'reachable'):'unhealthy',
          contractVersion:payload.contractVersion || null,installedModels:Array.isArray(payload.installedModels)?payload.installedModels:[]};
      } catch(error) { return {modelKey,configured:true,status:'unreachable',error:String(error.message || error).slice(0,300)}; }
    }));
    res.json({runners,notice:'Configured and reachable does not mean scientifically accepted; model-version validation records remain authoritative.'});
  } catch(error){ next(error); }
});

router.post('/screenings', async (req, res, next) => {
  const pool = req.app.get('db');
  try {
    const protein = await pool.query('SELECT id,protein_name FROM scientific_proteins WHERE id=$1', [req.body.proteinId]);
    if (!protein.rows.length) return res.status(422).json({ error: 'Select a valid protein.' });
    const compounds = await pool.query(
      `SELECT c.*,count(b.id)::int evidence_count FROM scientific_compounds c
       LEFT JOIN scientific_bioactivities b ON b.compound_id=c.id AND b.protein_id=$1
       GROUP BY c.id ORDER BY c.preferred_name LIMIT 500`, [req.body.proteinId]);
    const ranked = compounds.rows.map((compound) => ({ compound, evidenceCount: compound.evidence_count,
      readiness: descriptorReadiness(compound, compound.evidence_count) }))
      .sort((left,right) => right.readiness.score-left.readiness.score || right.evidenceCount-left.evidenceCount);
    const threshold = Math.max(0, Math.min(100, finite(req.body.threshold) ?? 65));
    const campaign = await pool.query(
      `INSERT INTO scientific_screening_campaigns(tenant_id,name,protein_id,method,status,input_snapshot,thresholds,candidate_count,hit_count,limitation,created_by,completed_at)
       VALUES($1,$2,$3,'evidence_readiness','completed',$4::jsonb,$5::jsonb,$6,$7,$8,$9,now()) RETURNING *`,
      [tenant(req), String(req.body.name || `${protein.rows[0].protein_name} evidence-readiness screen`).slice(0,200), req.body.proteinId,
        JSON.stringify({ proteinId: req.body.proteinId, compoundCount: ranked.length }), JSON.stringify({ minimumReadinessScore: threshold }),
        ranked.length, ranked.filter((item) => item.readiness.score >= threshold).length,
        'Ranks evidence and descriptor readiness only. It does not predict binding, efficacy, toxicity, or clinical success.', req.user.id]);
    for (let index=0; index<ranked.length; index += 1) {
      const item = ranked[index];
      await pool.query(
        `INSERT INTO scientific_screening_results(campaign_id,compound_id,rank,score,score_components,evidence_count,applicability)
         VALUES($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb)`,
        [campaign.rows[0].id,item.compound.id,index+1,item.readiness.score,JSON.stringify(item.readiness),item.evidenceCount,
          JSON.stringify({ inDomain: item.readiness.descriptorCompleteness >= 0.8, domain: 'Small-molecule evidence-readiness triage' })]
      );
    }
    res.status(201).json({ campaign: campaign.rows[0], results: ranked.map((item,index) => ({ rank:index+1,
      compoundId:item.compound.id, preferredName:item.compound.preferred_name, score:item.readiness.score,
      evidenceCount:item.evidenceCount, components:item.readiness })) });
  } catch (error) { next(error); }
});

router.post('/optimizations', async (req, res, next) => {
  const pool = req.app.get('db');
  try {
    const compounds = await pool.query(
      `SELECT c.*,count(b.id)::int evidence_count FROM scientific_compounds c
       LEFT JOIN scientific_bioactivities b ON b.compound_id=c.id AND ($1::bigint IS NULL OR b.protein_id=$1)
       GROUP BY c.id ORDER BY c.preferred_name LIMIT 500`, [req.body.proteinId || null]);
    if (compounds.rows.length < 2) return res.status(422).json({ error: 'At least two compounds are required.' });
    const entries = compounds.rows.map((compound) => ({ id: compound.id, name: compound.preferred_name,
      evidenceCount: compound.evidence_count, molecularWeight: finite(compound.molecular_weight), xlogp: finite(compound.xlogp),
      tpsa: finite(compound.tpsa), readiness: descriptorReadiness(compound, compound.evidence_count) }));
    const frontier = paretoFrontier(entries).sort((left,right) => right.readiness.score-left.readiness.score);
    const objectives = [
      { key:'evidenceCount',direction:'maximize',label:'Target-linked measured evidence' },
      { key:'descriptorCompleteness',direction:'maximize',label:'Descriptor completeness' },
      { key:'lipinskiViolations',direction:'minimize',label:'Lipinski threshold violations' },
    ];
    const result = await pool.query(
      `INSERT INTO scientific_optimization_campaigns(tenant_id,name,protein_id,objectives,constraints,input_compound_ids,frontier,status,limitation,created_by,completed_at)
       VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6::jsonb,$7::jsonb,'completed',$8,$9,now()) RETURNING *`,
      [tenant(req),String(req.body.name || 'Transparent evidence and descriptor Pareto review').slice(0,200),req.body.proteinId || null,
        JSON.stringify(objectives),JSON.stringify(req.body.constraints || { intendedUse:'research triage' }),
        JSON.stringify(entries.map((item) => item.id)),JSON.stringify(frontier),
        'This frontier compares recorded evidence and deterministic descriptors. It does not optimize predicted potency, selectivity, ADMET, or clinical success.',req.user.id]);
    res.status(201).json({ optimization: result.rows[0], frontier, dominatedCount: entries.length-frontier.length });
  } catch (error) { next(error); }
});

router.post('/jobs', async (req, res, next) => {
  const pool = req.app.get('db');
  try {
    const workflowType = String(req.body.workflowType || '');
    const defaultModelKey = WORKFLOW_MODELS[workflowType];
    if (!defaultModelKey) return res.status(422).json({ error: 'Select a supported scientific workflow.' });
    const modelKey = String(req.body.modelKey || defaultModelKey);
    const allowedModels = workflowType === 'docking' ? ['diffdock','vina'] : [defaultModelKey];
    if (!allowedModels.includes(modelKey)) return res.status(422).json({ error: 'The selected model does not implement this workflow.' });
    const modelResult = await pool.query(`SELECT * FROM scientific_model_versions WHERE key=$1
      ORDER BY CASE readiness WHEN 'ready' THEN 0 WHEN 'adapter_ready' THEN 1 ELSE 2 END,version DESC LIMIT 1`,[modelKey]);
    if (!modelResult.rows.length) return res.status(404).json({ error: 'Model contract not found.' });
    const model = modelResult.rows[0];
    const proteinResult = req.body.proteinId ? await pool.query('SELECT * FROM scientific_proteins WHERE id=$1',[req.body.proteinId]) : {rows:[]};
    const compoundResult = req.body.compoundId ? await pool.query('SELECT * FROM scientific_compounds WHERE id=$1',[req.body.compoundId]) : {rows:[]};
    const needsProtein = ['protein_embedding','qsar','complex_prediction','docking'].includes(workflowType);
    const needsCompound = ['qsar','admet','complex_prediction','docking','synthesis_planning'].includes(workflowType);
    if (needsProtein && !proteinResult.rows[0]) return res.status(422).json({ error: 'This workflow requires a resolved protein.' });
    if (needsCompound && !compoundResult.rows[0]) return res.status(422).json({ error: 'This workflow requires a resolved compound.' });
    const inputSnapshot = { workflowType, proteinId:req.body.proteinId || null, compoundId:req.body.compoundId || null,
      objective:String(req.body.objective || '').slice(0,2000), constraints:req.body.constraints || {}, requestedModel:modelKey,
      ...(modelKey === 'reinvent4' ? {
        numMolecules:Math.max(8,Math.min(256,Number(req.body.numMolecules || 32))),
        seed:Number(req.body.seed || 20260801),
      } : {}),
      ...(modelKey === 'vina' ? {
        structureId:req.body.structureId || null,
        referenceLigandCode:String(req.body.referenceLigandCode || '').trim().toUpperCase() || null,
        boxCenter:Array.isArray(req.body.boxCenter) ? req.body.boxCenter.map(Number) : null,
        boxSize:Array.isArray(req.body.boxSize) ? req.body.boxSize.map(Number) : [22,22,22],
        seed:Number(req.body.seed || 20260801), cpu:Math.max(1,Math.min(8,Number(req.body.cpu || 2))),
        exhaustiveness:Math.max(1,Math.min(64,Number(req.body.exhaustiveness || 8))),
        numModes:Math.max(1,Math.min(20,Number(req.body.numModes || 9))),
      } : {}) };
    let status='blocked'; let output={ scientificStatus:'No prediction was generated.' };
    let uncertainty={ note:'Unavailable because no validated model executed.' };
    let applicability={ inDomain:null, domain:model.applicability_domain };
    let requirements=[
      `Install and pin ${model.display_name} with its licensed weights.`,
      'Record benchmark data, split strategy, calibration, applicability domain, and acceptance thresholds.',
      'Expose the validated image through MODEL_RUNNER_URL and pass the runner acceptance suite.',
    ];
    if (modelKey === 'vina' && model.readiness === 'ready') {
      if (!req.body.structureId) return res.status(422).json({ error:'Select an experimental protein structure for AutoDock Vina.' });
      const structure=await pool.query("SELECT * FROM scientific_structures WHERE id=$1 AND protein_id=$2 AND structure_kind='experimental'",[req.body.structureId,req.body.proteinId]);
      if (!structure.rows.length) return res.status(422).json({ error:'The selected structure does not belong to this protein.' });
      const hasBox=Array.isArray(inputSnapshot.boxCenter) && inputSnapshot.boxCenter.length===3 && inputSnapshot.boxCenter.every(Number.isFinite);
      if (!hasBox && !inputSnapshot.referenceLigandCode && !structure.rows[0].provenance?.referenceLigandCode)
        return res.status(422).json({ error:'Provide docking-box coordinates or a co-crystal reference ligand code. The application will not guess a binding site.' });
      status='queued'; output={headline:'AutoDock Vina job queued',scientificStatus:'No result yet.',
        explanation:'The local runner will prepare the receptor and ligand, calculate poses, verify artifacts, and preserve full provenance.'};
      uncertainty={note:'Pending execution.'}; requirements=[];
    } else if (modelKey === 'admet-ai' && model.readiness === 'ready') {
      status='queued'; output={headline:'ADMET-AI job queued',scientificStatus:'No result yet.',
        explanation:'The pinned local ADMET-AI runner will calculate its endpoint panel and preserve an immutable result artifact.'};
      uncertainty={note:'Pending execution. The deployed runner returns point estimates and does not invent calibrated intervals.'}; requirements=[];
    } else if (modelKey === 'reinvent4' && model.readiness === 'ready') {
      status='queued'; output={headline:'REINVENT4 generation job queued',scientificStatus:'No result yet.',
        explanation:'The pinned public prior will sample molecular proposals and rank only the explicit recorded descriptor constraints.'};
      uncertainty={note:'Pending execution. A recorded seed controls sampling; descriptors do not establish biological performance.'}; requirements=[];
    } else if (modelKey === 'aizynthfinder' && model.readiness === 'ready') {
      status='queued'; output={headline:'AiZynthFinder route search queued',scientificStatus:'No result yet.',
        explanation:'The pinned USPTO policy and ZINC reference stock will generate ranked retrosynthesis hypotheses.'};
      uncertainty={note:'Pending execution. Route ranking does not establish yield, safety, cost, availability, or scale-up feasibility.'}; requirements=[];
    } else if (model.readiness !== 'not_configured' && externalRunner(modelKey).url) {
      const runner=externalRunner(modelKey);
      const response = await fetch(`${runner.url}/predict`, { method:'POST', headers:{
        'Content-Type':'application/json', ...(runner.token ? {Authorization:`Bearer ${runner.token}`} : {}),
      }, body:JSON.stringify({ model:{key:model.key,version:model.version}, protein:proteinResult.rows[0] || null,
        compound:compoundResult.rows[0] || null, task:workflowType, options:req.body.options || {}, constraints:req.body.constraints || {} }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Model runner returned ${response.status}`);
      status='completed'; output=payload; uncertainty=payload.uncertainty || {}; applicability=payload.applicability || {}; requirements=[];
    } else {
      output={ headline:`${model.display_name} is not installed`, scientificStatus:'No prediction was generated.',
        explanation:`The ${WORKFLOW_LABELS[workflowType]} workflow is implemented, versioned, and auditable, but the required model runner is not deployment-ready.` };
    }
    const job = await pool.query(
      `INSERT INTO scientific_workflow_jobs(tenant_id,workflow_type,protein_id,compound_id,model_key,model_version,status,input_snapshot,output,uncertainty,applicability,requirements,created_by,completed_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11::jsonb,$12::jsonb,$13,CASE WHEN $7='completed' THEN now() ELSE NULL END) RETURNING *`,
      [tenant(req),workflowType,req.body.proteinId || null,req.body.compoundId || null,model.key,model.version,status,
        JSON.stringify(inputSnapshot),JSON.stringify(output),JSON.stringify(uncertainty),JSON.stringify(applicability),JSON.stringify(requirements),req.user.id]);
    if (status === 'queued') {
      await pool.query(`INSERT INTO scientific_job_events(tenant_id,job_id,event_type,message,details)
        VALUES($1,$2,'queued','Job accepted by the local scientific queue.',$3::jsonb)`,[tenant(req),job.rows[0].id,JSON.stringify({modelKey,modelVersion:model.version})]);
      enqueueScientificJob(pool,job.rows[0].id);
    }
    res.status(status === 'blocked' || status === 'queued' ? 202 : 201).json({ job:job.rows[0], model,
      notice:'A blocked job contains no scientific prediction. Completed output still requires expert and experimental validation.' });
  } catch (error) { next(error); }
});

router.get('/jobs/:id', async (req,res,next) => {
  try {
    const result=await req.app.get('db').query(`SELECT j.*,p.protein_name,c.preferred_name,m.display_name,m.readiness model_readiness,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('eventType',e.event_type,'message',e.message,'details',e.details,'occurredAt',e.occurred_at) ORDER BY e.occurred_at)
        FROM scientific_job_events e WHERE e.job_id=j.id),'[]'::jsonb) events
      FROM scientific_workflow_jobs j LEFT JOIN scientific_proteins p ON p.id=j.protein_id
      LEFT JOIN scientific_compounds c ON c.id=j.compound_id LEFT JOIN scientific_model_versions m ON m.key=j.model_key AND m.version=j.model_version
      WHERE j.id=$1 AND j.tenant_id=$2`,[req.params.id,tenant(req)]);
    if (!result.rows.length) return res.status(404).json({error:'Scientific job not found.'});
    res.json({job:result.rows[0]});
  } catch(error){ next(error); }
});

router.post('/jobs/:id/cancel', async (req,res,next) => {
  try {
    const job=await cancelJob(req.app.get('db'),req.params.id,tenant(req));
    if (!job) return res.status(409).json({error:'Only queued or running jobs can be cancelled.'});
    res.json({job,notice:'Cancellation requested.'});
  } catch(error){ next(error); }
});

router.post('/jobs/:id/retry', async (req,res,next) => {
  const pool=req.app.get('db');
  try {
    const result=await pool.query(`UPDATE scientific_workflow_jobs SET status='queued',progress=0,cancel_requested=false,error_message=NULL,
      completed_at=NULL,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND model_key IN ('vina','admet-ai','reinvent4','aizynthfinder') AND status IN ('failed','cancelled') AND attempts<max_attempts RETURNING *`,
      [req.params.id,tenant(req)]);
    if (!result.rows.length) return res.status(409).json({error:'This job is not eligible for retry or has reached its attempt limit.'});
    await pool.query(`INSERT INTO scientific_job_events(tenant_id,job_id,event_type,message) VALUES($1,$2,'retry_requested','Retry requested by a user.')`,[tenant(req),req.params.id]);
    enqueueScientificJob(pool,req.params.id); res.status(202).json({job:result.rows[0]});
  } catch(error){ next(error); }
});

router.get('/jobs/:id/export', async (req,res,next) => {
  try {
    const result=await req.app.get('db').query(`SELECT j.*,p.protein_name,p.uniprot_id,c.preferred_name,c.pubchem_cid,m.display_name
      FROM scientific_workflow_jobs j LEFT JOIN scientific_proteins p ON p.id=j.protein_id
      LEFT JOIN scientific_compounds c ON c.id=j.compound_id LEFT JOIN scientific_model_versions m ON m.key=j.model_key AND m.version=j.model_version
      WHERE j.id=$1 AND j.tenant_id=$2`,[req.params.id,tenant(req)]);
    if (!result.rows.length) return res.status(404).json({error:'Scientific job not found.'});
    const job=result.rows[0]; const format=String(req.query.format || 'pdf').toLowerCase();
    const safeName=`scientific-job-${job.id}`;
    if (format === 'json') {
      res.type('application/json').attachment(`${safeName}.json`);
      return res.send(JSON.stringify({exportedAt:new Date().toISOString(),job},null,2));
    }
    if (format === 'csv') {
      const quote=(value)=>`"${String(value ?? '').replace(/"/g,'""')}"`;
      let rows=[['category','name','value','unit']];
      if (Array.isArray(job.output?.scores)) rows=rows.concat(job.output.scores.map((score)=>['docking_pose',`Pose ${score.rank}`,score.affinityKcalMol,'kcal/mol']));
      if (job.output?.predictions) rows=rows.concat(Object.entries(job.output.predictions).map(([key,value])=>['admet_endpoint',key,value,'model output']));
      if (Array.isArray(job.output?.generatedMolecules)) rows=rows.concat(job.output.generatedMolecules.map((molecule,index)=>['generated_molecule',molecule.smiles,molecule.qed,`QED; rank ${index+1}; MW ${molecule.molecularWeight}; XlogP ${molecule.xlogp}`]));
      if (Array.isArray(job.output?.routes)) rows=rows.concat(job.output.routes.map((route)=>['retrosynthesis_route',`Route ${route.rank}`,route.score,`${route.reactionCount} steps; solved ${route.solved}`]));
      res.type('text/csv').attachment(`${safeName}.csv`); return res.send(rows.map((row)=>row.map(quote).join(',')).join('\n'));
    }
    if (format !== 'pdf') return res.status(422).json({error:'Supported export formats are PDF, CSV, and JSON.'});
    res.type('application/pdf').attachment(`${safeName}.pdf`); const document=new PDFDocument({margin:48,size:'LETTER'}); document.pipe(res);
    document.fontSize(22).fillColor('#0f4c5c').text('Scientific workflow report');
    document.moveDown(.4).fontSize(10).fillColor('#566573').text(`Immutable job ${job.id} · exported ${new Date().toISOString()}`);
    document.moveDown().fontSize(14).fillColor('#182230').text(job.output?.headline || job.display_name || job.workflow_type);
    document.fontSize(10).fillColor('#455568').text(job.output?.summary || job.output?.explanation || 'No scientific result summary was recorded.');
    const facts=[['Status',job.status],['Workflow',job.workflow_type],['Model',`${job.display_name || job.model_key} ${job.model_version}`],
      ['Protein',job.protein_name ? `${job.protein_name} (${job.uniprot_id})`:'Not selected'],['Compound',job.preferred_name ? `${job.preferred_name}${job.pubchem_cid ? ` (CID ${job.pubchem_cid})`:''}`:'Not selected']];
    document.moveDown(); facts.forEach(([label,value])=>document.fontSize(9).fillColor('#718096').text(label,{continued:true}).fillColor('#182230').text(`  ${value}`));
    if (Array.isArray(job.output?.scores)) { document.moveDown().fontSize(13).fillColor('#182230').text('Docking hypotheses');
      job.output.scores.forEach((score)=>document.fontSize(9).text(`Pose ${score.rank}: ${score.affinityKcalMol} kcal/mol · RMSD bounds ${score.rmsdLowerBound}–${score.rmsdUpperBound} Å`)); }
    if (job.output?.predictions) { document.addPage().fontSize(13).text('ADMET endpoint panel');
      Object.entries(job.output.predictions).filter(([key])=>!key.endsWith('_percentile')).forEach(([key,value])=>document.fontSize(8).text(`${key.replace(/_/g,' ')}: ${value}`)); }
    if (Array.isArray(job.output?.generatedMolecules)) { document.addPage().fontSize(13).text('Generated molecular proposals');
      job.output.generatedMolecules.slice(0,40).forEach((molecule,index)=>document.fontSize(8).text(`${index+1}. ${molecule.smiles} · QED ${molecule.qed} · MW ${molecule.molecularWeight} · XlogP ${molecule.xlogp} · constraints ${molecule.withinConstraints?'pass':'review'}`)); }
    if (Array.isArray(job.output?.routes)) { document.addPage().fontSize(13).text('Retrosynthesis hypotheses');
      job.output.routes.slice(0,20).forEach((route)=>document.fontSize(8).text(`Route ${route.rank}: ${route.reactionCount} step(s) · ${route.precursorCount} stock precursor(s) · score ${route.score} · ${route.solved?'solved in reference stock':'not solved'}`)); }
    document.moveDown().fontSize(11).fillColor('#9b1c2b').text('Scientific boundary');
    document.fontSize(9).fillColor('#455568').text(job.output?.scientificBoundary || 'Computational output supports research prioritization only and requires expert review and experimental validation.');
    document.end();
  } catch(error){ next(error); }
});

router.post('/datasets', async (req, res, next) => {
  try {
    const modalities=['compound','protein','bioactivity','admet','structure','reaction','multimodal'];
    if (!String(req.body.name || '').trim() || !String(req.body.version || '').trim() || !modalities.includes(req.body.modality))
      return res.status(422).json({ error:'Dataset name, version, and valid modality are required.' });
    const result=await req.app.get('db').query(
      `INSERT INTO scientific_datasets(tenant_id,name,version,modality,source_type,source_url,license_note,row_count,checksum,split_strategy,quality_summary,status,created_by)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13) RETURNING *`,
      [tenant(req),String(req.body.name).slice(0,200),String(req.body.version).slice(0,100),req.body.modality,
        req.body.sourceType || 'internal',req.body.sourceUrl || null,String(req.body.licenseNote || 'Review required').slice(0,1000),
        Math.max(0,Number(req.body.rowCount || 0)),req.body.checksum || null,JSON.stringify(req.body.splitStrategy || {}),
        JSON.stringify(req.body.qualitySummary || {}),req.body.status === 'ready' ? 'ready':'draft',req.user.id]);
    res.status(201).json({dataset:result.rows[0]});
  } catch (error) { if (error.code === '23505') return res.status(409).json({error:'This dataset name and version already exist.'}); next(error); }
});

router.post('/validations', async (req, res, next) => {
  try {
    const model=await req.app.get('db').query('SELECT * FROM scientific_model_versions WHERE key=$1 AND version=$2',[req.body.modelKey,req.body.modelVersion]);
    if (!model.rows.length) return res.status(422).json({error:'Select a registered model version.'});
    if (!req.body.datasetId || !req.body.metrics || !req.body.acceptanceThresholds)
      return res.status(422).json({error:'Dataset, measured metrics, and acceptance thresholds are required.'});
    const result=await req.app.get('db').query(
      `INSERT INTO scientific_model_validations(tenant_id,model_key,model_version,dataset_id,validation_type,metrics,calibration,acceptance_thresholds,status,notes,created_by)
       VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,'needs_review',$9,$10) RETURNING *`,
      [tenant(req),req.body.modelKey,req.body.modelVersion,req.body.datasetId,req.body.validationType || 'external',
        JSON.stringify(req.body.metrics),JSON.stringify(req.body.calibration || {}),JSON.stringify(req.body.acceptanceThresholds),
        String(req.body.notes || '').slice(0,4000),req.user.id]);
    res.status(201).json({validation:result.rows[0]});
  } catch (error) { next(error); }
});

router.post('/reviews', async (req, res, next) => {
  try {
    const entityTables={screening_campaign:'scientific_screening_campaigns',optimization_campaign:'scientific_optimization_campaigns',
      workflow_job:'scientific_workflow_jobs',model_validation:'scientific_model_validations'};
    const decisions=['accept_for_prioritization','needs_evidence','revise','reject'];
    const table=entityTables[req.body.entityType];
    if (!table || !decisions.includes(req.body.decision) || !String(req.body.rationale || '').trim())
      return res.status(422).json({error:'Entity type, decision, and rationale are required.'});
    const entity=await req.app.get('db').query(`SELECT id FROM ${table} WHERE id=$1 AND tenant_id=$2`,[req.body.entityId,tenant(req)]);
    if (!entity.rows.length) return res.status(404).json({error:'Review target not found.'});
    const result=await req.app.get('db').query(
      `INSERT INTO scientific_workflow_reviews(tenant_id,entity_type,entity_id,decision,rationale,reviewer_user_id)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenant(req),req.body.entityType,req.body.entityId,req.body.decision,String(req.body.rationale).slice(0,6000),req.user.id]);
    if (req.body.entityType !== 'model_validation') await req.app.get('db').query(`UPDATE ${table} SET status='reviewed' WHERE id=$1`,[req.body.entityId]);
    res.status(201).json({review:result.rows[0]});
  } catch (error) { next(error); }
});

module.exports=router;
module.exports.descriptorReadiness=descriptorReadiness;
module.exports.paretoFrontier=paretoFrontier;
module.exports.WORKFLOW_MODELS=WORKFLOW_MODELS;
