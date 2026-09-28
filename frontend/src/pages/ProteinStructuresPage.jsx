import React, { useEffect, useState } from 'react';
import { Link } from '../router/SimpleRouter';
import { api } from '../services/api';
import './ProteinStructuresPage.css';

const kindLabel = {
  experimental: 'Experimental structure',
  alphafold_prediction: 'AlphaFold prediction',
  docking_hypothesis: 'Docking hypothesis',
  ai_complex_prediction: 'AI complex prediction',
};

function viewerUrl(structure) {
  if (structure.structure_kind === 'experimental' && structure.external_id) {
    return `https://molstar.org/viewer/?pdb=${encodeURIComponent(structure.external_id.toLowerCase())}`;
  }
  return `https://molstar.org/viewer/?url=${encodeURIComponent(structure.uri)}&format=${encodeURIComponent(String(structure.format || 'mmcif').toLowerCase())}`;
}

function provenanceLabel(structure) {
  return structure.provenance?.source || (structure.structure_kind === 'experimental' ? 'RCSB PDB' : 'AlphaFold DB');
}

export default function ProteinStructuresPage() {
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ total: 0, experimental: 0, predicted: 0, proteins: 0 });
  const [selected, setSelected] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (term = '') => {
    setLoading(true);
    setError('');
    try {
      const response = await api.getScientificStructures({ search: term, limit: 100 });
      setRecords(response.data || []);
      setSummary(response.summary || {});
      setSelected((current) => {
        if (current && response.data?.some((item) => item.id === current.id)) return current;
        return response.data?.[0] || null;
      });
    } catch (requestError) {
      setError(requestError.message || 'Unable to load scientific structures.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const submitSearch = (event) => {
    event.preventDefault();
    const term = searchInput.trim();
    setSearch(term);
    load(term);
  };

  return (
    <div className="structures-page">
      <header className="structures-hero">
        <div>
          <div className="structures-eyebrow">Structural evidence library</div>
          <h1>Protein Structures</h1>
          <p>Explore experimental PDB entries and clearly labeled predicted structures with retained scientific provenance.</p>
        </div>
        <Link className="structures-workbench-link" to="/discovery">Open discovery workbench →</Link>
      </header>

      <section className="structure-summary" aria-label="Structure catalog summary">
        <div><strong>{summary.total || 0}</strong><span>Total structures</span></div>
        <div><strong>{summary.experimental || 0}</strong><span>Experimental</span></div>
        <div><strong>{summary.predicted || 0}</strong><span>Predicted</span></div>
        <div><strong>{summary.proteins || 0}</strong><span>Proteins represented</span></div>
      </section>

      <form className="structure-search" onSubmit={submitSearch}>
        <label htmlFor="structure-search-input">Search by protein, gene, UniProt ID, PDB ID, or evidence type</label>
        <div><input id="structure-search-input" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Try EGFR, P00533, or 1M17" />
          <button type="submit">Search structures</button>
          {search && <button type="button" className="clear" onClick={() => { setSearchInput(''); setSearch(''); load(''); }}>Clear</button>}
        </div>
      </form>

      {error && <div className="structure-error" role="alert">{error}</div>}

      <div className="structure-browser">
        <section className="structure-catalog" aria-label="Available structures">
          <div className="catalog-heading"><h2>Evidence catalog</h2><span>{loading ? 'Loading…' : `${records.length} shown`}</span></div>
          {!loading && records.length === 0 && <div className="structure-empty">No matching scientific structures were found.</div>}
          {records.map((structure) => (
            <button className={`structure-record ${selected?.id === structure.id ? 'selected' : ''}`} key={structure.id} onClick={() => setSelected(structure)}>
              <div className="record-top"><span className={`evidence-kind ${structure.structure_kind}`}>{kindLabel[structure.structure_kind] || structure.structure_kind}</span><strong>{structure.external_id || 'Local model'}</strong></div>
              <h3>{structure.protein_name}</h3>
              <p>{structure.gene_symbol || 'Gene unavailable'} · {structure.uniprot_id} · {structure.sequence_length || '—'} aa</p>
              <div className="record-source"><span>{provenanceLabel(structure)}</span><span>{structure.format}</span></div>
            </button>
          ))}
        </section>

        <section className="structure-viewer-panel">
          {selected ? <>
            <div className="viewer-heading">
              <div><span className={`evidence-kind ${selected.structure_kind}`}>{kindLabel[selected.structure_kind] || selected.structure_kind}</span><h2>{selected.protein_name}</h2><p>{selected.external_id} · {selected.gene_symbol || 'Gene unavailable'} · {selected.uniprot_id}</p></div>
              <a href={selected.uri} target="_blank" rel="noreferrer">Download source ↗</a>
            </div>
            <iframe title={`${selected.protein_name} ${selected.external_id}`} src={viewerUrl(selected)} allow="fullscreen" />
            <div className="viewer-metadata">
              <div><span>Evidence source</span><strong>{provenanceLabel(selected)}</strong></div>
              <div><span>Format</span><strong>{selected.format}</strong></div>
              <div><span>Organism</span><strong>{selected.organism}</strong></div>
              <div><span>Retrieved</span><strong>{selected.retrieved_at ? new Date(selected.retrieved_at).toLocaleDateString() : 'Not recorded'}</strong></div>
            </div>
            <p className="structure-boundary">Interactive Mol* view. Experimental entries and computational predictions are intentionally labeled separately; neither establishes biological activity by itself.</p>
          </> : <div className="viewer-placeholder">Select a structure to open its interactive molecular model.</div>}
        </section>
      </div>
    </div>
  );
}
