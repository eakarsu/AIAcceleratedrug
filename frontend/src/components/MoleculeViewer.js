import React, { useEffect, useMemo, useState } from 'react';

// Renders a small chemistry sketch (SVG) for each molecule returned by
// GET /api/custom-views/molecules. Each backend record carries a `structure`
// graph with `atoms: [{label,x,y}]` and `bonds: [{from,to,order}]`, so this
// component is a pure renderer — no chemistry library required client-side.

const ATOM_COLOR = {
  C: '#0f172a',
  N: '#2563eb',
  O: '#dc2626',
  S: '#ca8a04',
  P: '#a16207',
  CA: '#16a34a', // alpha carbon (protein backbone)
  H: '#64748b',
};

function atomFill(label) {
  return ATOM_COLOR[label] || '#475569';
}

function MoleculeCanvas({ structure, width = 220, height = 220 }) {
  if (!structure || !structure.atoms?.length) {
    return (
      <div
        style={{
          width,
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#94a3b8',
          fontSize: 12,
        }}
      >
        No structure data
      </div>
    );
  }

  // Compute bounding box and translate so the molecule is centred.
  const xs = structure.atoms.map((a) => a.x);
  const ys = structure.atoms.map((a) => a.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, 1);
  const h = Math.max(maxY - minY, 1);
  const pad = 24;
  const scale = Math.min((width - pad * 2) / w, (height - pad * 2) / h);
  const tx = (label) => pad + (label - minX) * scale;
  const ty = (label) => pad + (label - minY) * scale;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ background: '#fafafa', borderRadius: 8, border: '1px solid #e2e8f0' }}
    >
      {/* Bonds */}
      {structure.bonds?.map((bond, i) => {
        const a = structure.atoms[bond.from];
        const b = structure.atoms[bond.to];
        if (!a || !b) return null;
        const x1 = tx(a.x);
        const y1 = ty(a.y);
        const x2 = tx(b.x);
        const y2 = ty(b.y);
        const stroke = '#334155';
        // Double bond → render parallel line offset by 3px perpendicular.
        if (bond.order === 2) {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const ox = (-dy / len) * 3;
          const oy = (dx / len) * 3;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth="1.4" />
              <line
                x1={x1 + ox}
                y1={y1 + oy}
                x2={x2 + ox}
                y2={y2 + oy}
                stroke={stroke}
                strokeWidth="1.4"
              />
            </g>
          );
        }
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={stroke}
            strokeWidth="1.6"
          />
        );
      })}

      {/* Atoms */}
      {structure.atoms.map((atom, i) => (
        <g key={i}>
          <circle
            cx={tx(atom.x)}
            cy={ty(atom.y)}
            r={atom.label === 'CA' ? 10 : 9}
            fill="#fff"
            stroke={atomFill(atom.label)}
            strokeWidth="1.5"
          />
          <text
            x={tx(atom.x)}
            y={ty(atom.y) + 4}
            textAnchor="middle"
            fontSize="11"
            fontWeight="600"
            fill={atomFill(atom.label)}
            fontFamily="ui-monospace, SFMono-Regular, monospace"
          >
            {atom.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default function MoleculeViewer() {
  const [data, setData] = useState({ molecules: [], source: 'loading' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/custom-views/molecules', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        setData({ molecules: json.molecules || [], source: json.source || 'unknown' });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const current = useMemo(() => data.molecules[selected], [data, selected]);

  if (loading) {
    return <div style={{ padding: 24, color: '#64748b' }}>Loading molecules…</div>;
  }
  if (error) {
    return <div style={{ padding: 24, color: '#dc2626' }}>Molecule viewer error: {error}</div>;
  }

  return (
    <div data-testid="molecule-viewer" style={{ marginBottom: 24 }}>
      <div style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 22, color: '#1e293b' }}>Molecule Structure Viewer</h2>
        <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
          SVG render of simulated chemical structures · source: <code>{data.source}</code>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 280px) 1fr',
          gap: 16,
        }}
      >
        {/* Selector list */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 8,
            maxHeight: 360,
            overflowY: 'auto',
          }}
        >
          {data.molecules.map((m, i) => {
            const active = i === selected;
            return (
              <button
                key={m.id || i}
                onClick={() => setSelected(i)}
                data-testid={`molecule-item-${i}`}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  marginBottom: 4,
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: active ? '#eef2ff' : 'transparent',
                  color: active ? '#4338ca' : '#1e293b',
                  fontWeight: active ? 600 : 500,
                  fontSize: 13,
                }}
              >
                {m.name}
                <div
                  style={{
                    fontSize: 11,
                    color: '#64748b',
                    marginTop: 2,
                    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                  }}
                >
                  {m.formula || m.smiles?.slice(0, 28) || ''}
                </div>
              </button>
            );
          })}
        </div>

        {/* Viewer panel */}
        <div
          style={{
            background: '#fff',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: 16,
            display: 'flex',
            gap: 16,
            alignItems: 'flex-start',
          }}
        >
          {current ? (
            <>
              <MoleculeCanvas structure={current.structure} width={260} height={260} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: '#1e293b' }}>
                  {current.name}
                </div>
                <div style={{ marginTop: 10, fontSize: 13, color: '#475569', lineHeight: 1.6 }}>
                  <div>
                    <strong>Formula:</strong>{' '}
                    <code>{current.formula || '—'}</code>
                  </div>
                  <div>
                    <strong>MW:</strong> {current.molecular_weight || 0} Da
                  </div>
                  <div style={{ wordBreak: 'break-all' }}>
                    <strong>SMILES:</strong>{' '}
                    <code style={{ fontSize: 12 }}>{current.smiles || 'N/A'}</code>
                  </div>
                  <div>
                    <strong>Kind:</strong> {current.kind || '—'}
                  </div>
                  {current.notes && (
                    <div style={{ marginTop: 8, color: '#64748b', fontStyle: 'italic' }}>
                      {current.notes}
                    </div>
                  )}
                </div>

                {/* Atom legend */}
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                    Atom legend
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {Object.entries(ATOM_COLOR).map(([label, color]) => (
                      <span
                        key={label}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 11,
                          padding: '2px 8px',
                          borderRadius: 10,
                          background: `${color}1a`,
                          color,
                          fontWeight: 600,
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: color,
                            display: 'inline-block',
                          }}
                        />
                        {label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: '#94a3b8' }}>Select a molecule from the list</div>
          )}
        </div>
      </div>
    </div>
  );
}
