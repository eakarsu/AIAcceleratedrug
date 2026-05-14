import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';

function JsonViewer({ data, depth = 0 }) {
  if (data === null || data === undefined) return <span style={{ color: '#94a3b8' }}>null</span>;
  if (typeof data === 'boolean') return <span style={{ color: '#0891b2' }}>{String(data)}</span>;
  if (typeof data === 'number') return <span style={{ color: '#7c3aed' }}>{data}</span>;
  if (typeof data === 'string') {
    if (data.length > 200) return <span style={{ color: '#059669' }}>"{data.substring(0, 200)}..."</span>;
    return <span style={{ color: '#059669' }}>"{data}"</span>;
  }
  if (Array.isArray(data)) {
    if (data.length === 0) return <span>[]</span>;
    return (
      <div style={{ paddingLeft: depth > 0 ? '16px' : 0 }}>
        {data.map((item, i) => (
          <div key={i} style={{ marginBottom: '4px', borderLeft: '2px solid #e2e8f0', paddingLeft: '12px' }}>
            <JsonViewer data={item} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  if (typeof data === 'object') {
    return (
      <div style={{ paddingLeft: depth > 0 ? '16px' : 0 }}>
        {Object.entries(data).map(([key, val]) => (
          <div key={key} style={{ marginBottom: '6px' }}>
            <span style={{ color: '#0f766e', fontWeight: 600, fontSize: '12px' }}>
              {key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
            </span>{' '}
            <JsonViewer data={val} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }
  return <span>{String(data)}</span>;
}

function RiskBadge({ level }) {
  const colors = {
    'Low': '#059669', 'None': '#059669', 'Minor': '#0891b2', 'Mild': '#0891b2',
    'Medium': '#d97706', 'Moderate': '#d97706', 'moderate': '#d97706',
    'High': '#dc2626', 'Major': '#dc2626', 'Severe': '#dc2626', 'Critical': '#7c3aed',
    'Contraindicated': '#7c3aed',
  };
  const color = colors[level] || '#64748b';
  return (
    <span style={{
      background: `${color}15`,
      color,
      border: `1px solid ${color}40`,
      borderRadius: '6px',
      padding: '2px 10px',
      fontSize: '12px',
      fontWeight: 700,
    }}>
      {level}
    </span>
  );
}

export default function AiFeaturePage({ config }) {
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);
  const [rawResult, setRawResult] = useState(null);
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('structured'); // 'structured' | 'raw'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    setRawResult(null);
    try {
      const processedData = { ...formData };
      (config.fields || []).forEach((f) => {
        if (f.type === 'csv-array' && processedData[f.key]) {
          processedData[f.key] = String(processedData[f.key])
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map((s) => (isNaN(Number(s)) ? s : Number(s)));
        }
        if (f.type === 'json-array' && processedData[f.key]) {
          try { processedData[f.key] = JSON.parse(processedData[f.key]); } catch (_) {}
        }
      });
      const data = await api[config.apiCall](processedData);

      // Handle structured result (new format) or legacy string result
      if (data.result !== undefined) {
        if (typeof data.result === 'object' && data.result !== null) {
          setResult(data.result);
        } else if (typeof data.result === 'string') {
          // Try to parse as JSON
          try { setResult(JSON.parse(data.result)); } catch (_) { setResult(data.result); }
        } else {
          setResult(data);
        }
      } else {
        setResult(data);
      }
      setRawResult(data.raw || (typeof data.result === 'string' ? data.result : null));
      setModel(data.model || '');
    } catch (err) {
      setError(err.message || 'AI request failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setFormData({});
    setResult(null);
    setRawResult(null);
    setError('');
    setModel('');
  };

  const isStructured = result !== null && typeof result === 'object';

  // Extract top-level risk/severity for visual emphasis
  const riskField = result?.overall_risk || result?.severity || result?.risk_level || result?.confidence;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{config.icon} {config.title}</h1>
          <p className="page-subtitle">{config.subtitle}</p>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', alignItems: 'start' }}>
          {/* Input Form */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Input Parameters</h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="card-body">
                {config.fields.map((field) => (
                  <div className="form-group" key={field.key}>
                    <label className="form-label">{field.label}</label>
                    {(field.type === 'textarea' || field.type === 'json-array') ? (
                      <textarea
                        className="form-textarea"
                        placeholder={field.placeholder}
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        rows={field.rows || 3}
                      />
                    ) : field.type === 'select' ? (
                      <select
                        className="form-select"
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      >
                        <option value="">Select...</option>
                        {(field.options || []).map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        className="form-input"
                        placeholder={field.placeholder}
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                      />
                    )}
                  </div>
                ))}
              </div>
              <div className="modal-footer" style={{ borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-secondary" onClick={handleClear}>Clear</button>
                <button type="submit" className="btn btn-ai" disabled={loading}>
                  {loading ? 'Analyzing...' : 'Run AI Analysis'}
                </button>
              </div>
            </form>
          </div>

          {/* Results */}
          <div>
            {loading && (
              <div className="card">
                <div className="card-body">
                  <div className="ai-loading">
                    <div className="spinner"></div>
                    <span>AI is analyzing your request... This may take a moment.</span>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="card" style={{ borderColor: '#fecaca' }}>
                <div className="card-body">
                  <div style={{ color: '#b91c1c', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '20px' }}>⚠️</span>
                    <div>
                      <strong>Error</strong>
                      <p style={{ fontSize: '13px', marginTop: '4px' }}>{error}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {result !== null && !loading && (
              <div className="ai-output" style={{ border: '1px solid #c7d2fe' }}>
                <div className="ai-output-header" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div className="ai-icon">AI</div>
                  <h4 style={{ flex: 1 }}>{config.title} Results</h4>
                  {riskField && <RiskBadge level={riskField} />}
                  {model && <span className="model-badge" style={{ fontSize: '11px' }}>{model}</span>}
                  {isStructured && rawResult && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        className={`btn btn-sm ${viewMode === 'structured' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('structured')}
                      >
                        Structured
                      </button>
                      <button
                        className={`btn btn-sm ${viewMode === 'raw' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setViewMode('raw')}
                      >
                        Raw
                      </button>
                    </div>
                  )}
                </div>
                <div className="ai-output-content">
                  {viewMode === 'raw' && rawResult ? (
                    <ReactMarkdown>{rawResult}</ReactMarkdown>
                  ) : isStructured ? (
                    <JsonViewer data={result} />
                  ) : (
                    <ReactMarkdown>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</ReactMarkdown>
                  )}
                </div>
              </div>
            )}

            {result === null && !loading && !error && (
              <div className="card">
                <div className="card-body">
                  <div className="empty-state">
                    <div className="icon">{config.icon}</div>
                    <h3>Ready for Analysis</h3>
                    <p>Fill in the parameters and click "Run AI Analysis" to get AI-powered insights.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
