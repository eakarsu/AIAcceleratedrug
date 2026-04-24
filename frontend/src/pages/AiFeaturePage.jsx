import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { api } from '../services/api';

export default function AiFeaturePage({ config }) {
  const [formData, setFormData] = useState({});
  const [result, setResult] = useState(null);
  const [model, setModel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api[config.apiCall](formData);
      setResult(data.result);
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
    setError('');
    setModel('');
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">{config.icon} {config.title}</h1>
          <p className="page-subtitle">{config.subtitle}</p>
        </div>
      </div>

      <div className="page-body">
        <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '24px', alignItems: 'start' }}>
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
                    {field.type === 'textarea' ? (
                      <textarea
                        className="form-textarea"
                        placeholder={field.placeholder}
                        value={formData[field.key] || ''}
                        onChange={(e) => setFormData({ ...formData, [field.key]: e.target.value })}
                        rows={3}
                      />
                    ) : (
                      <input
                        type="text"
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

            {result && !loading && (
              <div className="ai-output" style={{ border: '1px solid #c7d2fe' }}>
                <div className="ai-output-header">
                  <div className="ai-icon">AI</div>
                  <h4>{config.title} Results</h4>
                  {model && <span className="model-badge">{model}</span>}
                </div>
                <div className="ai-output-content">
                  <ReactMarkdown>{result}</ReactMarkdown>
                </div>
              </div>
            )}

            {!result && !loading && !error && (
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
