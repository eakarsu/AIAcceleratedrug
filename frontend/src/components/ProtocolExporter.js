import React, { useEffect, useState } from 'react';

// Trial Protocol PDF Exporter (custom non-visualisation feature #3).
// Lets the user pick a drug candidate and download a generated PDF protocol
// from POST /api/custom-views/trial-protocol?candidate_id=N.
//
// All styling is inline so we never touch the global App.css per project rules.

export default function ProtocolExporter() {
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportMsg, setExportMsg] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/custom-views/pipeline', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        const flat = [];
        Object.values(json.pipeline || {}).forEach((arr) => arr.forEach((c) => flat.push(c)));
        flat.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setCandidates(flat);
        if (flat.length > 0) setSelected(String(flat[0].id));
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  async function handleExport() {
    if (!selected) return;
    setExporting(true);
    setExportMsg(null);
    const token = localStorage.getItem('token');
    try {
      const resp = await fetch(
        `/api/custom-views/trial-protocol?candidate_id=${encodeURIComponent(selected)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ candidate_id: selected }),
        }
      );
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`HTTP ${resp.status}: ${text.slice(0, 160)}`);
      }
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const picked = candidates.find((c) => String(c.id) === String(selected));
      const safe = (picked?.name || `candidate-${selected}`).replace(/[^A-Za-z0-9_-]+/g, '_');
      a.download = `trial-protocol-${safe}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setExportMsg({ ok: true, text: `Downloaded protocol for ${picked?.name || selected}` });
    } catch (err) {
      setExportMsg({ ok: false, text: err.message });
    } finally {
      setExporting(false);
    }
  }

  const picked = candidates.find((c) => String(c.id) === String(selected));

  return (
    <div data-testid="protocol-exporter" style={{ marginBottom: 32 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 22, color: '#1e293b' }}>
            Trial Protocol PDF Exporter
          </h2>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Pick a drug candidate and generate a downloadable Clinical Trial Protocol PDF
            (study design, inclusion/exclusion, dosing, endpoints, safety monitoring).
          </div>
        </div>
      </div>

      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 18,
          border: '1px solid #e2e8f0',
        }}
      >
        {loading && <div style={{ color: '#64748b' }}>Loading candidates…</div>}
        {error && <div style={{ color: '#dc2626' }}>Failed to load candidates: {error}</div>}

        {!loading && !error && (
          <>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 320px', minWidth: 240 }}>
                <label
                  htmlFor="pe-candidate"
                  style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6 }}
                >
                  Drug candidate
                </label>
                <select
                  id="pe-candidate"
                  data-testid="protocol-candidate-select"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    border: '1px solid #cbd5e1',
                    borderRadius: 8,
                    fontSize: 14,
                    color: '#0f172a',
                    background: '#f8fafc',
                  }}
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.phase ? `· ${c.phase}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                data-testid="protocol-export-btn"
                onClick={handleExport}
                disabled={!selected || exporting}
                style={{
                  background: exporting ? '#94a3b8' : '#1d4ed8',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  padding: '11px 18px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: exporting ? 'not-allowed' : 'pointer',
                  boxShadow: '0 1px 2px rgba(15,23,42,0.1)',
                }}
              >
                {exporting ? 'Generating PDF…' : 'Generate Trial Protocol'}
              </button>
            </div>

            {picked && (
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  background: '#f8fafc',
                  border: '1px dashed #cbd5e1',
                  borderRadius: 8,
                  fontSize: 13,
                  color: '#0f172a',
                }}
              >
                <div><strong>Selected:</strong> {picked.name}</div>
                <div style={{ color: '#475569', marginTop: 2 }}>
                  {picked.molecule_type || '—'}
                  {picked.target_name ? ` · target ${picked.target_name}` : ''}
                  {picked.phase ? ` · ${picked.phase}` : ''}
                  {typeof picked.efficacy_score === 'number'
                    ? ` · efficacy ${Number(picked.efficacy_score).toFixed(1)}`
                    : ''}
                </div>
              </div>
            )}

            {exportMsg && (
              <div
                role="status"
                style={{
                  marginTop: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  background: exportMsg.ok ? '#dcfce7' : '#fee2e2',
                  color: exportMsg.ok ? '#166534' : '#991b1b',
                  fontSize: 13,
                }}
              >
                {exportMsg.text}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
