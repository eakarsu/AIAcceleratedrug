const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
const { storeFileArtifact } = require('./objectStore');

const projectRoot = path.resolve(__dirname, '../../..');
const pythonPath = process.env.SCIENTIFIC_DOCKING_PYTHON
  || path.join(projectRoot, '.cache/scientific-envs/docking-conda/bin/python');
const runnerPath = path.join(projectRoot, 'scientific-runners/docking/run_vina.py');
const admetPythonPath = process.env.SCIENTIFIC_ADMET_PYTHON
  || path.join(projectRoot, '.cache/scientific-envs/admet/bin/python');
const admetRunnerPath = path.join(projectRoot, 'scientific-runners/admet/run_admet.py');
const reinventPythonPath = process.env.SCIENTIFIC_REINVENT_PYTHON
  || path.join(projectRoot, '.cache/scientific-envs/reinvent/bin/python');
const reinventRunnerPath = path.join(projectRoot, 'scientific-runners/generation/run_reinvent.py');
const reinventPriorPath = process.env.REINVENT_PRIOR_PATH
  || path.join(projectRoot, '.cache/model-assets/reinvent4-v4.8/reinvent.prior');
const aizynthPythonPath = process.env.SCIENTIFIC_AIZYNTH_PYTHON
  || path.join(projectRoot, '.cache/scientific-envs/retrosynthesis/bin/python');
const aizynthRunnerPath = path.join(projectRoot, 'scientific-runners/retrosynthesis/run_aizynthfinder.py');
const aizynthConfigPath = process.env.AIZYNTHFINDER_CONFIG
  || path.join(projectRoot, '.cache/model-assets/aizynthfinder-4.4.1/config.yml');
const jobRoot = path.join(projectRoot, '.cache/scientific-artifacts/jobs');
const localModelKeys = ['vina','admet-ai','reinvent4','aizynthfinder'];
const pending = [];
const queuedIds = new Set();
const runningChildren = new Map();
let draining = false;

async function event(pool, job, eventType, message, details = {}) {
  await pool.query(`INSERT INTO scientific_job_events(tenant_id,job_id,event_type,message,details)
    VALUES($1,$2,$3,$4,$5::jsonb)`, [job.tenant_id, job.id, eventType, message, JSON.stringify(details)]);
}

function runProcess(command, args, input, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: projectRoot, stdio: ['pipe','pipe','pipe'] });
    runningChildren.set(input.jobId, child);
    let stdout=''; let stderr=''; let timedOut=false;
    const timer=setTimeout(() => { timedOut=true; child.kill('SIGTERM'); }, timeoutMs);
    child.stdout.on('data',(chunk)=>{ stdout=(stdout+chunk).slice(-10_000_000); });
    child.stderr.on('data',(chunk)=>{ stderr=(stderr+chunk).slice(-100_000); });
    child.on('error',(error)=>{ clearTimeout(timer); runningChildren.delete(input.jobId); reject(error); });
    child.on('close',(code,signal)=>{
      clearTimeout(timer); runningChildren.delete(input.jobId);
      if (timedOut) return reject(new Error('Scientific runner exceeded the 30-minute execution limit.'));
      let payload={};
      try { payload=JSON.parse(stdout || '{}'); } catch (_) { /* reported below */ }
      if (code !== 0) return reject(new Error(payload.error || stderr.trim() || `Scientific runner exited with ${code}${signal ? ` (${signal})`:''}.`));
      if (payload.error) return reject(new Error(payload.error));
      resolve(payload);
    });
    child.stdin.end(JSON.stringify(input));
  });
}

async function persistArtifacts(pool, job, result) {
  const outputDir=path.resolve(jobRoot,job.id);
  const stored=[];
  for (const artifact of Array.isArray(result.artifacts) ? result.artifacts : []) {
    const sourcePath=path.resolve(String(artifact.path || ''));
    if (!sourcePath.startsWith(`${outputDir}${path.sep}`)) throw new Error('Runner returned an artifact outside its assigned job directory.');
    const extension=String(artifact.format || path.extname(sourcePath).slice(1) || 'bin').toLowerCase();
    const object=await storeFileArtifact(sourcePath,extension);
    if (object.checksum !== artifact.checksumSha256) throw new Error(`Artifact checksum mismatch for ${artifact.filename}.`);
    const record=await pool.query(`INSERT INTO scientific_artifacts
      (tenant_id,entity_type,entity_id,artifact_kind,format,object_uri,checksum_sha256,size_bytes,source_filename,content_metadata,created_by)
      VALUES($1,'workflow_job',$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
      ON CONFLICT(tenant_id,checksum_sha256,artifact_kind) DO UPDATE SET entity_id=EXCLUDED.entity_id,content_metadata=EXCLUDED.content_metadata
      RETURNING id`,[job.tenant_id,job.id,artifact.kind,artifact.format,object.objectUri,object.checksum,object.sizeBytes,
        String(artifact.filename || '').slice(0,255),JSON.stringify({modelKey:job.model_key,modelVersion:job.model_version,workflowType:job.workflow_type}),job.created_by]);
    stored.push({artifactId:record.rows[0].id,kind:artifact.kind,format:artifact.format,filename:artifact.filename,
      checksumSha256:object.checksum,sizeBytes:object.sizeBytes,downloadUrl:`/api/discovery/artifacts/${record.rows[0].id}`});
  }
  return stored;
}

async function executeVina(pool, jobId) {
  const jobResult=await pool.query(`SELECT j.*,c.preferred_name,c.canonical_smiles,p.protein_name,p.uniprot_id
    FROM scientific_workflow_jobs j JOIN scientific_compounds c ON c.id=j.compound_id JOIN scientific_proteins p ON p.id=j.protein_id
    WHERE j.id=$1`,[jobId]);
  const job=jobResult.rows[0];
  if (!job || job.model_key !== 'vina' || job.workflow_type !== 'docking') return;
  if (job.cancel_requested) {
    await pool.query("UPDATE scientific_workflow_jobs SET status='cancelled',progress=0,updated_at=now(),completed_at=now() WHERE id=$1",[job.id]);
    await event(pool,job,'cancelled','Job cancelled before execution.');
    return;
  }
  if (!job.canonical_smiles) throw new Error('Selected compound has no standardized SMILES for Vina preparation.');
  const input=job.input_snapshot || {};
  const structureResult=input.structureId
    ? await pool.query("SELECT * FROM scientific_structures WHERE id=$1 AND protein_id=$2 AND structure_kind='experimental'",[input.structureId,job.protein_id])
    : await pool.query("SELECT * FROM scientific_structures WHERE protein_id=$1 AND structure_kind='experimental' ORDER BY CASE WHEN external_id='4WKQ' THEN 0 ELSE 1 END,id LIMIT 1",[job.protein_id]);
  const structure=structureResult.rows[0];
  if (!structure?.external_id) throw new Error('Select an experimental PDB structure before running Vina.');
  const referenceLigandCode=String(input.referenceLigandCode || structure.provenance?.referenceLigandCode || '').trim().toUpperCase();
  const boxCenter=Array.isArray(input.boxCenter) && input.boxCenter.length===3 ? input.boxCenter.map(Number) : null;
  if (!boxCenter && !referenceLigandCode) throw new Error('Provide explicit docking-box coordinates or a co-crystal reference ligand code.');
  const outputDir=path.resolve(jobRoot,job.id);
  await fs.mkdir(outputDir,{recursive:true,mode:0o750});
  await pool.query("UPDATE scientific_workflow_jobs SET status='running',progress=10,attempts=attempts+1,started_at=now(),updated_at=now(),error_message=NULL WHERE id=$1",[job.id]);
  await event(pool,job,'started','AutoDock Vina preparation started.',{structureId:structure.id,pdbId:structure.external_id});
  const runnerInput={jobId:job.id,outputDir,receptorUrl:`https://files.rcsb.org/download/${encodeURIComponent(structure.external_id)}.pdb`,
    structureId:structure.external_id,referenceLigandCode:referenceLigandCode || null,boxCenter,
    boxSize:Array.isArray(input.boxSize) ? input.boxSize : [22,22,22],smiles:job.canonical_smiles,compoundName:job.preferred_name,
    seed:Number(input.seed || 20260801),cpu:Number(input.cpu || 2),exhaustiveness:Number(input.exhaustiveness || 8),numModes:Number(input.numModes || 9)};
  await pool.query("UPDATE scientific_workflow_jobs SET progress=25,worker_metadata=$2::jsonb,updated_at=now() WHERE id=$1",
    [job.id,JSON.stringify({runner:'local-process',pythonPath,runnerPath,structureId:structure.external_id})]);
  const result=await runProcess(pythonPath,[runnerPath],runnerInput,30*60*1000);
  const current=await pool.query('SELECT cancel_requested FROM scientific_workflow_jobs WHERE id=$1',[job.id]);
  if (current.rows[0]?.cancel_requested) {
    await pool.query("UPDATE scientific_workflow_jobs SET status='cancelled',progress=0,updated_at=now(),completed_at=now() WHERE id=$1",[job.id]);
    await event(pool,job,'cancelled','Job cancelled after runner completion; output was not promoted.');
    return;
  }
  await pool.query("UPDATE scientific_workflow_jobs SET progress=85,updated_at=now() WHERE id=$1",[job.id]);
  const artifacts=await persistArtifacts(pool,job,result);
  const pose=artifacts.find((artifact)=>artifact.kind==='docking_poses' && artifact.format==='SDF');
  if (pose) await pool.query(`INSERT INTO scientific_structures(protein_id,compound_id,structure_kind,external_id,format,uri,checksum,confidence,provenance,retrieved_at)
    VALUES($1,$2,'docking_hypothesis',$3,'SDF',$4,$5,$6::jsonb,$7::jsonb,now()) ON CONFLICT(structure_kind,external_id,uri) DO UPDATE SET confidence=EXCLUDED.confidence,provenance=EXCLUDED.provenance,retrieved_at=now()`,
    [job.protein_id,job.compound_id,job.id,pose.downloadUrl,pose.checksumSha256,
      JSON.stringify({bestVinaScoreKcalMol:result.scores?.[0]?.affinityKcalMol,poseCount:result.scores?.length}),
      JSON.stringify({label:'AutoDock Vina docking hypothesis; not an experimental structure or measured affinity.',modelVersion:job.model_version,
        box:result.box,preparation:result.preparation,sourceStructure:structure.external_id})]);
  const output={...result,artifacts};
  await pool.query(`UPDATE scientific_workflow_jobs SET status='completed',progress=100,output=$2::jsonb,uncertainty=$3::jsonb,
    applicability=$4::jsonb,requirements='[]'::jsonb,artifact_ids=$5::jsonb,updated_at=now(),completed_at=now() WHERE id=$1`,
    [job.id,JSON.stringify(output),JSON.stringify(result.uncertainty || {}),JSON.stringify(result.applicability || {}),JSON.stringify(artifacts.map((item)=>item.artifactId))]);
  await event(pool,job,'completed','AutoDock Vina generated docking hypotheses and verified artifacts.',{artifactCount:artifacts.length,poseCount:result.scores?.length || 0});
}

async function executeAdmet(pool,jobId) {
  const job=(await pool.query(`SELECT j.*,c.preferred_name,c.canonical_smiles FROM scientific_workflow_jobs j
    JOIN scientific_compounds c ON c.id=j.compound_id WHERE j.id=$1`,[jobId])).rows[0];
  if (!job || job.model_key !== 'admet-ai' || job.workflow_type !== 'admet') return;
  if (job.cancel_requested) {
    await pool.query("UPDATE scientific_workflow_jobs SET status='cancelled',progress=0,updated_at=now(),completed_at=now() WHERE id=$1",[job.id]);
    await event(pool,job,'cancelled','Job cancelled before execution.'); return;
  }
  if (!job.canonical_smiles) throw new Error('Selected compound has no standardized SMILES for ADMET-AI.');
  const outputDir=path.resolve(jobRoot,job.id); await fs.mkdir(outputDir,{recursive:true,mode:0o750});
  await pool.query("UPDATE scientific_workflow_jobs SET status='running',progress=10,attempts=attempts+1,started_at=now(),updated_at=now(),error_message=NULL WHERE id=$1",[job.id]);
  await event(pool,job,'started','ADMET-AI endpoint prediction started.',{compound:job.preferred_name});
  await pool.query("UPDATE scientific_workflow_jobs SET progress=25,worker_metadata=$2::jsonb,updated_at=now() WHERE id=$1",
    [job.id,JSON.stringify({runner:'local-process',pythonPath:admetPythonPath,runnerPath:admetRunnerPath})]);
  const result=await runProcess(admetPythonPath,[admetRunnerPath],{jobId:job.id,outputDir,smiles:job.canonical_smiles,compoundName:job.preferred_name,cpu:1},30*60*1000);
  const current=await pool.query('SELECT cancel_requested FROM scientific_workflow_jobs WHERE id=$1',[job.id]);
  if (current.rows[0]?.cancel_requested) {
    await pool.query("UPDATE scientific_workflow_jobs SET status='cancelled',progress=0,updated_at=now(),completed_at=now() WHERE id=$1",[job.id]);
    await event(pool,job,'cancelled','Job cancelled after runner completion; output was not promoted.'); return;
  }
  await pool.query("UPDATE scientific_workflow_jobs SET progress=85,updated_at=now() WHERE id=$1",[job.id]);
  const artifacts=await persistArtifacts(pool,job,result); const output={...result,artifacts};
  await pool.query(`UPDATE scientific_workflow_jobs SET status='completed',progress=100,output=$2::jsonb,uncertainty=$3::jsonb,
    applicability=$4::jsonb,requirements='[]'::jsonb,artifact_ids=$5::jsonb,updated_at=now(),completed_at=now() WHERE id=$1`,
    [job.id,JSON.stringify(output),JSON.stringify(result.uncertainty || {}),JSON.stringify(result.applicability || {}),JSON.stringify(artifacts.map((item)=>item.artifactId))]);
  await event(pool,job,'completed','ADMET-AI generated endpoint predictions and verified artifacts.',{artifactCount:artifacts.length,endpointCount:Object.keys(result.predictions || {}).length});
}

async function completeStructuredJob(pool, job, result, message, details = {}) {
  const current=await pool.query('SELECT cancel_requested FROM scientific_workflow_jobs WHERE id=$1',[job.id]);
  if (current.rows[0]?.cancel_requested) {
    await pool.query("UPDATE scientific_workflow_jobs SET status='cancelled',progress=0,updated_at=now(),completed_at=now() WHERE id=$1",[job.id]);
    await event(pool,job,'cancelled','Job cancelled after runner completion; output was not promoted.');
    return false;
  }
  await pool.query("UPDATE scientific_workflow_jobs SET progress=85,updated_at=now() WHERE id=$1",[job.id]);
  const artifacts=await persistArtifacts(pool,job,result); const output={...result,artifacts};
  await pool.query(`UPDATE scientific_workflow_jobs SET status='completed',progress=100,output=$2::jsonb,uncertainty=$3::jsonb,
    applicability=$4::jsonb,requirements='[]'::jsonb,artifact_ids=$5::jsonb,updated_at=now(),completed_at=now() WHERE id=$1`,
    [job.id,JSON.stringify(output),JSON.stringify(result.uncertainty || {}),JSON.stringify(result.applicability || {}),JSON.stringify(artifacts.map((item)=>item.artifactId))]);
  await event(pool,job,'completed',message,{artifactCount:artifacts.length,...details});
  return true;
}

async function executeReinvent(pool,jobId) {
  const job=(await pool.query("SELECT * FROM scientific_workflow_jobs WHERE id=$1 AND model_key='reinvent4' AND workflow_type='molecule_generation'",[jobId])).rows[0];
  if (!job) return;
  if (job.cancel_requested) {
    await pool.query("UPDATE scientific_workflow_jobs SET status='cancelled',progress=0,updated_at=now(),completed_at=now() WHERE id=$1",[job.id]);
    await event(pool,job,'cancelled','Job cancelled before execution.'); return;
  }
  const input=job.input_snapshot || {}; const outputDir=path.resolve(jobRoot,job.id);
  await fs.mkdir(outputDir,{recursive:true,mode:0o750});
  await pool.query("UPDATE scientific_workflow_jobs SET status='running',progress=10,attempts=attempts+1,started_at=now(),updated_at=now(),error_message=NULL WHERE id=$1",[job.id]);
  await event(pool,job,'started','REINVENT4 constrained sampling started.',{numMolecules:Number(input.numMolecules || 32),seed:Number(input.seed || 20260801)});
  await pool.query("UPDATE scientific_workflow_jobs SET progress=25,worker_metadata=$2::jsonb,updated_at=now() WHERE id=$1",
    [job.id,JSON.stringify({runner:'local-process',pythonPath:reinventPythonPath,runnerPath:reinventRunnerPath,priorPath:reinventPriorPath,device:'cpu'})]);
  const result=await runProcess(reinventPythonPath,[reinventRunnerPath],{jobId:job.id,outputDir,priorPath:reinventPriorPath,
    numMolecules:Math.max(8,Math.min(256,Number(input.numMolecules || 32))),seed:Number(input.seed || 20260801),constraints:input.constraints || {}},30*60*1000);
  await completeStructuredJob(pool,job,result,'REINVENT4 generated and verified constrained molecular proposals.',
    {moleculeCount:Array.isArray(result.generatedMolecules) ? result.generatedMolecules.length : 0});
}

async function executeAizynth(pool,jobId) {
  const job=(await pool.query(`SELECT j.*,c.preferred_name,c.canonical_smiles FROM scientific_workflow_jobs j
    JOIN scientific_compounds c ON c.id=j.compound_id WHERE j.id=$1 AND j.model_key='aizynthfinder' AND j.workflow_type='synthesis_planning'`,[jobId])).rows[0];
  if (!job) return;
  if (job.cancel_requested) {
    await pool.query("UPDATE scientific_workflow_jobs SET status='cancelled',progress=0,updated_at=now(),completed_at=now() WHERE id=$1",[job.id]);
    await event(pool,job,'cancelled','Job cancelled before execution.'); return;
  }
  if (!job.canonical_smiles) throw new Error('Selected compound has no standardized SMILES for retrosynthesis planning.');
  const outputDir=path.resolve(jobRoot,job.id); await fs.mkdir(outputDir,{recursive:true,mode:0o750});
  await pool.query("UPDATE scientific_workflow_jobs SET status='running',progress=10,attempts=attempts+1,started_at=now(),updated_at=now(),error_message=NULL WHERE id=$1",[job.id]);
  await event(pool,job,'started','AiZynthFinder route search started.',{compound:job.preferred_name});
  await pool.query("UPDATE scientific_workflow_jobs SET progress=25,worker_metadata=$2::jsonb,updated_at=now() WHERE id=$1",
    [job.id,JSON.stringify({runner:'local-process',pythonPath:aizynthPythonPath,runnerPath:aizynthRunnerPath,configPath:aizynthConfigPath,policy:'uspto',stock:'zinc'})]);
  const result=await runProcess(aizynthPythonPath,[aizynthRunnerPath],{jobId:job.id,outputDir,smiles:job.canonical_smiles,configPath:aizynthConfigPath},30*60*1000);
  await completeStructuredJob(pool,job,result,'AiZynthFinder generated and verified ranked retrosynthesis routes.',
    {routeCount:Array.isArray(result.routes) ? result.routes.length : 0,solvedRoutes:Array.isArray(result.routes) ? result.routes.filter((route)=>route.solved).length : 0});
}

async function markFailure(pool,jobId,error) {
  const job=(await pool.query('SELECT * FROM scientific_workflow_jobs WHERE id=$1',[jobId])).rows[0];
  if (!job) return;
  const cancelled=job.cancel_requested;
  await pool.query(`UPDATE scientific_workflow_jobs SET status=$2,progress=0,error_message=$3,updated_at=now(),completed_at=now() WHERE id=$1`,
    [job.id,cancelled?'cancelled':'failed',String(error.message || error).slice(0,6000)]);
  await event(pool,job,cancelled?'cancelled':'failed',cancelled?'Job cancelled.':'Scientific runner failed.',{error:String(error.message || error).slice(0,2000)});
}

async function drain(pool) {
  if (draining) return;
  draining=true;
  while (pending.length) {
    const jobId=pending.shift(); queuedIds.delete(jobId);
    try {
      const modelKey=(await pool.query('SELECT model_key FROM scientific_workflow_jobs WHERE id=$1',[jobId])).rows[0]?.model_key;
      if (modelKey === 'vina') await executeVina(pool,jobId);
      else if (modelKey === 'admet-ai') await executeAdmet(pool,jobId);
      else if (modelKey === 'reinvent4') await executeReinvent(pool,jobId);
      else if (modelKey === 'aizynthfinder') await executeAizynth(pool,jobId);
      else throw new Error(`No local scientific worker is registered for ${modelKey || 'this job'}.`);
    } catch (error) { await markFailure(pool,jobId,error); }
  }
  draining=false;
}

function enqueueVinaJob(pool,jobId) {
  if (!queuedIds.has(jobId) && !runningChildren.has(jobId)) { pending.push(jobId); queuedIds.add(jobId); }
  setImmediate(()=>drain(pool));
}

const enqueueScientificJob=enqueueVinaJob;

async function cancelJob(pool,jobId,tenantId) {
  const result=await pool.query("UPDATE scientific_workflow_jobs SET cancel_requested=true,updated_at=now() WHERE id=$1 AND tenant_id=$2 AND status IN ('queued','running') RETURNING *",[jobId,tenantId]);
  if (!result.rows.length) return null;
  const child=runningChildren.get(jobId); if (child) child.kill('SIGTERM');
  await event(pool,result.rows[0],'cancel_requested','Cancellation requested by a user.');
  return result.rows[0];
}

async function restoreQueue(pool) {
  await pool.query("UPDATE scientific_workflow_jobs SET status='queued',progress=0,updated_at=now() WHERE model_key=ANY($1::text[]) AND status='running'",[localModelKeys]);
  const jobs=await pool.query("SELECT id FROM scientific_workflow_jobs WHERE model_key=ANY($1::text[]) AND status='queued' ORDER BY created_at",[localModelKeys]);
  jobs.rows.forEach((job)=>enqueueScientificJob(pool,job.id));
}

module.exports={enqueueVinaJob,enqueueScientificJob,cancelJob,restoreQueue};
