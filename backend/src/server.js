require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { default: rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { Pool } = require('pg');

// Validate critical env vars at startup
if (!process.env.OPENROUTER_API_KEY) {
  console.warn('[WARN] OPENROUTER_API_KEY not set. AI features will fail.');
}
if (!process.env.JWT_SECRET) {
  console.warn('[WARN] JWT_SECRET not set — using insecure default. Set it in .env for production.');
}

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Allow SPA to load inline scripts
}));

// CORS — restrict to client origin in production
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// Use ipKeyGenerator from express-rate-limit for IPv6 safety
function makeKey(req) {
  if (req.user) return `user-${req.user.id}`;
  return ipKeyGenerator(req);
}

// General rate limiter — 100 req per 15 minutes per IP/user
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  keyGenerator: makeKey,
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth rate limiter — 20 login/register attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => ipKeyGenerator(req),
  message: { error: 'Too many authentication attempts. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI rate limiter — 20 AI requests per hour per user
const aiRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: makeKey,
  message: { error: 'Too many AI requests. Maximum 20 AI calls per hour. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Database pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'drug_discovery',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// Make pool available to routes
app.set('db', pool);

// Apply general limiter to all API routes
app.use('/api', generalLimiter);

// Routes
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/proteins', require('./routes/proteins'));
app.use('/api/targets', require('./routes/targets'));
app.use('/api/drug-candidates', require('./routes/drugCandidates'));
app.use('/api/screenings', require('./routes/screenings'));
app.use('/api/binding-affinities', require('./routes/bindingAffinities'));
app.use('/api/toxicity', require('./routes/toxicity'));
app.use('/api/structures', require('./routes/structures'));
app.use('/api/clinical-trials', require('./routes/clinicalTrials'));
app.use('/api/compounds', require('./routes/compounds'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/experiments', require('./routes/experiments'));
app.use('/api/drug-interactions', require('./routes/drugInteractions'));
app.use('/api/admet', require('./routes/admet'));
app.use('/api/literature', require('./routes/literature'));
app.use('/api/ai', aiRateLimiter, require('./routes/ai'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// BATCH_00_AUDIT_MOUNTS (must be mounted BEFORE the /api/* catch-all 404 handler)
app.use('/api/de-novo-design', require('./routes/deNovoDesign'));
app.use('/api/pareto-optimization', require('./routes/paretoOptimization'));
app.use('/api/patent-landscape', require('./routes/patentLandscape'));
app.use('/api/trial-success', require('./routes/trialSuccess'));
app.use('/api/lab-automation', require('./routes/labAutomation'));

// === Batch 00 Gaps & Frontend Mounts ===
app.use('/api/gap-ai-de-novo-compound-generation', require('./routes/gap_ai_de_novo_compound_generation'));
app.use('/api/gap-ai-binding-affinity-regression-model', require('./routes/gap_ai_binding_affinity_regression_model'));
app.use('/api/gap-ai-admet-property-prediction', require('./routes/gap_ai_admet_property_prediction'));
app.use('/api/gap-ai-toxicity-risk-assessment-model', require('./routes/gap_ai_toxicity_risk_assessment_model'));
app.use('/api/gap-ai-lead-optimization', require('./routes/gap_ai_lead_optimization'));
app.use('/api/gap-ai-patent-novelty-checking-against', require('./routes/gap_ai_patent_novelty_checking_against'));
app.use('/api/gap-ai-clinical-trial-design-recommender', require('./routes/gap_ai_clinical_trial_design_recommender'));
app.use('/api/gap-molecular-docking-simulation-engine', require('./routes/gap_molecular_docking_simulation_engine'));
app.use('/api/gap-virtual-screening-workflow-orchestration', require('./routes/gap_virtual_screening_workflow_orchestration'));
app.use('/api/gap-sar-structure-activity-relationship-analysis', require('./routes/gap_sar_structure_activity_relationship_analysis'));
app.use('/api/gap-pubchem-chemspider-import-bridges', require('./routes/gap_pubchem_chemspider_import_bridges'));
app.use('/api/gap-notifications-webhooks-subsystem', require('./routes/gap_notifications_webhooks_subsystem'));

// === Custom Bespoke Views (pipeline + molecule viewer) ===
app.use('/api/custom-views', require('./routes/customViews'));

// 404 handler — must be registered AFTER all real routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

module.exports = app;
