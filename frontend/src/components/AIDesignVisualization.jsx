import React, { useEffect, useMemo, useState } from 'react';

const PROTEIN_FEATURES = new Set(['aiProteinDesign', 'aiStructurePrediction', 'aiValidateSequence']);
const RESIDUE_GROUPS = {
  hydrophobic: new Set('AILMFWVY'.split('')),
  polar: new Set('STNQ'.split('')),
  charged: new Set('DEKRH'.split('')),
};

function downloadText(filename, content, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function sequenceClass(residue) {
  if (RESIDUE_GROUPS.hydrophobic.has(residue)) return 'hydrophobic';
  if (RESIDUE_GROUPS.polar.has(residue)) return 'polar';
  if (RESIDUE_GROUPS.charged.has(residue)) return 'charged';
  return 'special';
}

function ProteinDesign({ result, formData }) {
  const sequence = String(result?.amino_acid_sequence || result?.sequence || formData.sequence || '').replace(/\s/g, '').toUpperCase();
  if (!sequence) return null;
  const name = result?.protein_name || result?.name || formData.name || formData.target || 'AI protein design';
  const secondary = result?.secondary_structure || {};
  const helices = Number(secondary.alpha_helices_pct ?? secondary.alpha_helices ?? 0);
  const sheets = Number(secondary.beta_sheets_pct ?? secondary.beta_sheets ?? 0);
  const loops = Number(secondary.loops_pct ?? Math.max(0, 100 - helices - sheets));
  const visibleSequence = sequence.slice(0, 500);
  const fasta = `>${String(name).replace(/\s+/g, '_')}|AI_generated_research_hypothesis\n${sequence.match(/.{1,70}/g)?.join('\n') || sequence}\n`;

  return (
    <section className="ai-design-card protein-design-card">
      <div className="ai-design-heading">
        <div><span>Generated protein blueprint</span><h2>{name}</h2><p>{sequence.length} amino-acid residues · sequence-level design</p></div>
        <div className="ai-design-actions">
          <button type="button" onClick={() => navigator.clipboard?.writeText(sequence)}>Copy sequence</button>
          <button type="button" onClick={() => downloadText(`${String(name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.fasta`, fasta)}>Download FASTA</button>
        </div>
      </div>

      {(helices > 0 || sheets > 0 || loops > 0) && (
        <div className="secondary-design">
          <div className="secondary-design-bar" aria-label="AI-estimated secondary structure proportions">
            <span className="helix" style={{ width: `${Math.max(0, helices)}%` }} />
            <span className="sheet" style={{ width: `${Math.max(0, sheets)}%` }} />
            <span className="loop" style={{ width: `${Math.max(0, loops)}%` }} />
          </div>
          <div className="secondary-legend"><span className="helix">Helix {helices || '—'}%</span><span className="sheet">Sheet {sheets || '—'}%</span><span className="loop">Loop {loops || '—'}%</span></div>
        </div>
      )}

      <div className="protein-sequence-design">
        {visibleSequence.split('').map((residue, index) => (
          <span className={sequenceClass(residue)} title={`Residue ${index + 1}: ${residue}`} key={`${index}-${residue}`}>{residue}<small>{index + 1}</small></span>
        ))}
      </div>
      {sequence.length > visibleSequence.length && <p className="ai-design-overflow">First 500 residues shown. The FASTA download contains the complete sequence.</p>}
      <div className="residue-legend"><span className="hydrophobic">Hydrophobic</span><span className="polar">Polar</span><span className="charged">Charged</span><span className="special">Special</span></div>
      <p className="ai-design-warning"><strong>Design label:</strong> AI-generated sequence hypothesis. This is not an experimentally solved structure or a validated protein therapeutic. Run structure prediction and laboratory validation next.</p>
    </section>
  );
}

function collectSmiles(value, entries = [], path = 'design') {
  if (!value || entries.length >= 6) return entries;
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectSmiles(item, entries, `${path} ${index + 1}`));
    return entries;
  }
  if (typeof value !== 'object') return entries;
  const name = value.design_name || value.name || value.candidate || value.compound_name || path;
  for (const [key, nested] of Object.entries(value)) {
    if (/smiles/i.test(key) && typeof nested === 'string' && nested.trim()) {
      if (!entries.some((entry) => entry.smiles === nested.trim())) entries.push({ name, smiles: nested.trim() });
    } else if (typeof nested === 'object') collectSmiles(nested, entries, String(name));
  }
  return entries;
}

function MoleculeDepiction({ design }) {
  const [imageUrl, setImageUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    const controller = new AbortController();
    const token = localStorage.getItem('token');
    fetch(`/api/ai/molecule-depiction?smiles=${encodeURIComponent(design.smiles)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error('2D depiction unavailable');
      return response.blob();
    }).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    }).catch((problem) => {
      if (active && problem.name !== 'AbortError') setError(problem.message);
    });
    return () => {
      active = false;
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [design.smiles]);

  return (
    <article className="molecule-design-card">
      <div className="molecule-design-canvas">
        {imageUrl ? <img src={imageUrl} alt={`2D molecular depiction for ${design.name}`} /> : <div>{error || 'Rendering standardized 2D structure…'}</div>}
      </div>
      <div><span>AI molecular proposal</span><h3>{design.name}</h3><code>{design.smiles}</code></div>
      <div className="ai-design-actions">
        <button type="button" onClick={() => navigator.clipboard?.writeText(design.smiles)}>Copy SMILES</button>
        <button type="button" onClick={() => downloadText(`${String(design.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.smi`, `${design.smiles}\t${design.name}\n`, 'chemical/x-daylight-smiles')}>Download .smi</button>
      </div>
    </article>
  );
}

function MoleculeDesigns({ result, formData }) {
  const designs = useMemo(() => {
    const collected = collectSmiles(result);
    const inputSmiles = formData.reference_smiles || formData.smiles || formData.ligand_smiles;
    if (collected.length === 0 && inputSmiles) collected.push({ name: result?.design_name || formData.compound_name || 'Submitted molecule', smiles: inputSmiles });
    return collected.slice(0, 3);
  }, [formData, result]);
  if (!designs.length) return null;
  return (
    <section className="ai-design-card">
      <div className="ai-design-heading"><div><span>Molecular design workspace</span><h2>Visible chemical proposals</h2><p>Standardized two-dimensional depictions generated from the returned SMILES.</p></div></div>
      <div className="molecule-design-grid">{designs.map((design, index) => <MoleculeDepiction design={design} key={`${design.smiles}-${index}`} />)}</div>
      <p className="ai-design-warning"><strong>Design label:</strong> AI-generated research hypothesis. Depiction confirms a renderable molecular graph—not potency, selectivity, safety, synthesizability, or clinical value.</p>
    </section>
  );
}

export default function AIDesignVisualization({ config, result, formData }) {
  if (!result || typeof result !== 'object') return null;
  const showProtein = PROTEIN_FEATURES.has(config.apiCall);
  return (
    <div className="ai-design-workspace">
      {showProtein && <ProteinDesign result={result} formData={formData} />}
      <MoleculeDesigns result={result} formData={formData} />
    </div>
  );
}
