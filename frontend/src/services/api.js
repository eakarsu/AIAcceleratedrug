const API_BASE = '/api';

function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: getHeaders(),
  });
  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Auth
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),

  // Generic CRUD — returns { data, pagination }
  getAll: (resource, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/${resource}${qs ? '?' + qs : ''}`);
  },
  getOne: (resource, id) => request(`/${resource}/${id}`),
  create: (resource, data) => request(`/${resource}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (resource, id, data) => request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE' }),

  // Dashboard
  getStats: () => request('/dashboard/stats'),
  getRecentActivity: () => request('/dashboard/recent-activity'),
  getSafetyAlerts: () => request('/dashboard/safety-alerts'),

  // Drug candidate pipeline view
  getPipeline: () => request('/drug-candidates/pipeline'),

  // Compound similarity search
  getSimilarCompounds: (smiles) => request(`/compounds/similar?smiles=${encodeURIComponent(smiles)}`),

  // AI History
  getAiHistory: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/ai/history${qs ? '?' + qs : ''}`);
  },

  // AI Features
  aiProteinDesign: (data) => request('/ai/protein-design', { method: 'POST', body: JSON.stringify(data) }),
  aiBindingAffinity: (data) => request('/ai/binding-affinity', { method: 'POST', body: JSON.stringify(data) }),
  aiToxicityPrediction: (data) => request('/ai/toxicity-prediction', { method: 'POST', body: JSON.stringify(data) }),
  aiStructurePrediction: (data) => request('/ai/structure-prediction', { method: 'POST', body: JSON.stringify(data) }),
  aiDrugInteraction: (data) => request('/ai/drug-interaction', { method: 'POST', body: JSON.stringify(data) }),
  aiAdmetPrediction: (data) => request('/ai/admet-prediction', { method: 'POST', body: JSON.stringify(data) }),
  aiLiteratureAnalysis: (data) => request('/ai/literature-analysis', { method: 'POST', body: JSON.stringify(data) }),

  // Custom Non-CRUD AI features
  aiValidateSequence: (data) => request('/ai/validate-sequence', { method: 'POST', body: JSON.stringify(data) }),
  aiRankCandidates: (data) => request('/ai/rank-candidates', { method: 'POST', body: JSON.stringify(data) }),
  aiPredictSolubility: (data) => request('/ai/predict-solubility', { method: 'POST', body: JSON.stringify(data) }),
  aiDockProtein: (data) => request('/ai/dock-protein', { method: 'POST', body: JSON.stringify(data) }),
  aiPredictOffTargets: (data) => request('/ai/predict-off-targets', { method: 'POST', body: JSON.stringify(data) }),
  aiRecommendFormulation: (data) => request('/ai/recommend-formulation', { method: 'POST', body: JSON.stringify(data) }),
  aiPatentLandscape: (data) => request('/ai/patent-landscape', { method: 'POST', body: JSON.stringify(data) }),
  aiVirtualHts: (data) => request('/ai/virtual-hts', { method: 'POST', body: JSON.stringify(data) }),

  // NEW AI features
  aiSarAnalysis: (data) => request('/ai/sar-analysis', { method: 'POST', body: JSON.stringify(data) }),
  aiClinicalTrialDesign: (data) => request('/ai/clinical-trial-design', { method: 'POST', body: JSON.stringify(data) }),
  aiCompetitiveIntelligence: (data) => request('/ai/competitive-intelligence', { method: 'POST', body: JSON.stringify(data) }),
  aiRegulatoryPathway: (data) => request('/ai/regulatory-pathway', { method: 'POST', body: JSON.stringify(data) }),

  // Apply pass 5 — backlog endpoints
  aiVirtualScreening: (data) => request('/ai/virtual-screening', { method: 'POST', body: JSON.stringify(data) }),
  aiPubchemLookup: (data) => request('/ai/pubchem-lookup', { method: 'POST', body: JSON.stringify(data) }),
  aiPredictiveTrialSuccess: (data) => request('/ai/predictive-trial-success', { method: 'POST', body: JSON.stringify(data) }),
  aiLabAutomationPlan: (data) => request('/ai/lab-automation-plan', { method: 'POST', body: JSON.stringify(data) }),
  aiMultiObjectiveOptimize: (data) => request('/ai/multi-objective-optimize', { method: 'POST', body: JSON.stringify(data) }),

  // Drug interactions alerts
  getInteractionAlerts: () => request('/drug-interactions/alerts'),
};
