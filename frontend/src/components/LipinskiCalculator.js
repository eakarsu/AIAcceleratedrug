import React, { useState } from 'react';

// Lipinski Rule-of-Five Calculator (custom non-visualisation feature #4).
// Form accepts either a SMILES string OR manual MW/logP/HBD/HBA values;
// posts to /api/custom-views/lipinski-eval and renders per-rule pass/fail badges.

const RULE_DEFS = [
  { id: 'mw',   label: 'Molecular weight ≤ 500 Da' },
  { id: 'logp', label: 'logP ≤ 5' },
  { id: 'hbd',  label: 'H-bond donors ≤ 5' },
  { id: 'hba',  label: 'H-bond acceptors ≤ 10' },
];

function Badge({ ok, children }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.3,
        background: ok ? '#dcfce7' : '#fee2e2',
        color: ok ? '#166534' : '#991b1b',
        border: `1px solid ${ok ? '#86efac' : '#fca5a5'}`,
      }}
    >
      {children}
    </span>
  );
}

export default function LipinskiCalculator() {
  const [smiles, setSmiles] = useState('');
  const [mw, setMw] = useState('');
  const [logP, setLogP] = useState('');
  const [hbd, setHbd] = useState('');
  const [hba, setHba] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  function loadExample() {
    setSmiles('CC(=O)OC1=CC=CC=C1C(=O)O'); // aspirin
    setMw('');
    setLogP('');
    setHbd('');
    setHba('');
    setResult(null);
    setError(null);
  }

  async function handleCalculate(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    const token = localStorage.getItem('token');

    const body = { smiles: smiles.trim() || undefined };
    if (mw !== '')   body.mw   = Number(mw);
    if (logP !== '') body.logP = Number(logP);
    if (hbd !== '')  body.hbd  = Number(hbd);
    if (hba !== '')  body.hba  = Number(hba);

    try {
      const resp = await fetch('/api/custom-views/lipinski-eval', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || `HTTP ${resp.status}`);
      setResult(json);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function ruleStatus(id) {
    if (!result || !Array.isArray(result.rules)) return null;
    return result.rules.find((r) => r.id === id);
  }

  const overallOk = result && result.passes === 'y';

  return (
    <div data-testid="lipinski-calculator" style={{ marginBottom: 32 }}>
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
            Lipinski Rule-of-Five Calculator
          </h2>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Enter SMILES (auto-estimated) or override with explicit MW / logP / HBD / HBA values.
          </div>
        </div>
        <button
          type="button"
          onClick={loadExample}
          style={{
            background: '#f1f5f9',
            color: '#1e293b',
            border: '1px solid #cbd5e1',
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Load aspirin example
        </button>
      </div>

      <form
        onSubmit={handleCalculate}
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 18,
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ marginBottom: 14 }}>
          <label
            htmlFor="lp-smiles"
            style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6 }}
          >
            SMILES (optional)
          </label>
          <input
            id="lp-smiles"
            data-testid="lipinski-smiles"
            type="text"
            value={smiles}
            onChange={(e) => setSmiles(e.target.value)}
            placeholder="e.g. CC(=O)OC1=CC=CC=C1C(=O)O"
            style={{
              width: '100%',
              padding: '10px 12px',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              fontSize: 14,
              background: '#f8fafc',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
            marginBottom: 14,
          }}
        >
          {[
            { id: 'mw',   label: 'MW (Da)',  value: mw,   set: setMw,   step: '0.1', min: 0 },
            { id: 'logP', label: 'logP',     value: logP, set: setLogP, step: '0.1', min: -5 },
            { id: 'hbd',  label: 'HBD',      value: hbd,  set: setHbd,  step: '1',   min: 0 },
            { id: 'hba',  label: 'HBA',      value: hba,  set: setHba,  step: '1',   min: 0 },
          ].map((f) => (
            <div key={f.id}>
              <label
                htmlFor={`lp-${f.id}`}
                style={{ display: 'block', fontSize: 12, color: '#475569', marginBottom: 6 }}
              >
                {f.label}
              </label>
              <input
                id={`lp-${f.id}`}
                data-testid={`lipinski-${f.id}`}
                type="number"
                step={f.step}
                min={f.min}
                value={f.value}
                onChange={(e) => f.set(e.target.value)}
                placeholder="auto"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  border: '1px solid #cbd5e1',
                  borderRadius: 8,
                  fontSize: 14,
                  background: '#f8fafc',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button
            type="submit"
            data-testid="lipinski-calculate-btn"
            disabled={busy}
            style={{
              background: busy ? '#94a3b8' : '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '11px 18px',
              fontSize: 14,
              fontWeight: 600,
              cursor: busy ? 'not-allowed' : 'pointer',
              boxShadow: '0 1px 2px rgba(15,23,42,0.1)',
            }}
          >
            {busy ? 'Calculating…' : 'Calculate'}
          </button>
          <span style={{ fontSize: 12, color: '#64748b' }}>
            Tip: leave numeric fields blank to let the backend estimate from SMILES.
          </span>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginTop: 14,
              padding: '10px 12px',
              borderRadius: 8,
              background: '#fee2e2',
              color: '#991b1b',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}
      </form>

      {result && (
        <div
          data-testid="lipinski-result"
          style={{
            background: '#fff',
            borderRadius: 12,
            padding: 18,
            border: '1px solid #e2e8f0',
            marginTop: 14,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Badge ok={overallOk}>{overallOk ? 'PASSES Ro5' : 'FAILS Ro5'}</Badge>
              <span style={{ fontSize: 13, color: '#475569' }}>
                {result.violations.length} violation{result.violations.length === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ fontSize: 13, color: '#0f172a' }}>
              Oral bioavailability score:{' '}
              <strong data-testid="lipinski-score">
                {result.oral_bioavailability_score}
              </strong>
              {' '}/ 100
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 10,
              marginBottom: 14,
            }}
          >
            {RULE_DEFS.map((def) => {
              const r = ruleStatus(def.id);
              const ok = r ? r.ok : false;
              return (
                <div
                  key={def.id}
                  data-testid={`lipinski-rule-${def.id}`}
                  style={{
                    border: '1px solid #e2e8f0',
                    borderRadius: 10,
                    padding: 12,
                    background: ok ? '#f0fdf4' : '#fef2f2',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#475569' }}>{def.label}</span>
                    <Badge ok={ok}>{ok ? 'PASS' : 'FAIL'}</Badge>
                  </div>
                  {r && (
                    <div style={{ fontSize: 13, color: '#0f172a', marginTop: 6 }}>
                      Value:{' '}
                      <strong>
                        {typeof r.value === 'number' ? r.value.toFixed(2) : String(r.value)}
                      </strong>{' '}
                      <span style={{ color: '#64748b' }}>(limit {r.threshold})</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {result.estimate && (
            <div
              style={{
                background: '#f1f5f9',
                border: '1px dashed #cbd5e1',
                borderRadius: 8,
                padding: 10,
                fontSize: 12,
                color: '#475569',
                marginBottom: 12,
              }}
            >
              SMILES estimate ({result.estimate.source}): MW {result.estimate.molecular_weight} Da
              · logP {result.estimate.logP} · HBD {result.estimate.hbd} · HBA {result.estimate.hba}
              · heavy atoms {result.estimate.heavy_atoms}
            </div>
          )}

          {result.violations.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', marginBottom: 6 }}>
                Violations
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#0f172a', fontSize: 13 }}>
                {result.violations.map((v) => (
                  <li key={v.id}>{v.detail}</li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8', marginBottom: 6 }}>
              Recommendations
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: '#0f172a', fontSize: 13 }}>
              {result.recommendations.map((rec, i) => (
                <li key={i}>{rec}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
