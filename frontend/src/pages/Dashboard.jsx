import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const featureCards = [
  { path: '/proteins', icon: '🧬', label: 'Protein Design', desc: 'AI-designed novel therapeutic proteins', color: '#0f766e', bg: '#f0fdfa' },
  { path: '/targets', icon: '🎯', label: 'Drug Targets', desc: 'Validated therapeutic target database', color: '#dc2626', bg: '#fef2f2' },
  { path: '/drug-candidates', icon: '💊', label: 'Drug Candidates', desc: 'Pipeline drug candidate management', color: '#7c3aed', bg: '#f5f3ff' },
  { path: '/screenings', icon: '🔬', label: 'Molecular Screening', desc: 'HTS and virtual screening campaigns', color: '#2563eb', bg: '#eff6ff' },
  { path: '/compounds', icon: '⚗️', label: 'Compound Library', desc: 'Chemical compound collection', color: '#ea580c', bg: '#fff7ed' },
  { path: '/binding-affinities', icon: '🔗', label: 'Binding Affinities', desc: 'Protein-target binding measurements', color: '#0891b2', bg: '#ecfeff' },
  { path: '/toxicity', icon: '☠️', label: 'Toxicity Predictions', desc: 'AI-powered safety assessments', color: '#be123c', bg: '#fff1f2' },
  { path: '/structures', icon: '🏗️', label: 'Protein Structures', desc: '3D protein structure predictions', color: '#4f46e5', bg: '#eef2ff' },
  { path: '/clinical-trials', icon: '🏥', label: 'Clinical Trials', desc: 'Clinical trial program tracker', color: '#059669', bg: '#ecfdf5' },
  { path: '/projects', icon: '📋', label: 'Research Projects', desc: 'R&D project management', color: '#d97706', bg: '#fffbeb' },
  { path: '/experiments', icon: '🧪', label: 'Lab Experiments', desc: 'Experimental protocols & results', color: '#9333ea', bg: '#faf5ff' },
  { path: '/drug-interactions', icon: '⚠️', label: 'Drug Interactions', desc: 'Drug-drug interaction analysis', color: '#e11d48', bg: '#fff1f2' },
  { path: '/admet', icon: '📈', label: 'ADMET Properties', desc: 'Pharmacokinetic property profiles', color: '#0d9488', bg: '#f0fdfa' },
  { path: '/literature', icon: '📚', label: 'Literature', desc: 'Scientific publication database', color: '#6366f1', bg: '#eef2ff' },
];

const aiCards = [
  { path: '/ai-protein-design', icon: '🧬', label: 'AI Protein Design', desc: 'Generate novel protein sequences', color: '#6366f1' },
  { path: '/ai-binding-affinity', icon: '🔗', label: 'AI Binding Affinity', desc: 'Predict binding strength', color: '#8b5cf6' },
  { path: '/ai-toxicity', icon: '☠️', label: 'AI Toxicity Predict', desc: 'Assess compound safety', color: '#a855f7' },
  { path: '/ai-structure', icon: '🏗️', label: 'AI Structure Predict', desc: 'Predict 3D protein structure', color: '#7c3aed' },
  { path: '/ai-drug-interaction', icon: '⚠️', label: 'AI Drug Interaction', desc: 'Check drug interactions', color: '#6d28d9' },
  { path: '/ai-admet', icon: '💊', label: 'AI ADMET Predict', desc: 'Predict PK properties', color: '#5b21b6' },
  { path: '/ai-literature', icon: '📚', label: 'AI Literature', desc: 'Research landscape analysis', color: '#4c1d95' },
];

const advancedAiCards = [
  { path: '/ai-validate-sequence', icon: '✅', label: 'Sequence Validator', desc: 'Validate protein/DNA/RNA sequences', color: '#0891b2' },
  { path: '/ai-rank-candidates', icon: '🏆', label: 'Candidate Ranker', desc: 'Multi-objective candidate ranking', color: '#0e7490' },
  { path: '/ai-predict-solubility', icon: '💧', label: 'Solubility Predict', desc: 'Aqueous solubility from SMILES', color: '#0284c7' },
  { path: '/ai-dock-protein', icon: '🧲', label: 'Docking Integrator', desc: 'In-silico docking simulation', color: '#0369a1' },
  { path: '/ai-predict-off-targets', icon: '🎯', label: 'Off-Target Predict', desc: 'Off-target screening (ChEMBL)', color: '#075985' },
  { path: '/ai-recommend-formulation', icon: '🧴', label: 'Formulation Recom', desc: 'Excipients & stability profile', color: '#0c4a6e' },
  { path: '/ai-patent-landscape', icon: '📜', label: 'Patent Landscape', desc: 'IP analysis & FTO check', color: '#1e3a8a' },
  { path: '/ai-virtual-hts', icon: '🧪', label: 'Virtual HTS Sim', desc: 'In-silico HTS across libraries', color: '#1e40af' },
];

const newAiCards = [
  { path: '/ai-sar-analysis', icon: '🔬', label: 'SAR Analyzer', desc: 'Structure-Activity Relationship analysis', color: '#0f766e' },
  { path: '/ai-clinical-trial-design', icon: '🏥', label: 'Trial Designer', desc: 'AI-designed clinical trial protocols', color: '#059669' },
  { path: '/ai-competitive-intelligence', icon: '🕵️', label: 'Competitive Intel', desc: 'Competitive landscape & market analysis', color: '#0d9488' },
  { path: '/ai-regulatory-pathway', icon: '📋', label: 'Regulatory Advisor', desc: 'FDA/EMA regulatory pathway analysis', color: '#047857' },
  { path: '/ai-history', icon: '📜', label: 'AI History', desc: 'Browse all past AI analyses', color: '#065f46' },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [safetyAlerts, setSafetyAlerts] = useState(null);

  useEffect(() => {
    api.getStats().then(setStats).catch(console.error);
    api.getRecentActivity().then(setActivity).catch(console.error);
    api.getSafetyAlerts().then(setSafetyAlerts).catch(console.error);
  }, []);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">AI-Accelerated Drug Discovery Platform Overview</p>
        </div>
      </div>
      <div className="page-body">
        {stats && (
          <>
            <div className="dashboard-grid">
              {[
                { label: 'Proteins', value: stats.proteins, icon: '🧬', color: '#0f766e', bg: '#f0fdfa', path: '/proteins' },
                { label: 'Drug Targets', value: stats.targets, icon: '🎯', color: '#dc2626', bg: '#fef2f2', path: '/targets' },
                { label: 'Drug Candidates', value: stats.drugCandidates, icon: '💊', color: '#7c3aed', bg: '#f5f3ff', path: '/drug-candidates' },
                { label: 'Clinical Trials', value: stats.clinicalTrials, icon: '🏥', color: '#059669', bg: '#ecfdf5', path: '/clinical-trials' },
                { label: 'Compounds', value: stats.compounds, icon: '⚗️', color: '#ea580c', bg: '#fff7ed', path: '/compounds' },
                { label: 'Projects', value: stats.projects, icon: '📋', color: '#d97706', bg: '#fffbeb', path: '/projects' },
                { label: 'Experiments', value: stats.experiments, icon: '🧪', color: '#9333ea', bg: '#faf5ff', path: '/experiments' },
                { label: 'Screenings', value: stats.screenings, icon: '🔬', color: '#2563eb', bg: '#eff6ff', path: '/screenings' },
              ].map((s) => (
                <div key={s.label} className="stat-card" onClick={() => navigate(s.path)}>
                  <div className="stat-card-icon" style={{ background: s.bg, color: s.color }}>
                    {s.icon}
                  </div>
                  <div className="stat-card-value">{s.value}</div>
                  <div className="stat-card-label">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Safety Alerts Banner */}
            {stats.safetyAlerts > 0 && (
              <div style={{
                background: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '24px',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}>
                <span style={{ fontSize: '20px' }}>🚨</span>
                <div>
                  <strong style={{ color: '#b91c1c' }}>{stats.safetyAlerts} Safety Alert{stats.safetyAlerts > 1 ? 's' : ''}</strong>
                  <span style={{ color: '#64748b', marginLeft: '8px', fontSize: '13px' }}>
                    Severe or contraindicated drug interactions detected
                  </span>
                </div>
                <button
                  className="btn btn-danger btn-sm"
                  style={{ marginLeft: 'auto' }}
                  onClick={() => navigate('/drug-interactions')}
                >
                  View Alerts
                </button>
              </div>
            )}

            {/* Phase Distribution */}
            {stats.phaseDistribution && stats.phaseDistribution.length > 0 && (
              <div className="card" style={{ marginBottom: '24px' }}>
                <div className="card-header">
                  <h3 className="card-title">Drug Pipeline Distribution</h3>
                </div>
                <div className="card-body" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  {stats.phaseDistribution.map(({ phase, count }) => (
                    <div key={phase} style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      textAlign: 'center',
                      minWidth: '110px',
                      cursor: 'pointer',
                    }} onClick={() => navigate('/drug-candidates')}>
                      <div style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a' }}>{count}</div>
                      <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>{phase}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>AI-Powered Tools</h2>
        <div className="feature-grid" style={{ marginBottom: '32px' }}>
          {aiCards.map((card) => (
            <div key={card.path} className="feature-card" onClick={() => navigate(card.path)}>
              <div className="feature-card-icon" style={{ background: `${card.color}15`, color: card.color }}>
                {card.icon}
              </div>
              <h3>{card.label}</h3>
              <p>{card.desc}</p>
              <span className="badge" style={{ background: `${card.color}15`, color: card.color }}>AI Powered</span>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>Advanced AI Tools</h2>
        <div className="feature-grid" style={{ marginBottom: '32px' }}>
          {advancedAiCards.map((card) => (
            <div key={card.path} className="feature-card" onClick={() => navigate(card.path)}>
              <div className="feature-card-icon" style={{ background: `${card.color}15`, color: card.color }}>
                {card.icon}
              </div>
              <h3>{card.label}</h3>
              <p>{card.desc}</p>
              <span className="badge" style={{ background: `${card.color}15`, color: card.color }}>Advanced</span>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>New Capabilities</h2>
        <div className="feature-grid" style={{ marginBottom: '32px' }}>
          {newAiCards.map((card) => (
            <div key={card.path} className="feature-card" onClick={() => navigate(card.path)}>
              <div className="feature-card-icon" style={{ background: `${card.color}15`, color: card.color }}>
                {card.icon}
              </div>
              <h3>{card.label}</h3>
              <p>{card.desc}</p>
              <span className="badge badge-success">NEW</span>
            </div>
          ))}
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '16px' }}>All Features</h2>
        <div className="feature-grid" style={{ marginBottom: '32px' }}>
          {featureCards.map((card) => (
            <div key={card.path} className="feature-card" onClick={() => navigate(card.path)}>
              <div className="feature-card-icon" style={{ background: card.bg, color: card.color }}>
                {card.icon}
              </div>
              <h3>{card.label}</h3>
              <p>{card.desc}</p>
            </div>
          ))}
        </div>

        {/* Safety Alerts Detail */}
        {safetyAlerts && (safetyAlerts.high_toxicity_compounds.length > 0 || safetyAlerts.severe_interactions.length > 0) && (
          <div className="card" style={{ marginBottom: '24px', borderColor: '#fecaca' }}>
            <div className="card-header" style={{ background: '#fef2f2' }}>
              <h3 className="card-title" style={{ color: '#b91c1c' }}>🚨 Active Safety Alerts</h3>
            </div>
            <div className="card-body">
              {safetyAlerts.high_toxicity_compounds.length > 0 && (
                <>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c', marginBottom: '8px' }}>High-Risk Compounds</h4>
                  {safetyAlerts.high_toxicity_compounds.map((c, i) => (
                    <div key={i} style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: 600 }}>{c.compound_name}</span>
                      <span style={{ color: '#b91c1c', fontWeight: 700 }}>{c.risk_level}</span>
                    </div>
                  ))}
                </>
              )}
              {safetyAlerts.severe_interactions.length > 0 && (
                <>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#b91c1c', marginTop: '12px', marginBottom: '8px' }}>Severe Drug Interactions</h4>
                  {safetyAlerts.severe_interactions.map((d, i) => (
                    <div key={i} style={{ background: '#fff1f2', border: '1px solid #fecaca', borderRadius: '6px', padding: '8px 12px', marginBottom: '6px' }}>
                      <div style={{ fontWeight: 600 }}>{d.drug_a} + {d.drug_b}</div>
                      <div style={{ fontSize: '12px', color: '#b91c1c' }}>{d.severity}</div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        )}

        {activity.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Recent Activity</h3>
            </div>
            <div className="data-table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Name</th>
                    <th>Status</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {activity.slice(0, 10).map((item, i) => (
                    <tr key={i}>
                      <td><span className="badge badge-info">{item.type}</span></td>
                      <td className="cell-primary">{item.name}</td>
                      <td><span className="badge badge-primary">{item.status}</span></td>
                      <td style={{ color: '#64748b', fontSize: '12px' }}>{new Date(item.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
