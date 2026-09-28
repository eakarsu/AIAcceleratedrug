const API_BASE = '/api';

function getHeaders() {
  const token = localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function request(url, options = {}) {
  const controller = new AbortController();
  // OpenRouter requests can legitimately take longer than ordinary CRUD calls.
  // The backend caps its two attempts below this limit so provider errors reach
  // the UI instead of being replaced by a premature browser-side timeout.
  const timeout = setTimeout(() => controller.abort(), 110000);
  try {
    const res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: getHeaders(),
      signal: options.signal || controller.signal,
    });
    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: 'Request failed' }));
      const validationMessage = Array.isArray(error.errors)
        ? error.errors.map((item) => item.msg || `${item.path || 'Input'} is invalid`).join(' · ')
        : '';
      throw new Error(error.error || validationMessage || `Request failed (HTTP ${res.status})`);
    }
    return res.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The request timed out. Please retry.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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
  aiDrugDesign: (data) => request('/ai/drug-design', { method: 'POST', body: JSON.stringify(data) }),
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

  // Central scientific discovery workbench
  getDiscoveryBootstrap: () => request('/discovery/bootstrap'),
  resolveScientificProtein: (data) => request('/discovery/resolve/protein', { method: 'POST', body: JSON.stringify(data) }),
  resolveScientificCompound: (data) => request('/discovery/resolve/compound', { method: 'POST', body: JSON.stringify(data) }),
  uploadScientificSdf: (data) => request('/discovery/resolve/sdf', { method: 'POST', body: JSON.stringify(data) }),
  getScientificEvidence: (proteinId, compoundId) => {
    const qs = new URLSearchParams();
    if (proteinId) qs.set('proteinId', proteinId);
    if (compoundId) qs.set('compoundId', compoundId);
    return request(`/discovery/evidence?${qs.toString()}`);
  },
  getScientificStructures: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return request(`/discovery/structures${qs ? `?${qs}` : ''}`);
  },
  analyzeScientificProtein: (data) => request('/discovery/protein-analyst', { method: 'POST', body: JSON.stringify(data) }),
  enrichScientificEvidence: (data) => request('/discovery/enrich/evidence', { method: 'POST', body: JSON.stringify(data) }),
  getScientificEvidenceLibrary: (proteinId, compoundId) => request(`/discovery/evidence/library?proteinId=${encodeURIComponent(proteinId)}&compoundId=${encodeURIComponent(compoundId)}`),
  searchScientificChemistry: (data) => request('/discovery/search/chemistry', { method: 'POST', body: JSON.stringify(data) }),
  searchScientificProteins: (data) => request('/discovery/search/proteins', { method: 'POST', body: JSON.stringify(data) }),
  runScientificPrediction: (data) => request('/discovery/predictions', { method: 'POST', body: JSON.stringify(data) }),
  getScientificPredictions: () => request('/discovery/predictions'),
  saveDiscoveryCandidate: (data) => request('/discovery/candidates', { method: 'POST', body: JSON.stringify(data) }),
  getDiscoveryOperations: () => request('/discovery/operations'),
  createDiscoveryProject: (data) => request('/discovery/projects', { method: 'POST', body: JSON.stringify(data) }),
  createScientificAssay: (data) => request('/discovery/assays', { method: 'POST', body: JSON.stringify(data) }),
  createScientificExperiment: (data) => request('/discovery/experiments', { method: 'POST', body: JSON.stringify(data) }),
  updateDiscoveryOperationStatus: (kind, id, status) => request(`/discovery/operations/${kind}/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  reviewScientificPrediction: (id, data) => request(`/discovery/predictions/${id}/reviews`, { method: 'POST', body: JSON.stringify(data) }),
  getScientificProvenance: () => request('/discovery/provenance'),

  // Advanced, auditable discovery workflows
  getAdvancedDiscoveryBootstrap: () => request('/discovery/advanced/bootstrap'),
  runAdvancedScreening: (data) => request('/discovery/advanced/screenings', { method: 'POST', body: JSON.stringify(data) }),
  runAdvancedOptimization: (data) => request('/discovery/advanced/optimizations', { method: 'POST', body: JSON.stringify(data) }),
  runAdvancedWorkflowJob: (data) => request('/discovery/advanced/jobs', { method: 'POST', body: JSON.stringify(data) }),
  getAdvancedWorkflowJob: (id) => request(`/discovery/advanced/jobs/${encodeURIComponent(id)}`),
  cancelAdvancedWorkflowJob: (id) => request(`/discovery/advanced/jobs/${encodeURIComponent(id)}/cancel`, { method: 'POST' }),
  retryAdvancedWorkflowJob: (id) => request(`/discovery/advanced/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  downloadScientificArtifact: async (artifact) => {
    const token=localStorage.getItem('token');
    const response=await fetch(artifact.downloadUrl,{headers:token?{Authorization:`Bearer ${token}`}:{}});
    if (!response.ok) throw new Error(`Artifact download failed with HTTP ${response.status}`);
    const blob=await response.blob(); const url=URL.createObjectURL(blob); const anchor=document.createElement('a');
    anchor.href=url; anchor.download=artifact.filename || `scientific-artifact.${String(artifact.format || 'bin').toLowerCase()}`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  },
  exportAdvancedWorkflowJob: async (id, format='pdf') => {
    const token=localStorage.getItem('token'); const response=await fetch(`/api/discovery/advanced/jobs/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`,
      {headers:token?{Authorization:`Bearer ${token}`}:{}});
    if (!response.ok) throw new Error(`Report export failed with HTTP ${response.status}`);
    const blob=await response.blob(); const url=URL.createObjectURL(blob); const anchor=document.createElement('a');
    anchor.href=url; anchor.download=`scientific-job-${id}.${format}`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
  },
  createScientificDataset: (data) => request('/discovery/advanced/datasets', { method: 'POST', body: JSON.stringify(data) }),
  createModelValidation: (data) => request('/discovery/advanced/validations', { method: 'POST', body: JSON.stringify(data) }),
  reviewAdvancedWorkflow: (data) => request('/discovery/advanced/reviews', { method: 'POST', body: JSON.stringify(data) }),
};
