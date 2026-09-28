import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';

const AI_FEATURES = [
  '', 'protein-design', 'drug-design', 'binding-affinity', 'toxicity-prediction', 'structure-prediction',
  'drug-interaction', 'check-interactions', 'admet-prediction', 'literature-analysis',
  'validate-sequence', 'rank-candidates', 'predict-solubility', 'dock-protein',
  'predict-off-targets', 'recommend-formulation', 'patent-landscape', 'virtual-hts',
  'sar-analysis', 'clinical-trial-design', 'competitive-intelligence', 'regulatory-pathway',
];

function JsonPreview({ data, maxDepth = 2, depth = 0 }) {
  if (data === null || data === undefined) return <span style={{ color: '#94a3b8' }}>null</span>;
  if (typeof data !== 'object') return <span style={{ color: '#059669', fontSize: '12px' }}>"{String(data).substring(0, 80)}"</span>;
  if (depth >= maxDepth) return <span style={{ color: '#94a3b8', fontSize: '12px' }}>[...]</span>;
  if (Array.isArray(data)) {
    return <span style={{ color: '#94a3b8', fontSize: '12px' }}>[{data.length} items]</span>;
  }
  return (
    <div style={{ paddingLeft: '12px', borderLeft: '2px solid #e2e8f0' }}>
      {Object.entries(data).slice(0, 5).map(([k, v]) => (
        <div key={k} style={{ fontSize: '12px', marginBottom: '2px' }}>
          <span style={{ color: '#0f766e', fontWeight: 600 }}>{k}: </span>
          <JsonPreview data={v} maxDepth={maxDepth} depth={depth + 1} />
        </div>
      ))}
      {Object.keys(data).length > 5 && <div style={{ color: '#94a3b8', fontSize: '11px' }}>...{Object.keys(data).length - 5} more fields</div>}
    </div>
  );
}

export default function AiHistoryPage() {
  const [history, setHistory] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [feature, setFeature] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async (page = 1, feat = feature) => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (feat) params.feature = feat;
      const res = await api.getAiHistory(params);
      setHistory(res.data || []);
      setPagination(res.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [feature]);

  useEffect(() => { load(1, feature); }, [feature]);

  const handleFeatureChange = (e) => {
    setFeature(e.target.value);
    setSelected(null);
  };

  const formatDate = (d) => new Date(d).toLocaleString();

  if (selected) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">📜 AI Analysis Detail</h1>
            <p className="page-subtitle">Review stored AI analysis result</p>
          </div>
        </div>
        <div className="page-body">
          <button className="back-btn" onClick={() => setSelected(null)}>← Back to history</button>
          <div className="card" style={{ marginTop: '16px' }}>
            <div className="card-header">
              <h3 className="card-title">{selected.feature.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</h3>
              <span style={{ color: '#64748b', fontSize: '12px' }}>{formatDate(selected.created_at)}</span>
            </div>
            <div className="card-body">
              <div style={{ marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>Input Parameters</div>
                <div style={{ background: '#f8fafc', borderRadius: '6px', padding: '12px', fontSize: '12px', fontFamily: 'monospace' }}>
                  {JSON.stringify(selected.input_data, null, 2)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>AI Result (Structured)</div>
                <div className="ai-output">
                  <div className="ai-output-content">
                    <pre style={{ fontSize: '12px', whiteSpace: 'pre-wrap', margin: 0 }}>
                      {JSON.stringify(selected.parsed_result, null, 2)}
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">📜 AI Analysis History</h1>
          <p className="page-subtitle">Browse all past AI analyses — {pagination.total} total</p>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <select
            className="form-select"
            style={{ width: '240px' }}
            value={feature}
            onChange={handleFeatureChange}
          >
            <option value="">All Features</option>
            {AI_FEATURES.filter(f => f).map(f => (
              <option key={f} value={f}>{f.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
            ))}
          </select>
          <span style={{ color: '#64748b', fontSize: '13px' }}>{pagination.total} analyses</span>
        </div>

        <div className="card">
          <div className="data-table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Input Summary</th>
                  <th>Result Preview</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>Loading...</td></tr>
                ) : history.length === 0 ? (
                  <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: '#94a3b8' }}>No AI analyses found. Run some analyses first!</td></tr>
                ) : (
                  history.map((item) => (
                    <tr key={item.id} onClick={() => setSelected(item)} style={{ cursor: 'pointer' }}>
                      <td className="cell-primary">
                        <span className="badge badge-info">
                          {item.feature.replace(/-/g, ' ')}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '200px' }}>
                        {item.input_data ? (
                          <span style={{ color: '#64748b' }}>
                            {Object.entries(item.input_data).slice(0, 2).map(([k, v]) => `${k}: ${String(v).substring(0, 30)}`).join(', ')}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ fontSize: '12px', maxWidth: '240px', color: '#374151' }}>
                        {item.parsed_result ? <JsonPreview data={item.parsed_result} /> : <span style={{ color: '#94a3b8' }}>No structured result</span>}
                      </td>
                      <td style={{ color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {formatDate(item.created_at)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {pagination.totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginTop: '16px' }}>
            <button className="btn btn-secondary btn-sm" disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)}>‹ Prev</button>
            <span style={{ padding: '6px 12px', fontSize: '13px', color: '#64748b' }}>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button className="btn btn-secondary btn-sm" disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)}>Next ›</button>
          </div>
        )}
      </div>
    </>
  );
}
