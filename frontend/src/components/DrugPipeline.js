import React, { useEffect, useState, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

// Kanban-style pipeline board: columns Discovery → Preclinical → Phase I →
// Phase II → Phase III → Approved. Pulls grouped data from
// GET /api/custom-views/pipeline (which falls back to synthesised data if the
// drug_candidates table is missing).
//
// Phase column colour scheme — mirrors the existing badge palette so it feels
// like a native part of the platform without touching App.css.
const PHASE_STYLE = {
  Discovery:   { bg: '#f1f5f9', accent: '#64748b' },
  Preclinical: { bg: '#ecfeff', accent: '#0891b2' },
  'Phase I':   { bg: '#fef3c7', accent: '#d97706' },
  'Phase II':  { bg: '#e0e7ff', accent: '#4f46e5' },
  'Phase III': { bg: '#dcfce7', accent: '#16a34a' },
  Approved:    { bg: '#fae8ff', accent: '#a21caf' },
};

const DEFAULT_PHASES = ['Discovery', 'Preclinical', 'Phase I', 'Phase II', 'Phase III', 'Approved'];

export default function DrugPipeline() {
  const [data, setData] = useState({ pipeline: {}, phases: DEFAULT_PHASES, source: 'loading' });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    fetch('/api/custom-views/pipeline', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((json) => {
        // backend may return {pipeline,phases,source} — keep defaults if absent
        setData({
          pipeline: json.pipeline || {},
          phases: json.phases || DEFAULT_PHASES,
          source: json.source || 'unknown',
        });
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const chartData = useMemo(() => {
    return (data.phases || DEFAULT_PHASES).map((phase) => ({
      phase,
      count: (data.pipeline[phase] || []).length,
      fill: PHASE_STYLE[phase]?.accent || '#6366f1',
    }));
  }, [data]);

  if (loading) {
    return <div style={{ padding: 24, color: '#64748b' }}>Loading pipeline…</div>;
  }
  if (error) {
    return <div style={{ padding: 24, color: '#dc2626' }}>Pipeline error: {error}</div>;
  }

  return (
    <div data-testid="drug-pipeline" style={{ marginBottom: 32 }}>
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
            Drug Discovery Pipeline
          </h2>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>
            Kanban board across discovery phases · source: <code>{data.source}</code>
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          Total candidates:{' '}
          <strong>
            {Object.values(data.pipeline).reduce((a, b) => a + b.length, 0)}
          </strong>
        </div>
      </div>

      {/* Compact recharts summary above the Kanban */}
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          border: '1px solid #e2e8f0',
          height: 180,
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <XAxis dataKey="phase" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {chartData.map((d) => (
                <Cell key={d.phase} fill={d.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Kanban columns */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${data.phases.length}, minmax(180px, 1fr))`,
          gap: 12,
          overflowX: 'auto',
        }}
      >
        {data.phases.map((phase) => {
          const items = data.pipeline[phase] || [];
          const style = PHASE_STYLE[phase] || { bg: '#f8fafc', accent: '#6366f1' };
          return (
            <div
              key={phase}
              data-testid={`pipeline-col-${phase}`}
              style={{
                background: style.bg,
                borderRadius: 12,
                border: `1px solid ${style.accent}33`,
                padding: 12,
                minHeight: 200,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                  paddingBottom: 8,
                  borderBottom: `2px solid ${style.accent}`,
                }}
              >
                <span style={{ fontWeight: 600, color: style.accent }}>{phase}</span>
                <span
                  style={{
                    background: style.accent,
                    color: '#fff',
                    fontSize: 11,
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}
                >
                  {items.length}
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.length === 0 && (
                  <div style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>
                    No candidates
                  </div>
                )}
                {items.map((c) => (
                  <div
                    key={c.id || c.name}
                    style={{
                      background: '#fff',
                      borderRadius: 8,
                      padding: 10,
                      border: '1px solid #e2e8f0',
                      boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                      {c.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                      {c.molecule_type || '—'}
                      {c.target_name ? ` · ${c.target_name}` : ''}
                    </div>
                    {typeof c.efficacy_score === 'number' || c.efficacy_score ? (
                      <div
                        style={{
                          marginTop: 6,
                          fontSize: 11,
                          color: style.accent,
                          fontWeight: 600,
                        }}
                      >
                        Efficacy: {Number(c.efficacy_score).toFixed(1)}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
