import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import DockingPoseViewer from '../components/DockingPoseViewer';
import './AdvancedDiscoveryWorkspace.css';

const workflowHelp = {
  protein_embedding: { number:'01', title:'Protein embeddings', description:'Create learned ESM C representations for sequence similarity and downstream modeling.', requires:'protein' },
  qsar: { number:'02', title:'Target-specific QSAR', description:'Run a versioned Chemprop model inside its validated chemical and target domain.', requires:'pair' },
  admet: { number:'03', title:'ADMET & toxicity', description:'Estimate absorption, distribution, metabolism, excretion, and safety endpoints with uncertainty.', requires:'compound' },
  complex_prediction: { number:'04', title:'Protein–drug complex', description:'Predict and compare a Boltz-2 complex while keeping it distinct from experimental structures.', requires:'pair' },
  docking: { number:'05', title:'Docking consensus', description:'Create DiffDock or Vina pose jobs and retain pose confidence, energy, and preparation provenance.', requires:'pair' },
  molecule_generation: { number:'06', title:'Molecule generation', description:'Generate constrained REINVENT4 proposals against an explicit objective profile.', requires:'none' },
  synthesis_planning: { number:'07', title:'Synthesis planning', description:'Create AiZynthFinder routes with template coverage and route scores.', requires:'compound' },
};

function list(value) { return Array.isArray(value) ? value : []; }
function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
function display(value) {
  if (value == null || value === '') return 'Not reported';
  if (typeof value === 'number') return Number.isInteger(value) ? value : value.toFixed(3).replace(/0+$/,'').replace(/\.$/,'');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value).replace(/_/g,' ');
}

function Status({ value }) {
  const tone = ['completed','ready','passed','reviewed'].includes(value) ? 'good'
    : ['blocked','failed','quarantined'].includes(value) ? 'danger'
      : ['running','needs_review'].includes(value) ? 'warn' : 'neutral';
  return <span className={`advanced-status ${tone}`}>{display(value)}</span>;
}

function Empty({ children }) { return <div className="advanced-empty">{children}</div>; }

function JobResult({ job }) {
  const output=object(job.output); const requirements=list(job.requirements); const metrics=list(output.metrics);
  const scores=list(output.scores); const interactions=list(output.interactions?.contacts); const artifacts=list(output.artifacts); const events=list(job.events);
  const generatedMolecules=list(output.generatedMolecules); const routes=list(output.routes);
  return <div className="advanced-job-result">
    <div className="advanced-job-result-heading"><div><strong>{output.headline || (job.status === 'blocked' ? `${job.display_name || job.model_key} deployment required` : 'Scientific workflow result')}</strong>
      <p>{output.summary || output.explanation || output.scientificStatus || 'Review the recorded execution metadata.'}</p></div><Status value={job.status}/></div>
    {metrics.length > 0 && <div className="advanced-mini-metrics">{metrics.slice(0,6).map((metric,index)=><div key={`${metric.label}-${index}`}><span>{metric.label}</span><strong>{display(metric.value)}</strong></div>)}</div>}
    {['queued','running'].includes(job.status) && <div className="advanced-progress"><div><span style={{width:`${Number(job.progress || 0)}%`}}/></div><strong>{job.progress || 0}%</strong></div>}
    {scores.length > 0 && <div className="advanced-result-section"><strong>Ranked docking hypotheses</strong><div className="advanced-pose-grid">{scores.slice(0,9).map((score)=><div key={score.rank}><span>Pose {score.rank}</span><strong>{display(score.affinityKcalMol)} kcal/mol</strong><small>RMSD bounds {display(score.rmsdLowerBound)}–{display(score.rmsdUpperBound)} Å</small></div>)}</div></div>}
    {output.redockingValidation?.available && <div className="advanced-redocking"><div><span>Co-crystal redocking RMSD</span><strong>{display(output.redockingValidation.bestPoseHeavyAtomRmsdAngstrom)} Å</strong></div><Status value={output.redockingValidation.passed?'passed':'failed'}/><p>{output.redockingValidation.interpretation} Acceptance threshold: ≤ {output.redockingValidation.thresholdAngstrom} Å.</p></div>}
    <DockingPoseViewer job={job}/>
    {interactions.length > 0 && <div className="advanced-result-section"><strong>Geometric contact review</strong><p>{interactions.slice(0,14).map((contact)=>`${contact.chain || '–'}:${contact.residue}${contact.residueNumber} (${display(contact.minimumDistanceAngstrom)} Å)`).join(' · ')}</p><small>Distance-based contacts are inspection aids, not experimentally validated interactions.</small></div>}
    {output.predictions && <div className="advanced-result-section"><strong>ADMET endpoint panel</strong><div className="advanced-prediction-grid">{Object.entries(output.predictions).filter(([key])=>!key.endsWith('_percentile')).slice(0,28).map(([key,value])=><div key={key}><span>{display(key)}</span><strong>{display(value)}</strong></div>)}</div><small>{output.scientificBoundary}</small></div>}
    {generatedMolecules.length > 0 && <div className="advanced-result-section"><div className="advanced-result-title"><div><strong>Generated molecular proposals</strong><p>Ranked by the recorded descriptor constraints and QED—not predicted efficacy.</p></div><span>{generatedMolecules.length} valid structures</span></div><div className="advanced-molecule-list">{generatedMolecules.slice(0,24).map((molecule,index)=><article key={`${molecule.smiles}-${index}`}><div><span>Candidate {index+1}</span><Status value={molecule.withinConstraints?'passed':'needs_review'}/></div><code>{molecule.smiles}</code><dl><div><dt>QED</dt><dd>{display(molecule.qed)}</dd></div><div><dt>MW</dt><dd>{display(molecule.molecularWeight)}</dd></div><div><dt>XlogP</dt><dd>{display(molecule.xlogp)}</dd></div><div><dt>TPSA</dt><dd>{display(molecule.tpsa)}</dd></div></dl></article>)}</div><small>{output.scientificBoundary}</small></div>}
    {routes.length > 0 && <div className="advanced-result-section"><div className="advanced-result-title"><div><strong>Ranked retrosynthesis hypotheses</strong><p>Reference-stock completion is not a purchasing or experimental-feasibility claim.</p></div><span>{routes.filter((route)=>route.solved).length} solved</span></div><div className="advanced-route-list">{routes.slice(0,12).map((route)=><article key={route.rank}><div className="advanced-route-heading"><strong>Route {route.rank}</strong><Status value={route.solved?'completed':'needs_review'}/><span>Score {display(route.score)}</span></div><div className="advanced-route-flow">{list(route.precursors).map((precursor,index)=><code key={`${precursor.smiles}-${index}`}>{precursor.smiles}</code>)}<b>→</b><span>{route.reactionCount} reaction step{route.reactionCount===1?'':'s'}</span></div><details><summary>Reaction evidence</summary>{list(route.reactions).map((reaction,index)=><div key={index}><code>{reaction.reactionSmiles}</code><small>Policy {reaction.policy || 'not reported'} · probability {display(reaction.policyProbability)} · template {display(reaction.templateCode)}</small></div>)}</details></article>)}</div><small>{output.scientificBoundary}</small></div>}
    {artifacts.length > 0 && <div className="advanced-result-section"><strong>Verified artifacts</strong><div className="advanced-artifact-list">{artifacts.map((artifact)=><button onClick={()=>api.downloadScientificArtifact(artifact)} key={artifact.artifactId}>{artifact.filename}<span>{String(artifact.format).toUpperCase()} · {(Number(artifact.sizeBytes || 0)/1024).toFixed(1)} KB</span></button>)}</div></div>}
    {events.length > 0 && <div className="advanced-event-list"><strong>Execution history</strong>{events.slice(-6).map((item,index)=><div key={`${item.occurredAt}-${index}`}><Status value={item.eventType}/><span>{item.message}</span><time>{new Date(item.occurredAt).toLocaleTimeString()}</time></div>)}</div>}
    {job.error_message && <div className="advanced-requirements"><strong>Execution error</strong><p>{job.error_message}</p></div>}
    {requirements.length > 0 && <div className="advanced-requirements"><strong>Deployment requirements</strong><ol>{requirements.map((item)=><li key={item}>{item}</li>)}</ol></div>}
    <dl className="advanced-inline-definition"><div><dt>Model</dt><dd>{job.display_name || job.model_key} · {job.model_version}</dd></div>
      <div><dt>Scientific output</dt><dd>{job.status === 'blocked' ? 'None generated' : 'Generated; validation required'}</dd></div>
      <div><dt>Created</dt><dd>{new Date(job.created_at).toLocaleString()}</dd></div></dl>
  </div>;
}

export default function AdvancedDiscoveryWorkspace() {
  const [data,setData]=useState(null); const [error,setError]=useState(''); const [notice,setNotice]=useState('');
  const [busy,setBusy]=useState(''); const [proteinId,setProteinId]=useState(''); const [compoundId,setCompoundId]=useState('');
  const [screenThreshold,setScreenThreshold]=useState(65); const [selectedJob,setSelectedJob]=useState(null);
  const [docking,setDocking]=useState({structureId:'',referenceLigandCode:'IRE',boxSize:[22,22,22],exhaustiveness:8,numModes:9});
  const [generation,setGeneration]=useState({numMolecules:32,maxMolecularWeight:500,maxLogP:5,seed:20260801});
  const [datasetForm,setDatasetForm]=useState({name:'Prospective assay benchmark',version:'1.0.0',modality:'bioactivity',rowCount:0,licenseNote:'Internal research data; access-controlled.',sourceType:'internal'});
  const [reviewForm,setReviewForm]=useState({entityType:'workflow_job',entityId:'',decision:'needs_evidence',rationale:'Confirm model availability, applicability domain, and experimental validation evidence before prioritization.'});

  const load=async()=>{ const response=await api.getAdvancedDiscoveryBootstrap(); setData(response);
    setProteinId((current)=>current || String(response.proteins?.[0]?.id || ''));
    setCompoundId((current)=>current || String(response.compounds?.[0]?.id || ''));
    setSelectedJob((current)=>current || response.jobs?.[0] || null); };
  useEffect(()=>{ load().catch((problem)=>setError(problem.message)); },[]);
  useEffect(()=>{ if (!selectedJob || !['queued','running'].includes(selectedJob.status)) return undefined;
    const timer=setInterval(async()=>{ try { const response=await api.getAdvancedWorkflowJob(selectedJob.id); setSelectedJob(response.job);
      if (!['queued','running'].includes(response.job.status)) await load(); } catch(problem){ setError(problem.message); } },2500);
    return ()=>clearInterval(timer); },[selectedJob?.id,selectedJob?.status]);

  const modelsByKey=useMemo(()=>Object.fromEntries(list(data?.models).map((model)=>[model.key,model])),[data]);
  const newestOptimization=data?.optimizations?.[0];

  const perform=async(key,operation,message)=>{ setBusy(key); setError(''); setNotice('');
    try { const response=await operation(); setNotice(message(response)); await load(); }
    catch(problem){ setError(problem.message); } finally { setBusy(''); } };

  const runScreening=()=>perform('screening',()=>api.runAdvancedScreening({proteinId,threshold:Number(screenThreshold)}),
    (response)=>`Screened ${response.campaign.candidate_count} compounds and retained ${response.campaign.hit_count} evidence-ready records.`);
  const runOptimization=()=>perform('optimization',()=>api.runAdvancedOptimization({proteinId}),
    (response)=>`Calculated a transparent ${response.frontier.length}-compound Pareto frontier; ${response.dominatedCount} records were dominated.`);
  const runWorkflow=(workflowType,modelKey)=>perform(`job-${workflowType}-${modelKey}`,async()=>{ const response=await api.runAdvancedWorkflowJob({workflowType,modelKey,proteinId,compoundId,
    ...(modelKey==='vina'?docking:{}), ...(modelKey==='reinvent4'?{numMolecules:generation.numMolecules,seed:generation.seed,
      constraints:{maxMolecularWeight:generation.maxMolecularWeight,maxLogP:generation.maxLogP}}:{}),
    objective:'Prioritize scientifically defensible next experiments while preserving uncertainty and provenance.'}); setSelectedJob(response.job); return response; },
    (response)=>response.job.status === 'blocked' ? `${response.model.display_name} job recorded as blocked. No prediction was fabricated.`
      : response.job.status === 'queued' ? `${response.model.display_name} job queued for local execution.` : `${response.model.display_name} completed and requires scientific review.`);
  const saveDataset=(event)=>{ event.preventDefault(); perform('dataset',()=>api.createScientificDataset({...datasetForm,rowCount:Number(datasetForm.rowCount)}),
    (response)=>`${response.dataset.name} ${response.dataset.version} registered for governance review.`); };
  const submitReview=(event)=>{ event.preventDefault(); perform('review',()=>api.reviewAdvancedWorkflow(reviewForm),()=> 'Human review decision recorded with its rationale.'); };
  const selectReview=(entityType,entityId)=>{ setReviewForm((current)=>({...current,entityType,entityId})); document.getElementById('advanced-review')?.scrollIntoView({behavior:'smooth'}); };
  const availableStructures=list(data?.structures).filter((structure)=>String(structure.protein_id)===String(proteinId));
  useEffect(()=>{ if (!availableStructures.some((structure)=>String(structure.id)===String(docking.structureId))) {
    const preferred=availableStructures.find((structure)=>structure.external_id==='4WKQ') || availableStructures[0];
    setDocking((current)=>({...current,structureId:String(preferred?.id || ''),referenceLigandCode:preferred?.provenance?.referenceLigandCode || ''}));
  } },[proteinId,data?.structures]);

  if (!data) return <div className="advanced-loading">Loading scientific execution workspace…{error && <p>{error}</p>}</div>;

  return <div className="advanced-workspace">
    <header className="advanced-hero"><div><span className="advanced-eyebrow">Model execution · validation · decisions</span><h1>Advanced Discovery Operations</h1>
      <p>Move from compounds and proteins to traceable screening, prediction jobs, validation evidence, and accountable human decisions.</p></div>
      <div className="advanced-hero-note"><strong>Scientific integrity boundary</strong><span>{data.boundaries.notice}</span></div></header>

    {(error || notice) && <div className={`advanced-alert ${error ? 'error':'success'}`}><span>{error || notice}</span><button onClick={()=>{setError('');setNotice('');}}>×</button></div>}

    <section className="advanced-context"><label>Protein target<select value={proteinId} onChange={(event)=>setProteinId(event.target.value)}>{data.proteins.map((protein)=><option value={protein.id} key={protein.id}>{protein.gene_symbol || protein.protein_name} · {protein.uniprot_id}</option>)}</select></label>
      <label>Reference compound<select value={compoundId} onChange={(event)=>setCompoundId(event.target.value)}>{data.compounds.map((compound)=><option value={compound.id} key={compound.id}>{compound.preferred_name} · CID {compound.pubchem_cid || 'local'}</option>)}</select></label>
      <div className="advanced-context-fact"><span>Available now</span><strong>{data.boundaries.executableNow.length} transparent workflows</strong></div>
      <div className="advanced-context-fact"><span>External contracts</span><strong>{data.boundaries.externalRunners.length} model runners</strong></div></section>

    <section className="advanced-section">
      <div className="advanced-section-title"><div><span className="advanced-eyebrow">Transparent execution</span><h2>Batch screening and multi-objective triage</h2><p>These workflows run now using recorded evidence and deterministic descriptors. Their scores are not presented as biological predictions.</p></div></div>
      <div className="advanced-two-column">
        <article className="advanced-panel"><div className="advanced-panel-heading"><div><span>08</span><h3>Evidence-readiness screen</h3></div><Status value="ready"/></div>
          <p>Ranks the entire compound catalog by descriptor completeness, rule compatibility, and target-linked measured evidence.</p>
          <label>Readiness threshold <strong>{screenThreshold}</strong><input type="range" min="0" max="100" value={screenThreshold} onChange={(event)=>setScreenThreshold(event.target.value)}/></label>
          <button className="advanced-primary" onClick={runScreening} disabled={busy==='screening'}>{busy==='screening'?'Screening compounds…':'Run batch screen'}</button></article>
        <article className="advanced-panel"><div className="advanced-panel-heading"><div><span>09</span><h3>Descriptor Pareto frontier</h3></div><Status value="ready"/></div>
          <p>Finds non-dominated compounds by evidence coverage, descriptor completeness, and Lipinski threshold violations.</p>
          <div className="advanced-objectives"><span>↑ Evidence</span><span>↑ Completeness</span><span>↓ Violations</span></div>
          <button className="advanced-primary" onClick={runOptimization} disabled={busy==='optimization'}>{busy==='optimization'?'Calculating frontier…':'Calculate Pareto frontier'}</button></article>
      </div>
      <div className="advanced-table-wrap"><table><thead><tr><th>Rank</th><th>Compound</th><th>Readiness</th><th>Evidence</th><th>Descriptors</th><th>Rule compatibility</th><th>Decision</th></tr></thead><tbody>
        {data.screeningResults.map((row)=><tr key={row.id}><td>#{row.rank}</td><td><strong>{row.preferred_name}</strong><small>CID {row.pubchem_cid || 'local'}</small></td><td><div className="advanced-score"><span style={{width:`${Math.min(100,Number(row.score))}%`}}></span></div><strong>{Number(row.score).toFixed(1)}</strong></td><td>{row.evidence_count} records</td><td>{Math.round(Number(row.score_components?.descriptorCompleteness || 0)*100)}%</td><td>{Math.round(Number(row.score_components?.ruleCompatibility || 0)*100)}%</td><td><Status value={row.decision}/></td></tr>)}
        {!data.screeningResults.length && <tr><td colSpan="7"><Empty>Run the evidence-readiness screen to rank all compounds.</Empty></td></tr>}
      </tbody></table></div>
      {newestOptimization && <div className="advanced-frontier"><div><strong>Latest Pareto frontier</strong><span>{newestOptimization.method.replace(/_/g,' ')} · {list(newestOptimization.frontier).length} candidates</span></div>
        <div>{list(newestOptimization.frontier).map((entry)=><button key={entry.id} title={`Readiness ${entry.readiness?.score}`}>{entry.name}<span>{entry.evidenceCount} evidence</span></button>)}</div>
        <p>{newestOptimization.limitation}</p></div>}
    </section>

    <section className="advanced-section">
      <div className="advanced-section-title"><div><span className="advanced-eyebrow">Versioned runner contracts</span><h2>Predictive and generative models</h2><p>Submit real jobs and see deployment readiness before trusting output. Uninstalled models return a blocked record with exact requirements.</p></div></div>
      <div className="advanced-model-grid">{data.boundaries.externalRunners.map((contract)=>{ const info=workflowHelp[contract.workflowType]; const model=modelsByKey[contract.modelKey];
        const models=contract.workflowType==='docking' ? [modelsByKey.diffdock,modelsByKey.vina].filter(Boolean) : [model].filter(Boolean);
        const cardReadiness=models.some((item)=>item.readiness==='ready')?'ready':model?.readiness || 'not_configured';
        return <article className="advanced-model-card" key={contract.workflowType}><div className="advanced-model-number">{info.number}</div><div className="advanced-model-card-title"><div><h3>{info.title}</h3><p>{info.description}</p></div><Status value={cardReadiness}/></div>
          <dl><div><dt>Model</dt><dd>{models.map((item)=>item.display_name).join(' / ')}</dd></div><div><dt>Version</dt><dd>{models.map((item)=>item.version).join(' / ')}</dd></div><div><dt>Domain</dt><dd>{model?.applicability_domain}</dd></div><div><dt>Uncertainty</dt><dd>{model?.uncertainty_method}</dd></div></dl>
          {contract.workflowType==='docking' && <div className="advanced-docking-form"><label>Experimental receptor<select value={docking.structureId} onChange={(event)=>{const chosen=availableStructures.find((item)=>String(item.id)===event.target.value);setDocking({...docking,structureId:event.target.value,referenceLigandCode:chosen?.provenance?.referenceLigandCode || ''});}}>{availableStructures.map((item)=><option key={item.id} value={item.id}>{item.external_id} · {item.format}</option>)}</select></label>
            <label>Reference ligand code<input value={docking.referenceLigandCode} onChange={(event)=>setDocking({...docking,referenceLigandCode:event.target.value.toUpperCase()})} placeholder="e.g. IRE"/></label>
            <label>Box size (Å)<input type="number" min="10" max="40" value={docking.boxSize[0]} onChange={(event)=>setDocking({...docking,boxSize:[Number(event.target.value),Number(event.target.value),Number(event.target.value)]})}/></label>
            <label>Exhaustiveness<input type="number" min="1" max="64" value={docking.exhaustiveness} onChange={(event)=>setDocking({...docking,exhaustiveness:Number(event.target.value)})}/></label>
            <small>The site is derived from the named co-crystal ligand. No binding pocket is guessed.</small></div>}
          {contract.workflowType==='molecule_generation' && <div className="advanced-docking-form"><label>Proposal count<input type="number" min="8" max="256" value={generation.numMolecules} onChange={(event)=>setGeneration({...generation,numMolecules:Number(event.target.value)})}/></label><label>Maximum molecular weight<input type="number" min="100" max="1000" value={generation.maxMolecularWeight} onChange={(event)=>setGeneration({...generation,maxMolecularWeight:Number(event.target.value)})}/></label><label>Maximum XlogP<input type="number" min="-5" max="15" step="0.1" value={generation.maxLogP} onChange={(event)=>setGeneration({...generation,maxLogP:Number(event.target.value)})}/></label><label>Reproducibility seed<input type="number" value={generation.seed} onChange={(event)=>setGeneration({...generation,seed:Number(event.target.value)})}/></label><small>These constraints rank generated structures; they do not predict potency or safety.</small></div>}
          <div className="advanced-model-actions">{models.map((item)=><button key={item.key} onClick={()=>runWorkflow(contract.workflowType,item.key)} disabled={busy===`job-${contract.workflowType}-${item.key}` || (item.key==='vina'&&!docking.structureId)}>
            {busy===`job-${contract.workflowType}-${item.key}`?'Submitting…':`Create ${item.display_name} job`}</button>)}</div></article>; })}</div>
    </section>

    <section className="advanced-section">
      <div className="advanced-section-title"><div><span className="advanced-eyebrow">Execution ledger</span><h2>Prediction and design jobs</h2><p>Every request retains inputs, model version, readiness, uncertainty, and whether scientific output was actually produced.</p></div></div>
      <div className="advanced-job-layout"><div className="advanced-job-list">{data.jobs.map((job)=><button className={selectedJob?.id===job.id?'active':''} key={job.id} onClick={()=>setSelectedJob(job)}><div><strong>{workflowHelp[job.workflow_type]?.title || job.workflow_type}</strong><span>{job.preferred_name || job.protein_name || 'Configured objective'}</span></div><Status value={job.status}/></button>)}{!data.jobs.length&&<Empty>Create a model job above to populate the execution ledger.</Empty>}</div>
        <div>{selectedJob ? <><JobResult job={selectedJob}/><div className="advanced-job-actions">{['queued','running'].includes(selectedJob.status)&&<button className="advanced-secondary" onClick={()=>perform('cancel-job',()=>api.cancelAdvancedWorkflowJob(selectedJob.id),()=> 'Cancellation requested.')}>Cancel job</button>}{['failed','cancelled'].includes(selectedJob.status)&&selectedJob.attempts<selectedJob.max_attempts&&<button className="advanced-secondary" onClick={()=>perform('retry-job',()=>api.retryAdvancedWorkflowJob(selectedJob.id),()=> 'Job queued for retry.')}>Retry job</button>}<button className="advanced-secondary" onClick={()=>selectReview('workflow_job',selectedJob.id)}>Record human review</button>{selectedJob.status==='completed'&&<><button className="advanced-secondary" onClick={()=>api.exportAdvancedWorkflowJob(selectedJob.id,'pdf')}>Export PDF</button><button className="advanced-secondary" onClick={()=>api.exportAdvancedWorkflowJob(selectedJob.id,'csv')}>Export CSV</button><button className="advanced-secondary" onClick={()=>api.exportAdvancedWorkflowJob(selectedJob.id,'json')}>Export JSON</button></>}</div></>:<Empty>Select a job to inspect its scientific status.</Empty>}</div></div>
    </section>

    <section className="advanced-section">
      <div className="advanced-section-title"><div><span className="advanced-eyebrow">Data and model governance</span><h2>Datasets, validation, and acceptance evidence</h2><p>A model cannot become ready solely because an adapter exists. Register its data, split strategy, measured metrics, calibration, and acceptance threshold.</p></div></div>
      <div className="advanced-governance-grid"><form className="advanced-panel advanced-form" onSubmit={saveDataset}><h3>Register dataset version</h3>
        <label>Name<input value={datasetForm.name} onChange={(event)=>setDatasetForm({...datasetForm,name:event.target.value})} required/></label>
        <div className="advanced-form-row"><label>Version<input value={datasetForm.version} onChange={(event)=>setDatasetForm({...datasetForm,version:event.target.value})} required/></label><label>Records<input type="number" min="0" value={datasetForm.rowCount} onChange={(event)=>setDatasetForm({...datasetForm,rowCount:event.target.value})}/></label></div>
        <div className="advanced-form-row"><label>Modality<select value={datasetForm.modality} onChange={(event)=>setDatasetForm({...datasetForm,modality:event.target.value})}>{['bioactivity','compound','protein','admet','structure','reaction','multimodal'].map((item)=><option key={item}>{item}</option>)}</select></label><label>Source<select value={datasetForm.sourceType} onChange={(event)=>setDatasetForm({...datasetForm,sourceType:event.target.value})}>{['internal','public','licensed','benchmark','user_upload'].map((item)=><option key={item}>{item}</option>)}</select></label></div>
        <label>License and use conditions<textarea rows="3" value={datasetForm.licenseNote} onChange={(event)=>setDatasetForm({...datasetForm,licenseNote:event.target.value})} required/></label>
        <button className="advanced-primary" disabled={busy==='dataset'}>{busy==='dataset'?'Registering…':'Register draft dataset'}</button></form>
        <div className="advanced-dataset-list">{data.datasets.map((dataset)=><article key={dataset.id}><div><strong>{dataset.name}</strong><span>{dataset.modality} · {dataset.source_type}</span></div><Status value={dataset.status}/><dl><div><dt>Version</dt><dd>{dataset.version}</dd></div><div><dt>Records</dt><dd>{dataset.row_count.toLocaleString()}</dd></div><div><dt>License</dt><dd>{dataset.license_note}</dd></div></dl></article>)}</div></div>
      <div className="advanced-validation-list"><h3>Validation register</h3>{data.validations.map((validation)=><article key={validation.id}><div><strong>{validation.display_name || validation.model_key}</strong><span>{validation.model_version} · {validation.validation_type}</span></div><Status value={validation.status}/><p>{validation.notes || 'Independent scientific review required.'}</p><button onClick={()=>selectReview('model_validation',validation.id)}>Review validation</button></article>)}</div>
    </section>

    <section className="advanced-section" id="advanced-review"><div className="advanced-section-title"><div><span className="advanced-eyebrow">Human accountability</span><h2>Scientific review decision</h2><p>Model output never advances itself. Record who decided, what evidence was reviewed, and why.</p></div></div>
      <form className="advanced-review-form" onSubmit={submitReview}><label>Review target<select value={`${reviewForm.entityType}:${reviewForm.entityId}`} onChange={(event)=>{const [entityType,entityId]=event.target.value.split(':');setReviewForm({...reviewForm,entityType,entityId});}} required><option value=":">Select a record</option>{data.jobs.map((job)=><option key={job.id} value={`workflow_job:${job.id}`}>{workflowHelp[job.workflow_type]?.title} · {job.status}</option>)}{data.screenings.map((item)=><option key={item.id} value={`screening_campaign:${item.id}`}>Screening · {item.name}</option>)}{data.optimizations.map((item)=><option key={item.id} value={`optimization_campaign:${item.id}`}>Optimization · {item.name}</option>)}{data.validations.map((item)=><option key={item.id} value={`model_validation:${item.id}`}>Validation · {item.display_name || item.model_key}</option>)}</select></label>
        <label>Decision<select value={reviewForm.decision} onChange={(event)=>setReviewForm({...reviewForm,decision:event.target.value})}>{['needs_evidence','accept_for_prioritization','revise','reject'].map((item)=><option key={item} value={item}>{display(item)}</option>)}</select></label>
        <label className="advanced-review-rationale">Rationale<textarea rows="4" value={reviewForm.rationale} onChange={(event)=>setReviewForm({...reviewForm,rationale:event.target.value})} required/></label>
        <button className="advanced-primary" disabled={busy==='review'||!reviewForm.entityId}>{busy==='review'?'Recording…':'Record signed decision'}</button></form>
      <div className="advanced-review-history">{data.reviews.map((review)=><article key={review.id}><Status value={review.decision}/><p>{review.rationale}</p><small>{review.entity_type.replace(/_/g,' ')} · {new Date(review.reviewed_at).toLocaleString()}</small></article>)}{!data.reviews.length&&<Empty>No advanced workflow reviews recorded yet.</Empty>}</div></section>
  </div>;
}
