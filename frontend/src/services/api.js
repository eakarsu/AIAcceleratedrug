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

  // Generic CRUD
  getAll: (resource) => request(`/${resource}`),
  getOne: (resource, id) => request(`/${resource}/${id}`),
  create: (resource, data) => request(`/${resource}`, { method: 'POST', body: JSON.stringify(data) }),
  update: (resource, id, data) => request(`/${resource}/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (resource, id) => request(`/${resource}/${id}`, { method: 'DELETE' }),

  // Dashboard
  getStats: () => request('/dashboard/stats'),
  getRecentActivity: () => request('/dashboard/recent-activity'),

  // AI Features
  aiProteinDesign: (data) => request('/ai/protein-design', { method: 'POST', body: JSON.stringify(data) }),
  aiBindingAffinity: (data) => request('/ai/binding-affinity', { method: 'POST', body: JSON.stringify(data) }),
  aiToxicityPrediction: (data) => request('/ai/toxicity-prediction', { method: 'POST', body: JSON.stringify(data) }),
  aiStructurePrediction: (data) => request('/ai/structure-prediction', { method: 'POST', body: JSON.stringify(data) }),
  aiDrugInteraction: (data) => request('/ai/drug-interaction', { method: 'POST', body: JSON.stringify(data) }),
  aiAdmetPrediction: (data) => request('/ai/admet-prediction', { method: 'POST', body: JSON.stringify(data) }),
  aiLiteratureAnalysis: (data) => request('/ai/literature-analysis', { method: 'POST', body: JSON.stringify(data) }),
};
