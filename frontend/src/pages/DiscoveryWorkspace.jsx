import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../services/api';
import './DiscoveryWorkspace.css';

const valueOrDash = (value, suffix = '') => value === null || value === undefined || value === '' ? '—' : `${value}${suffix}`;
const list = (value) => Array.isArray(value) ? value : [];

function SourceLink({ href, children }) {
  return href ? <a href={href} target="_blank" rel="noreferrer">{children} ↗</a> : <span>{children}</span>;
}

function StatusPill({ children, tone = 'neutral' }) {
  return <span className={`science-pill ${tone}`}>{children}</span>;
}

function MolecularViewer({ structure }) {
  if (!structure) return <div className="viewer-empty">Select a structure to open the interactive viewer.</div>;
  const kind = structure.structure_kind || structure.kind;
  const externalId = structure.external_id || structure.externalId;
  const uri = structure.uri;
  const isPdb = kind === 'experimental' && externalId;
  const viewerUrl = isPdb
    ? `https://molstar.org/viewer/?pdb=${encodeURIComponent(externalId.toLowerCase())}`
    : `https://molstar.org/viewer/?url=${encodeURIComponent(uri)}&format=mmcif`;
  const label = kind === 'experimental' ? 'Experimental structure'
    : kind === 'alphafold_prediction' ? 'AlphaFold predicted protein'
      : kind === 'docking_hypothesis' ? 'Docking hypothesis' : 'Predicted model';
  return (
    <div className="molecular-viewer">
      <div className="viewer-label"><StatusPill tone={kind === 'experimental' ? 'evidence' : 'prediction'}>{label}</StatusPill><span>{externalId}</span></div>
      <iframe title={`${label} ${externalId}`} src={viewerUrl} allow="fullscreen" />
      <div className="viewer-footnote">Interactive Mol* viewer. Rotate, zoom, select residues, measure, and change representations inside the viewer.</div>
    </div>
  );
}

function CitationLinks({ ids, sources }) {
  const records = list(ids).map((id) => sources.find((source) => source.id === id)).filter(Boolean);
  if (!records.length) return null;
  return <span className="analyst-citations">{records.map((source) => <SourceLink href={source.url} key={source.id}>{source.id} · {source.source}</SourceLink>)}</span>;
}

function ProteinAnalystReport({ analysis, activeStructure, onSelectStructure }) {
  if (!analysis) return <div className="analyst-welcome"><strong>Ask one protein question. Receive one evidence-linked workspace.</strong><p>The analyst resolves the protein, organizes reviewed annotations, retrieves structures, and displays its sources beside the answer.</p></div>;
  const { report, sources, annotations, structures, knownLigands, publications } = analysis;
  const annotationGroups = [
    ['Domains', annotations.domains], ['Active sites', annotations.activeSites], ['Binding sites', annotations.bindingSites],
    ['Natural variants', annotations.variants], ['Mutagenesis evidence', annotations.mutagenesis],
  ];
  return <div className="protein-analyst-result">
    {analysis.warning && <div className="science-message warning">{analysis.warning}</div>}
    <div className="analyst-report-heading"><div><div className="eyebrow">Protein AI decision brief</div><h2>{report.headline}</h2><p>{report.executiveSummary}</p></div>
      <div className="analyst-run-meta"><StatusPill tone={analysis.analysis.status === 'completed' ? 'evidence' : 'warning'}>{analysis.analysis.status === 'completed' ? 'AI completed' : 'Source summary'}</StatusPill><strong>{analysis.analysis.model}</strong><span>{sources.length} traceable sources</span></div></div>
    <div className="analyst-answer"><h3>Answer</h3><p>{report.answer}</p></div>
    <div className="analyst-facts">{list(report.keyFacts).map((fact, index) => <article key={`${fact.label}-${index}`}><span>{fact.label}</span><strong>{valueOrDash(fact.value)}</strong><p>{fact.interpretation}</p><CitationLinks ids={fact.citations} sources={sources} /></article>)}</div>
    <div className="analyst-sections">{list(report.sections).map((section, index) => <article key={`${section.title}-${index}`}><h3>{section.title}</h3><p>{section.detail}</p><CitationLinks ids={section.citations} sources={sources} /></article>)}</div>

    <div className="analyst-models">
      <div className="analyst-model-list"><div className="card-kicker">Automatically retrieved models</div><h3>{structures.length} structural records</h3>
        {structures.map((structure) => <button className={activeStructure?.id === structure.id ? 'active' : ''} onClick={() => onSelectStructure(structure)} key={structure.id}>
          <span>{structure.structure_kind === 'experimental' ? 'Experimental PDB' : structure.structure_kind === 'alphafold_prediction' ? 'AlphaFold prediction' : structure.structure_kind.replace(/_/g, ' ')}</span><strong>{structure.external_id}</strong><small>{structure.format}</small>
        </button>)}
        {!structures.length && <p>No structure was returned for this protein.</p>}
      </div>
      <MolecularViewer structure={activeStructure} />
    </div>

    <div className="annotation-workbench"><div className="section-heading"><div><div className="card-kicker">Residue-level evidence</div><h2>Domains, sites, and variants</h2></div><span>UniProt annotations · positions map to the canonical sequence</span></div>
      <div className="annotation-groups">{annotationGroups.map(([title, records]) => <section key={title}><h3>{title}<span>{records.length}</span></h3>{records.slice(0, 12).map((record, index) => <div key={`${record.position}-${index}`}><strong>{record.position}</strong><p>{record.description}</p><CitationLinks ids={[record.sourceId]} sources={sources} /></div>)}{!records.length && <p className="annotation-empty">No reviewed annotations returned.</p>}</section>)}</div>
    </div>

    <div className="analyst-evidence-columns">
      <section><h3>Known linked compounds <span>{knownLigands.length}</span></h3>{knownLigands.slice(0, 8).map((ligand) => <article key={ligand.id}><strong>{ligand.preferred_name}</strong><p>{ligand.evidence_count} stored evidence record{ligand.evidence_count === 1 ? '' : 's'} · {ligand.development_status || 'Status unavailable'}</p><CitationLinks ids={[ligand.source_id]} sources={sources} /></article>)}{!knownLigands.length && <p>No linked measured evidence is stored.</p>}</section>
      <section><h3>Relevant literature <span>{publications.length}</span></h3>{publications.slice(0, 8).map((publication, index) => <article key={publication.pmid || publication.doi || index}><strong>{publication.title}</strong><p>{publication.journal || 'Journal unavailable'} · {publication.publicationYear || 'Year unavailable'}</p><CitationLinks ids={[publication.source_id]} sources={sources} /></article>)}{!publications.length && <p>No term-matched publications were returned.</p>}</section>
    </div>

    <div className="analyst-followup-grid"><section><h3>Evidence gaps</h3><ul>{list(report.evidenceGaps).map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>Recommended next steps</h3><ol>{list(report.nextSteps).map((item) => <li key={item}>{item}</li>)}</ol></section><section><h3>Limitations</h3><ul>{list(report.limitations).map((item) => <li key={item}>{item}</li>)}</ul></section></div>
    <details className="analyst-source-register"><summary>Open complete source register ({sources.length})</summary><div>{sources.map((source) => <article key={source.id}><strong>{source.id}</strong><div><span>{source.source} · {source.evidenceType}</span><SourceLink href={source.url}>{source.title}</SourceLink></div></article>)}</div></details>
    <div className="research-warning">{analysis.researchUseNotice}</div>
  </div>;
}

function PredictionResult({ response }) {
  if (!response) return <div className="result-placeholder">Run an assessment to create a versioned result with applicability and uncertainty.</div>;
  const { job, model } = response;
  const result = job?.result || {};
  const checks = list(result.checks);
  return (
    <div className="decision-brief">
      <div className="decision-heading">
        <div><div className="eyebrow">Scientific decision brief</div><h3>{result.headline || 'Model result'}</h3></div>
        <StatusPill tone={job.status === 'completed' ? 'evidence' : 'warning'}>{job.status}</StatusPill>
      </div>
      <p>{result.summary || result.executiveSummary || result.scientificStatus || 'Review the structured findings below.'}</p>
      {checks.length > 0 && <div className="check-grid">{checks.map((check) => (
        <div className={`threshold-check ${check.status}`} key={check.label}>
          <span>{check.label}</span><strong>{valueOrDash(check.value)}</strong><small>{check.status}</small>
        </div>
      ))}</div>}
      {Array.isArray(result.metrics) && result.metrics.length > 0 && <div className="brief-metrics">{result.metrics.slice(0,8).map((metric) => <div key={metric.label}><span>{metric.label}</span><strong>{valueOrDash(metric.value)}</strong></div>)}</div>}
      {list(result.sections).map((section) => <section key={section.title}><h4>{section.title}</h4><p>{section.detail}</p></section>)}
      {list(result.evidenceGaps).length > 0 && <section><h4>Evidence gaps</h4><ul>{result.evidenceGaps.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {list(result.limitations).length > 0 && <section><h4>Limitations</h4><ul>{result.limitations.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {list(result.nextExperiments).length > 0 && <section><h4>Next experiments</h4><ul>{result.nextExperiments.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {list(result.requirements).length > 0 && <section><h4>Runner requirements</h4><ul>{result.requirements.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      {list(result.actions).length > 0 && <section><h4>Recommended next steps</h4><ul>{result.actions.map((item) => <li key={item}>{item}</li>)}</ul></section>}
      <div className="model-evidence-grid">
        <div><span>Model</span><strong>{model.display_name}</strong></div>
        <div><span>Version</span><strong>{model.version}</strong></div>
        <div><span>Dataset</span><strong>{model.dataset_version}</strong></div>
        <div><span>Provider</span><strong>{model.provider}</strong></div>
        <div><span>Uncertainty</span><strong>{job.uncertainty?.note || model.uncertainty_method}</strong></div>
        <div><span>Applicability</span><strong>{job.applicability?.domain || model.applicability_domain}</strong></div>
      </div>
      <div className="research-warning">Research prioritization only. This output is not laboratory, clinical, safety, or regulatory validation.</div>
    </div>
  );
}

export default function DiscoveryWorkspace() {
  const [bootstrap, setBootstrap] = useState(null);
  const [protein, setProtein] = useState(null);
  const [compound, setCompound] = useState(null);
  const [proteinInput, setProteinInput] = useState('P00533');
  const [compoundInput, setCompoundInput] = useState('gefitinib');
  const [proteinMode, setProteinMode] = useState('auto');
  const [compoundMode, setCompoundMode] = useState('auto');
  const [sdfFile, setSdfFile] = useState(null);
  const [evidence, setEvidence] = useState({ structures: [], bioactivities: [] });
  const [evidenceLibrary, setEvidenceLibrary] = useState({ publications: [], trials: [] });
  const [externalEvidence, setExternalEvidence] = useState(null);
  const [chemistrySearch, setChemistrySearch] = useState(null);
  const [chemistryMode, setChemistryMode] = useState('similarity');
  const [activeStructure, setActiveStructure] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [modelKey, setModelKey] = useState('physchem-rules');
  const [instruction, setInstruction] = useState('Identify evidence gaps, contradictory signals, and the next experiments needed before candidate progression.');
  const [analystQuestion, setAnalystQuestion] = useState('Describe this protein, its biological role, druggability, structural evidence, active sites, therapeutic relevance, and the most important evidence gaps.');
  const [analystIncludeCompound, setAnalystIncludeCompound] = useState(true);
  const [analystReport, setAnalystReport] = useState(null);
  const [analystStructure, setAnalystStructure] = useState(null);
  const [loading, setLoading] = useState('');
  const [message, setMessage] = useState(null);

  const loadBootstrap = async () => {
    const data = await api.getDiscoveryBootstrap();
    setBootstrap(data);
    setProtein((current) => current || data.proteins.find((item) => item.uniprot_id === 'P00533') || data.proteins[0]);
    setCompound((current) => current || data.compounds.find((item) => item.pubchem_cid === '123631' || item.pubchem_cid === 123631) || data.compounds[0]);
  };

  useEffect(() => { loadBootstrap().catch((error) => setMessage({ type: 'error', text: error.message })); }, []);

  useEffect(() => {
    if (!protein?.id && !compound?.id) return;
    setExternalEvidence(null);
    setChemistrySearch(null);
    api.getScientificEvidence(protein?.id, compound?.id).then((data) => {
      setEvidence(data);
      setActiveStructure(data.structures.find((item) => item.structure_kind === 'experimental') || data.structures[0] || null);
    }).catch((error) => setMessage({ type: 'error', text: error.message }));
    api.getScientificEvidenceLibrary(protein?.id, compound?.id).then(setEvidenceLibrary).catch(() => setEvidenceLibrary({ publications: [], trials: [] }));
  }, [protein?.id, compound?.id]);

  const selectedModel = useMemo(() => bootstrap?.models.find((model) => model.key === modelKey), [bootstrap, modelKey]);
  const compoundImage = compound?.pubchem_cid
    ? `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${compound.pubchem_cid}/PNG?image_size=large` : null;

  const resolveProteinProfile = async () => {
    setLoading('protein'); setMessage(null);
    try {
      const data = await api.resolveScientificProtein({ input: proteinInput, mode: proteinMode });
      setProtein(data.protein); setMessage({ type: 'success', text: `Resolved ${data.protein.protein_name} with source provenance.` });
      await loadBootstrap();
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  const runProteinAnalyst = async () => {
    setLoading('analyst'); setMessage(null); setAnalystReport(null);
    try {
      const resolved = await api.resolveScientificProtein({ input: proteinInput, mode: proteinMode });
      const selectedProtein = resolved.protein;
      setProtein(selectedProtein);
      const data = await api.analyzeScientificProtein({ proteinId: selectedProtein.id,
        compoundId: analystIncludeCompound ? compound?.id : null, question: analystQuestion, useAi: true });
      setAnalystReport(data);
      const preferredStructure = data.structures.find((item) => item.structure_kind === 'experimental')
        || data.structures.find((item) => item.structure_kind === 'alphafold_prediction') || data.structures[0] || null;
      setAnalystStructure(preferredStructure); setActiveStructure(preferredStructure);
      await loadBootstrap();
      setMessage({ type: data.analysis.status === 'completed' ? 'success' : 'warning', text: data.analysis.status === 'completed'
        ? `Protein AI Analyst completed with ${data.sources.length} traceable sources and ${data.structures.length} molecular models.`
        : 'The AI provider was unavailable; a source-backed report was displayed without fabricated analysis.' });
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  const resolveCompoundProfile = async () => {
    setLoading('compound'); setMessage(null);
    try {
      const data = compoundMode === 'sdf'
        ? await api.uploadScientificSdf({ sdf: compoundInput, name: sdfFile?.name?.replace(/\.sdf$/i, ''), filename: sdfFile?.name })
        : await api.resolveScientificCompound({ input: compoundInput, mode: compoundMode });
      setCompound(data.compound); setMessage({ type: 'success', text: compoundMode === 'sdf'
        ? `Stored ${data.compound.preferred_name} with checksum provenance; chemistry standardization remains pending.`
        : `Resolved ${data.compound.preferred_name} with PubChem descriptors.` });
      await loadBootstrap();
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  const runPrediction = async () => {
    setLoading('prediction'); setMessage(null);
    try {
      const data = await api.runScientificPrediction({ modelKey, proteinId: protein?.id, compoundId: compound?.id, instruction });
      setPrediction(data);
      setMessage({ type: data.job.status === 'blocked' ? 'warning' : 'success', text: data.job.status === 'blocked' ? 'No scientific prediction was fabricated; the model runner requirements are shown.' : 'Versioned assessment completed and recorded.' });
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  const saveCandidate = async () => {
    if (!protein || !compound) return;
    setLoading('candidate');
    try {
      await api.saveDiscoveryCandidate({ name: `${compound.preferred_name} → ${protein.gene_symbol || protein.protein_name}`,
        proteinId: protein.id, compoundId: compound.id, priority: 'high',
        rationale: 'Saved from the scientific workbench for evidence review and experimental prioritization.',
        evidenceSnapshot: { predictionJobId: prediction?.job?.id, bioactivityIds: evidence.bioactivities.map((item) => item.id) } });
      await loadBootstrap(); setMessage({ type: 'success', text: 'Candidate saved with an immutable evidence snapshot and audit event.' });
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  const enrichEvidence = async () => {
    setLoading('evidence'); setMessage(null);
    try {
      const data = await api.enrichScientificEvidence({ proteinId: protein.id, compoundId: compound.id });
      setExternalEvidence(data);
      setEvidenceLibrary(await api.getScientificEvidenceLibrary(protein.id, compound.id));
      setEvidence(await api.getScientificEvidence(protein.id, compound.id));
      setMessage({ type: 'success', text: `Stored ${data.stored.activities} ChEMBL activities, ${data.stored.publications} publications, and ${data.stored.trials} clinical trials with source provenance.` });
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  const searchChemistry = async () => {
    setLoading('chemistry'); setMessage(null);
    try {
      const data = await api.searchScientificChemistry({ compoundId: compound.id, mode: chemistryMode });
      setChemistrySearch(data); setMessage({ type: 'success', text: `${data.method} returned ${data.results.length} compounds.` });
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  const advanceOperation = async (kind, record) => {
    const transitions = {
      projects: { planning: 'active', active: 'completed', on_hold: 'active' },
      assays: { planned: 'scheduled', scheduled: 'running', running: 'completed' },
      experiments: { draft: 'approved', approved: 'running', running: 'completed' },
    };
    const status = transitions[kind]?.[record.status];
    if (!status) return;
    setLoading(`operation-${record.id}`);
    try { await api.updateDiscoveryOperationStatus(kind, record.id, status); await loadBootstrap();
      setMessage({ type: 'success', text: `${kind.slice(0,-1)} advanced to ${status}.` });
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  const reviewPrediction = async (decision) => {
    if (!prediction?.job?.id) return;
    setLoading('review');
    try {
      await api.reviewScientificPrediction(prediction.job.id, { decision, rationale: decision === 'accept_for_prioritization'
        ? 'Accepted for research prioritization only; all stated evidence gaps and experimental requirements remain open.'
        : 'Additional measured evidence is required before this output can influence candidate progression.' });
      setMessage({ type: 'success', text: 'Human model review saved with reviewer identity and timestamp.' });
    } catch (error) { setMessage({ type: 'error', text: error.message }); } finally { setLoading(''); }
  };

  if (!bootstrap) return <div className="science-loading">Loading the scientific knowledge workspace…</div>;

  return (
    <div className="science-workspace">
      <header className="science-hero">
        <div><div className="eyebrow">Central capability · Scientific intelligence</div><h1>Protein–Drug Discovery Workbench</h1>
          <p>Resolve real scientific identifiers, inspect structures and evidence, run versioned models, and preserve every candidate decision.</p></div>
        <div className="hero-stats">
          <div><strong>{bootstrap.counts.proteins}</strong><span>proteins</span></div><div><strong>{bootstrap.counts.compounds}</strong><span>compounds</span></div>
          <div><strong>{bootstrap.counts.structures}</strong><span>structures</span></div><div><strong>{bootstrap.counts.models}</strong><span>model adapters</span></div>
        </div>
      </header>

      {message && <div className={`science-message ${message.type}`}>{message.text}</div>}
      <div className="capability-strip">
        {bootstrap.capabilities.map((capability) => <div key={capability.capability}><StatusPill tone={capability.enabled ? 'evidence' : 'warning'}>{capability.enabled ? 'Available' : 'Fallback'}</StatusPill><strong>{capability.capability}</strong><span>{capability.detail}</span></div>)}
      </div>

      <section className="science-card protein-analyst">
        <div className="protein-analyst-intro"><div><div className="card-kicker">01 · Unified AI workflow</div><h2>Ask the Protein AI Analyst</h2><p>Enter a name, UniProt ID, or FASTA sequence. The analyst resolves the scientific record, answers from traceable evidence, and opens available experimental and predicted structures automatically.</p></div><StatusPill tone="prediction">OpenRouter + scientific sources</StatusPill></div>
        <div className="analyst-controls">
          <label>Protein name, UniProt ID, or FASTA<div className="analyst-input-row"><select value={proteinMode} onChange={(event) => setProteinMode(event.target.value)}><option value="auto">Auto detect</option><option value="uniprot">UniProt ID</option><option value="fasta">FASTA</option></select>{proteinMode === 'fasta' ? <textarea rows="4" value={proteinInput} onChange={(event) => setProteinInput(event.target.value)} /> : <input value={proteinInput} onChange={(event) => setProteinInput(event.target.value)} placeholder="EGFR or P00533" />}</div></label>
          <label>Question for the analyst<textarea rows="4" value={analystQuestion} onChange={(event) => setAnalystQuestion(event.target.value)} /></label>
          <div className="analyst-examples"><span>Example questions</span>{[
            'Explain the biological function, domains, active sites, and structural evidence for this protein.',
            'Assess this protein as a small-molecule drug target and identify the evidence gaps.',
            'Compare experimental structures with AlphaFold predictions and recommend the best structure for research planning.',
          ].map((question) => <button type="button" onClick={() => setAnalystQuestion(question)} key={question}>{question}</button>)}</div>
          <div className="analyst-context-row"><label><input type="checkbox" checked={analystIncludeCompound} onChange={(event) => setAnalystIncludeCompound(event.target.checked)} /> Include selected compound context</label>{analystIncludeCompound && <select value={compound?.id || ''} onChange={(event) => setCompound(bootstrap.compounds.find((item) => String(item.id) === event.target.value))}>{bootstrap.compounds.map((item) => <option value={item.id} key={item.id}>{item.preferred_name} · CID {item.pubchem_cid || 'local'}</option>)}</select>}<button className="science-primary" onClick={runProteinAnalyst} disabled={loading === 'analyst' || !proteinInput.trim()}>{loading === 'analyst' ? 'Resolving evidence and models…' : 'Describe protein & show models'}</button></div>
        </div>
        <ProteinAnalystReport analysis={analystReport} activeStructure={analystStructure} onSelectStructure={setAnalystStructure} />
      </section>

      <section className="resolver-grid">
        <div className="science-card resolver-card">
          <div className="card-kicker">02 · Target record</div><h2>Resolve a protein</h2><p>Use a protein name, UniProt accession, or paste FASTA.</p>
          <div className="segmented">{['auto','uniprot','fasta'].map((mode) => <button className={proteinMode === mode ? 'active' : ''} onClick={() => setProteinMode(mode)} key={mode}>{mode}</button>)}</div>
          {proteinMode === 'fasta' ? <textarea value={proteinInput} onChange={(event) => setProteinInput(event.target.value)} rows="5" placeholder=">protein name&#10;MKWVTFISLL…" />
            : <input value={proteinInput} onChange={(event) => setProteinInput(event.target.value)} placeholder="EGFR or P00533" />}
          <button className="science-primary" onClick={resolveProteinProfile} disabled={loading === 'protein'}>{loading === 'protein' ? 'Resolving sources…' : 'Resolve & enrich protein'}</button>
          <select value={protein?.id || ''} onChange={(event) => setProtein(bootstrap.proteins.find((item) => String(item.id) === event.target.value))}>
            {bootstrap.proteins.map((item) => <option value={item.id} key={item.id}>{item.gene_symbol || item.protein_name} · {item.uniprot_id}</option>)}
          </select>
        </div>
        <div className="science-card resolver-card">
          <div className="card-kicker">03 · Molecule</div><h2>Resolve a drug or compound</h2><p>Use a drug name, PubChem CID, or paste SMILES.</p>
          <div className="segmented">{['auto','cid','smiles','sdf'].map((mode) => <button className={compoundMode === mode ? 'active' : ''} onClick={() => setCompoundMode(mode)} key={mode}>{mode}</button>)}</div>
          {compoundMode === 'sdf' ? <><input type="file" accept=".sdf,.mol,chemical/x-mdl-sdfile" onChange={async (event) => {
            const file = event.target.files?.[0]; setSdfFile(file || null); if (file) setCompoundInput(await file.text());
          }} /><textarea rows="4" value={compoundInput} onChange={(event) => setCompoundInput(event.target.value)} placeholder="Select an SDF file or paste a V2000/V3000 record." /></>
            : <input value={compoundInput} onChange={(event) => setCompoundInput(event.target.value)} placeholder="gefitinib, 123631, or SMILES" />}
          <button className="science-primary" onClick={resolveCompoundProfile} disabled={loading === 'compound'}>{loading === 'compound' ? 'Resolving sources…' : compoundMode === 'sdf' ? 'Store & register SDF' : 'Resolve & enrich compound'}</button>
          <select value={compound?.id || ''} onChange={(event) => setCompound(bootstrap.compounds.find((item) => String(item.id) === event.target.value))}>
            {bootstrap.compounds.map((item) => <option value={item.id} key={item.id}>{item.preferred_name} · CID {item.pubchem_cid}</option>)}
          </select>
        </div>
      </section>

      <section className="profile-grid">
        <div className="science-card profile-card">
          <div className="profile-heading"><div><div className="card-kicker">Protein profile</div><h2>{protein?.protein_name}</h2><p>{protein?.gene_symbol} · {protein?.uniprot_id} · {protein?.organism}</p></div><StatusPill tone="evidence">UniProt evidence</StatusPill></div>
          <p className="profile-description">{protein?.function_description || 'Resolve this entry to retrieve a current functional description.'}</p>
          <div className="metric-row"><div><span>Sequence</span><strong>{valueOrDash(protein?.sequence_length, ' aa')}</strong></div><div><span>Pathways</span><strong>{list(protein?.pathways).length}</strong></div><div><span>Disease links</span><strong>{list(protein?.diseases).length}</strong></div><div><span>Features</span><strong>{list(protein?.features).length}</strong></div></div>
          <div className="tag-list">{list(protein?.pathways).map((item) => <span key={item}>{item}</span>)}</div>
          <SourceLink href={protein?.source_url}>Open UniProt record</SourceLink>
        </div>
        <div className="science-card compound-card">
          <div className="compound-visual">{compoundImage && <img src={compoundImage} alt={`2D structure of ${compound?.preferred_name}`} />}</div>
          <div className="compound-details"><div className="profile-heading"><div><div className="card-kicker">Compound profile</div><h2>{compound?.preferred_name}</h2><p>PubChem CID {compound?.pubchem_cid}</p></div><StatusPill tone="evidence">PubChem evidence</StatusPill></div>
            <div className="property-grid"><div><span>Formula</span><strong>{valueOrDash(compound?.molecular_formula)}</strong></div><div><span>MW</span><strong>{valueOrDash(compound?.molecular_weight, ' g/mol')}</strong></div><div><span>XLogP</span><strong>{valueOrDash(compound?.xlogp)}</strong></div><div><span>TPSA</span><strong>{valueOrDash(compound?.tpsa, ' Å²')}</strong></div><div><span>HBD / HBA</span><strong>{valueOrDash(compound?.hbond_donors)} / {valueOrDash(compound?.hbond_acceptors)}</strong></div><div><span>Rotatable</span><strong>{valueOrDash(compound?.rotatable_bonds)}</strong></div></div>
            <SourceLink href={compound?.source_url}>Open PubChem record</SourceLink>
          </div>
        </div>
      </section>

      <section className="science-card structure-workbench">
        <div className="section-heading"><div><div className="card-kicker">04 · Structural evidence</div><h2>Interactive molecular models</h2><p>Each view is explicitly labeled by evidence type. A predicted structure is never presented as experimental.</p></div></div>
        <div className="structure-layout"><div className="structure-list">{evidence.structures.map((item) => (
          <button key={item.id} className={activeStructure?.id === item.id ? 'active' : ''} onClick={() => setActiveStructure(item)}>
            <StatusPill tone={item.structure_kind === 'experimental' ? 'evidence' : 'prediction'}>{item.structure_kind.replaceAll('_',' ')}</StatusPill>
            <strong>{item.external_id || 'Structure model'}</strong><span>{item.format}</span>
          </button>))}{evidence.structures.length === 0 && <div className="empty-note">Resolve this protein to retrieve RCSB PDB and AlphaFold structures.</div>}</div>
          <MolecularViewer structure={activeStructure} /></div>
      </section>

      <section className="science-card evidence-section">
        <div className="section-heading"><div><div className="card-kicker">05 · Measured evidence</div><h2>Known protein–compound evidence</h2></div><StatusPill tone="warning">Source verification required</StatusPill></div>
        <div className="evidence-table"><table><thead><tr><th>Protein</th><th>Compound</th><th>Measurement</th><th>Evidence level</th><th>Source</th></tr></thead><tbody>
          {evidence.bioactivities.map((item) => <tr key={item.id}><td>{item.protein_name}</td><td>{item.preferred_name}</td><td>{item.activity_type} {valueOrDash(item.value)} {item.units}</td><td>{item.evidence_level}</td><td><SourceLink href={item.source_url}>Inspect</SourceLink></td></tr>)}
          {evidence.bioactivities.length === 0 && <tr><td colSpan="5">No linked measured evidence is stored for this selected pair. Absence of evidence is not evidence of no activity.</td></tr>}
        </tbody></table></div>
      </section>

      <section className="science-card external-evidence-section">
        <div className="section-heading"><div><div className="card-kicker">06 · External evidence graph</div><h2>ChEMBL, publications, and clinical trials</h2><p>Retrieve current source records, retain their identifiers and payloads, and require human relevance review.</p></div>
          <button className="science-primary" onClick={enrichEvidence} disabled={loading === 'evidence'}>{loading === 'evidence' ? 'Enriching three sources…' : 'Enrich evidence graph'}</button></div>
        <div className="evidence-summary-grid">
          <div><strong>{externalEvidence?.chembl?.activities?.length ?? evidence.bioactivities.filter((item) => item.source_key === 'chembl').length}</strong><span>ChEMBL activities</span></div>
          <div><strong>{evidenceLibrary.publications.length}</strong><span>Matched publications</span></div>
          <div><strong>{evidenceLibrary.trials.length}</strong><span>Matched trials</span></div>
        </div>
        <div className="source-columns">
          <div><h3>Measured bioactivity</h3>{(externalEvidence?.chembl?.activities || []).slice(0,6).map((item) => <article key={item.activityId}><strong>{item.type} {valueOrDash(item.value)} {item.units}</strong><span>pChEMBL {valueOrDash(item.pchemblValue)} · {item.assayId}</span><SourceLink href={item.sourceUrl}>ChEMBL record</SourceLink></article>)}
            {!externalEvidence?.chembl?.activities?.length && <p>Run enrichment to retrieve exact target–compound activity records.</p>}</div>
          <div><h3>Publication evidence</h3>{evidenceLibrary.publications.slice(0,6).map((item) => <article key={item.id}><strong>{item.title}</strong><span>{item.journal} · {item.publication_year || 'Year unavailable'} · {valueOrDash(item.citation_count)} citations</span><SourceLink href={item.source_url}>Europe PMC</SourceLink></article>)}
            {!evidenceLibrary.publications.length && <p>No term-matched publications have been stored for this pair.</p>}</div>
          <div><h3>Clinical development</h3>{evidenceLibrary.trials.slice(0,6).map((item) => <article key={item.id}><strong>{item.brief_title}</strong><span>{item.nct_id} · {item.overall_status} · {list(item.phases).join(', ') || 'Phase not supplied'}</span><SourceLink href={item.source_url}>ClinicalTrials.gov</SourceLink></article>)}
            {!evidenceLibrary.trials.length && <p>No matched registry studies have been stored for this pair.</p>}</div>
        </div>
        <div className="research-warning">Term matching and trial registration do not establish mechanism, efficacy, causality, or safety. A scientist must inspect each source record.</div>
      </section>

      <section className="science-card chemistry-search-section">
        <div className="section-heading"><div><div className="card-kicker">07 · Chemical search</div><h2>Similarity and substructure exploration</h2><p>Use native RDKit cartridge search when available; otherwise use an explicitly labeled PubChem fallback.</p></div>
          <div className="search-actions"><div className="segmented">{['similarity','substructure'].map((mode) => <button className={chemistryMode === mode ? 'active' : ''} onClick={() => setChemistryMode(mode)} key={mode}>{mode}</button>)}</div>
            <button className="science-primary" onClick={searchChemistry} disabled={loading === 'chemistry'}>{loading === 'chemistry' ? 'Searching…' : 'Search chemical space'}</button></div></div>
        {chemistrySearch ? <><div className="search-method"><StatusPill tone={chemistrySearch.native ? 'evidence' : 'warning'}>{chemistrySearch.native ? 'Native PostgreSQL' : 'External fallback'}</StatusPill><strong>{chemistrySearch.method}</strong><span>{chemistrySearch.interpretation}</span></div>
          <div className="compound-result-grid">{chemistrySearch.results.slice(0,12).map((item,index) => <article key={item.id || item.CID || index}><strong>{item.preferred_name || item.Title || `CID ${item.pubchem_cid || item.CID}`}</strong><span>{item.molecular_formula || item.MolecularFormula} · MW {valueOrDash(item.molecular_weight || item.MolecularWeight)}</span><small>{item.similarity != null ? `${(Number(item.similarity)*100).toFixed(1)}% Tanimoto` : item.InChIKey || 'Substructure match'}</small></article>)}</div></>
          : <div className="result-placeholder compact">Select similarity or substructure and search from the current compound.</div>}
      </section>

      <section className="model-workbench">
        <div className="science-card model-selector"><div className="card-kicker">08 · Versioned models</div><h2>Prediction and evidence synthesis</h2>
          <label>Model<select value={modelKey} onChange={(event) => setModelKey(event.target.value)}>{bootstrap.models.map((model) => <option value={model.key} key={`${model.key}-${model.version}`}>{model.display_name} · {model.readiness}</option>)}</select></label>
          <div className="selected-model">
            <div><span>Task</span><strong>{selectedModel?.task}</strong></div><div><span>Version</span><strong>{selectedModel?.version}</strong></div><div><span>Execution</span><strong>{selectedModel?.execution_mode}</strong></div><div><span>Readiness</span><strong>{selectedModel?.readiness}</strong></div>
          </div>
          {modelKey === 'openrouter-synthesis' && <label>Scientific review question<textarea rows="4" value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>}
          <button className="science-primary" onClick={runPrediction} disabled={loading === 'prediction'}>{loading === 'prediction' ? 'Running with provenance…' : modelKey === 'openrouter-synthesis' ? 'Synthesize evidence gaps' : 'Run selected assessment'}</button>
          <p className="model-caution">Heavy scientific models execute only through an explicitly configured runner. The app reports “blocked” rather than generating placeholder values.</p>
        </div>
        <div className="science-card result-card"><PredictionResult response={prediction} />{prediction?.job?.status === 'completed' && <div className="review-actions"><span>Required human decision</span><button onClick={() => reviewPrediction('accept_for_prioritization')} disabled={loading === 'review'}>Accept for prioritization</button><button onClick={() => reviewPrediction('needs_evidence')} disabled={loading === 'review'}>Needs more evidence</button></div>}</div>
      </section>

      <section className="science-card model-catalog-section">
        <div className="section-heading"><div><div className="card-kicker">Model registry</div><h2>Configured scientific execution contracts</h2></div><span>{bootstrap.models.length} versioned adapters</span></div>
        <div className="model-catalog">{bootstrap.models.map((model) => <article key={`${model.key}-${model.version}`}><div><StatusPill tone={model.readiness === 'ready' ? 'evidence' : model.readiness === 'adapter_ready' ? 'prediction' : 'warning'}>{model.readiness}</StatusPill><h3>{model.display_name}</h3><p>{model.task}</p></div><dl><dt>Version</dt><dd>{model.version}</dd><dt>Dataset</dt><dd>{model.dataset_version}</dd><dt>Domain</dt><dd>{model.applicability_domain}</dd><dt>Uncertainty</dt><dd>{model.uncertainty_method}</dd></dl><SourceLink href={model.documentation_url}>Model documentation</SourceLink></article>)}</div>
      </section>

      <section className="science-card candidate-section">
        <div><div className="card-kicker">09 · Decision record</div><h2>Save as a research candidate</h2><p>Capture the selected pair, evidence IDs, model version, rationale, accountable owner, and audit event.</p></div>
        <button className="science-primary" onClick={saveCandidate} disabled={!protein || !compound || loading === 'candidate'}>{loading === 'candidate' ? 'Saving…' : 'Save candidate'}</button>
      </section>
      <section className="candidate-grid">{bootstrap.candidates.map((candidate) => <div className="science-card candidate-card" key={candidate.id}><StatusPill tone="prediction">{candidate.stage}</StatusPill><h3>{candidate.name}</h3><p>{candidate.rationale}</p><span>{new Date(candidate.created_at).toLocaleString()}</span></div>)}</section>

      <section className="science-card operations-section">
        <div className="section-heading"><div><div className="card-kicker">10 · Experimental operations</div><h2>Projects, assays, and validation experiments</h2><p>The evidence workflow continues into accountable wet-lab and computational validation—not a dead-end AI response.</p></div><div className="ops-counters"><span>{bootstrap.projects.length} project</span><span>{bootstrap.assays.length} assays</span><span>{bootstrap.experiments.length} experiments</span></div></div>
        <div className="operations-projects">{bootstrap.projects.map((project) => <article key={project.id}><div><StatusPill tone="evidence">{project.status}</StatusPill><h3>{project.name}</h3><p>{project.hypothesis}</p></div><dl><dt>Target</dt><dd>{project.protein_name}</dd><dt>Lead</dt><dd>{project.lead_compound_name}</dd><dt>Owner</dt><dd>{project.owner}</dd><dt>Milestone</dt><dd>{project.next_milestone}</dd></dl><button onClick={() => advanceOperation('projects',project)} disabled={!['planning','active','on_hold'].includes(project.status) || loading === `operation-${project.id}`}>Advance project</button></article>)}</div>
        <div className="operations-grid"><div><h3>Assay queue</h3>{bootstrap.assays.slice(0,15).map((assay) => <article key={assay.id}><div><strong>{assay.assay_name}</strong><span>{assay.endpoint} · {assay.assay_type}</span></div><StatusPill tone={assay.status === 'completed' ? 'evidence' : 'prediction'}>{assay.status}</StatusPill><button onClick={() => advanceOperation('assays',assay)} disabled={!['planned','scheduled','running'].includes(assay.status)}>Advance</button></article>)}</div>
          <div><h3>Experiment plan</h3>{bootstrap.experiments.slice(0,15).map((experiment) => <article key={experiment.id}><div><strong>{experiment.title}</strong><span>{experiment.owner} · due {experiment.due_date ? new Date(experiment.due_date).toLocaleDateString() : 'not set'}</span></div><StatusPill tone={experiment.status === 'completed' ? 'evidence' : 'prediction'}>{experiment.status}</StatusPill><button onClick={() => advanceOperation('experiments',experiment)} disabled={!['draft','approved','running'].includes(experiment.status)}>Advance</button></article>)}</div></div>
      </section>

      <footer className="science-footer"><strong>Scientific integrity boundary</strong><p>External database records may change and must be checked at their source. Model output supports prioritization only. Laboratory, clinical, safety, intellectual-property, and regulatory review remain mandatory.</p></footer>
    </div>
  );
}
