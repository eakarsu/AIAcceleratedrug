import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';
import { AI_EXAMPLE_SCENARIOS, buildAiExample } from '../utils/aiExamples';
import AIDesignVisualization from '../components/AIDesignVisualization';

function humanize(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function displayValue(value) {
  if (value === null || value === undefined || value === '') return 'Not reported';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

function StructuredBlock({ label, value, depth = 0 }) {
  if (Array.isArray(value)) {
    return (
      <section className={`ai-report-section depth-${Math.min(depth, 2)}`}>
        {label && <h3>{humanize(label)}</h3>}
        {value.length === 0 ? <p className="ai-report-empty">No items reported.</p> : (
          <div className="ai-report-list">
            {value.map((item, index) => (
              typeof item === 'object' && item !== null
                ? <article className="ai-report-item" key={`${label}-${index}`}><StructuredBlock value={item} depth={depth + 1} /></article>
                : <div className="ai-report-bullet" key={`${label}-${index}`}><span>✓</span><p>{displayValue(item)}</p></div>
            ))}
          </div>
        )}
      </section>
    );
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <section className={`ai-report-section depth-${Math.min(depth, 2)}`}>
        {label && <h3>{humanize(label)}</h3>}
        <div className="ai-report-grid">
          {Object.entries(value).map(([key, nestedValue]) => (
            typeof nestedValue === 'object' && nestedValue !== null
              ? <StructuredBlock key={key} label={key} value={nestedValue} depth={depth + 1} />
              : <div className="ai-report-metric" key={key}><span>{humanize(key)}</span><strong>{displayValue(nestedValue)}</strong></div>
          ))}
        </div>
      </section>
    );
  }

  return <div className="ai-report-metric"><span>{humanize(label)}</span><strong>{displayValue(value)}</strong></div>;
}

function ProfessionalAIReport({ data }) {
  const headline = data.headline || data.title || data.protein_name || data.recommendation || null;
  const summaryKey = ['executiveSummary', 'executive_summary', 'summary', 'overall_assessment', 'overall_reasoning', 'overview']
    .find((key) => typeof data[key] === 'string');
  const excluded = new Set(['headline', 'title', 'protein_name', 'recommendation', summaryKey].filter(Boolean));

  return (
    <div className="ai-professional-report">
      {(headline || summaryKey) && (
        <header className="ai-report-hero">
          <span>Decision brief</span>
          {headline && <h2>{headline}</h2>}
          {summaryKey && <p>{data[summaryKey]}</p>}
        </header>
      )}
      <div className="ai-report-sections">
        {Object.entries(data)
          .filter(([key]) => !excluded.has(key))
          .map(([key, value]) => <StructuredBlock key={key} label={key} value={value} />)}
      </div>
      <footer className="ai-report-boundary">
        <strong>Research-use boundary</strong>
        <span>Validate this AI output against source records, configured scientific models, and accountable expert review before making research, clinical, or regulatory decisions.</span>
      </footer>
    </div>
  );
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

class AIResultBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unable to render AI result', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="ai-result-render-error" role="alert">
          <strong>The analysis completed, but one result field could not be displayed.</strong>
          <p>Open the Raw view to inspect the provider response, then retry the analysis.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export function normalizeRiskBadge(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'object') return value.level || value.label || value.value || null;
  return value;
}

export default function AiFeaturePage({ config }) {
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);
  const [rawResult, setRawResult] = useState(null);
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useState('structured'); // 'structured' | 'raw'
  const outputRef = useRef(null);

  useEffect(() => {
    setFormData({});
    setResult(null);
    setRawResult(null);
    setError('');
    setModel('');
    setViewMode('structured');
  }, [config.apiCall]);

  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return undefined;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if ((result !== null || error) && outputRef.current) {
      outputRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [error, result]);

  const fillExample = (scenarioKey) => {
    setFormData(buildAiExample(config, scenarioKey));
    setResult(null);
    setRawResult(null);
    setError('');
    setModel('');
    setViewMode('structured');
  };

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
  const riskField = normalizeRiskBadge(
    result?.overall_risk || result?.severity || result?.risk_level || result?.confidence
  );

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{config.icon} {config.title}</h1>
          <p className="page-subtitle">{config.subtitle}</p>
        </div>
      </div>

      <div className="page-body">
        <div className="ai-feature-grid">
          {/* Input Form */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Input Parameters</h3>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="card-body">
                <div className="ai-example-panel">
                  <div>
                    <strong>Complete example scenarios</strong>
                    <span>Each option fills every input, including optional fields.</span>
                  </div>
                  <div className="ai-example-actions">
                    {AI_EXAMPLE_SCENARIOS.map((scenario) => (
                      <button
                        key={scenario.key}
                        type="button"
                        className={`ai-example-button ${scenario.tone}`}
                        onClick={() => fillExample(scenario.key)}
                      >
                        {scenario.label}
                      </button>
                    ))}
                  </div>
                </div>
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
                        step={field.type === 'number' ? (field.step || 'any') : undefined}
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
          <div ref={outputRef} className="ai-result-panel" aria-live="polite">
            {loading && (
              <div className="card">
                <div className="card-body">
                  <div className="ai-loading">
                    <div className="spinner"></div>
                    <span>
                      {elapsedSeconds < 20
                        ? 'AI is generating and validating the molecular design…'
                        : elapsedSeconds < 55
                          ? 'OpenRouter is still working. Keep this page open…'
                          : 'The provider is taking longer than usual; the server will retry once automatically…'}
                      <small>{elapsedSeconds}s elapsed</small>
                    </span>
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
                  <AIResultBoundary key={`${config.apiCall}-${viewMode}-${rawResult?.length || 0}`}>
                    {viewMode === 'structured' && isStructured && (
                      <AIDesignVisualization config={config} result={result} formData={formData} />
                    )}
                    {viewMode === 'raw' && rawResult ? (
                      <ReactMarkdown>{rawResult}</ReactMarkdown>
                    ) : isStructured ? (
                      <ProfessionalAIReport data={result} />
                    ) : (
                      <ReactMarkdown>{typeof result === 'string' ? result : JSON.stringify(result, null, 2)}</ReactMarkdown>
                    )}
                  </AIResultBoundary>
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
