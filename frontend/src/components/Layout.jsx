import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const navSections = [
  {
    title: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: '📊' },
    ],
  },
  {
    title: 'Discovery',
    items: [
      { path: '/proteins', label: 'Protein Design', icon: '🧬' },
      { path: '/targets', label: 'Drug Targets', icon: '🎯' },
      { path: '/drug-candidates', label: 'Drug Candidates', icon: '💊' },
      { path: '/screenings', label: 'Molecular Screening', icon: '🔬' },
      { path: '/compounds', label: 'Compound Library', icon: '⚗️' },
    ],
  },
  {
    title: 'Analysis',
    items: [
      { path: '/binding-affinities', label: 'Binding Affinities', icon: '🔗' },
      { path: '/toxicity', label: 'Toxicity Data', icon: '☠️' },
      { path: '/structures', label: 'Protein Structures', icon: '🏗️' },
      { path: '/drug-interactions', label: 'Drug Interactions', icon: '⚠️' },
      { path: '/admet', label: 'ADMET Properties', icon: '📈' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { path: '/clinical-trials', label: 'Clinical Trials', icon: '🏥' },
      { path: '/projects', label: 'Research Projects', icon: '📋' },
      { path: '/experiments', label: 'Lab Experiments', icon: '🧪' },
      { path: '/literature', label: 'Literature', icon: '📚' },
    ],
  },
  {
    title: 'AI Tools',
    items: [
      { path: '/ai-protein-design', label: 'AI Protein Design', icon: '🤖', badge: 'AI' },
      { path: '/ai-binding-affinity', label: 'AI Binding Affinity', icon: '🤖', badge: 'AI' },
      { path: '/ai-toxicity', label: 'AI Toxicity Predict', icon: '🤖', badge: 'AI' },
      { path: '/ai-structure', label: 'AI Structure Predict', icon: '🤖', badge: 'AI' },
      { path: '/ai-drug-interaction', label: 'AI Drug Interaction', icon: '🤖', badge: 'AI' },
      { path: '/ai-admet', label: 'AI ADMET Predict', icon: '🤖', badge: 'AI' },
      { path: '/ai-literature', label: 'AI Literature', icon: '🤖', badge: 'AI' },
    ],
  },
  {
    title: 'Advanced AI',
    items: [
      { path: '/ai-validate-sequence', label: 'Sequence Validator', icon: '✅', badge: 'NEW' },
      { path: '/ai-rank-candidates', label: 'Candidate Ranker', icon: '🏆', badge: 'NEW' },
      { path: '/ai-predict-solubility', label: 'Solubility Predict', icon: '💧', badge: 'NEW' },
      { path: '/ai-dock-protein', label: 'Docking Integrator', icon: '🧲', badge: 'NEW' },
      { path: '/ai-predict-off-targets', label: 'Off-Target Predict', icon: '🎯', badge: 'NEW' },
      { path: '/ai-recommend-formulation', label: 'Formulation Recom', icon: '🧴', badge: 'NEW' },
      { path: '/ai-patent-landscape', label: 'Patent Landscape', icon: '📜', badge: 'NEW' },
      { path: '/ai-virtual-hts', label: 'Virtual HTS Sim', icon: '🧪', badge: 'NEW' },
    ],
  },
  {
    title: 'New Capabilities',
    items: [
      { path: '/ai-sar-analysis', label: 'SAR Analyzer', icon: '🔬', badge: 'NEW' },
      { path: '/ai-clinical-trial-design', label: 'Trial Designer', icon: '🏥', badge: 'NEW' },
      { path: '/ai-competitive-intelligence', label: 'Competitive Intel', icon: '🕵️', badge: 'NEW' },
      { path: '/ai-regulatory-pathway', label: 'Regulatory Advisor', icon: '📋', badge: 'NEW' },
      { path: '/ai-history', label: 'AI History', icon: '📜', badge: 'NEW' },
    ],
  },
  {
    title: 'Custom Views',
    items: [
      { path: '/custom-views', label: 'Pipeline Views', icon: '🧪', badge: 'NEW' },
    ],
  },
  {
    title: 'Backlog (Pass 5)',
    items: [
      { path: '/ai-virtual-screening', label: 'Virtual Screening', icon: '🧬', badge: 'NEW' },
      { path: '/ai-pubchem-lookup', label: 'PubChem Lookup', icon: '🔍', badge: 'NEW' },
      { path: '/ai-predictive-trial-success', label: 'Trial Success', icon: '📊', badge: 'NEW' },
      { path: '/ai-lab-automation-plan', label: 'Lab Automation', icon: '🤖', badge: 'NEW' },
      { path: '/ai-multi-objective-optimize', label: 'Multi-Obj Optimize', icon: '🎯', badge: 'NEW' },
    ],
  },
];

export default function Layout({ children, onLogout }) {
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="logo-icon">Rx</div>
            <div>
              <h1>DrugDiscovery AI</h1>
              <span>Accelerated R&D Platform</span>
            </div>
          </div>
        </div>

        <nav>
          {navSections.map((section) => (
            <div className="sidebar-section" key={section.title}>
              <div className="sidebar-section-title">{section.title}</div>
              <ul className="sidebar-nav">
                {section.items.map((item) => (
                  <li key={item.path}>
                    <Link
                      to={item.path}
                      className={location.pathname === item.path ? 'active' : ''}
                    >
                      <span className="nav-icon">{item.icon}</span>
                      {item.label}
                      {item.badge && <span className="sidebar-badge">{item.badge}</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="sidebar-user-info">
            <div className="sidebar-avatar">
              {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <div className="sidebar-user-name">{user.name || 'User'}</div>
              <div className="sidebar-user-role">{user.role || 'researcher'}</div>
            </div>
            <button
              onClick={onLogout}
              style={{
                marginLeft: 'auto',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                color: '#94a3b8',
                padding: '6px 10px',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </aside>

      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
