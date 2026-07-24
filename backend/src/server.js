require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { legacyPrototypeRoutesEnabled } = require('./config/runtime').validateRuntime();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { default: rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { Pool } = require('pg');

// Validate critical env vars at startup
if (!process.env.OPENROUTER_API_KEY) {
  console.warn('[WARN] OPENROUTER_API_KEY not set. AI features will fail.');
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
const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.DB_HOST || 'localhost', port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'drug_discovery', user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err.message);
});

// Make pool available to routes
app.set('db', pool);

// Apply general limiter to all API routes
app.use('/api', generalLimiter);
app.use('/api', require('../runtimeAcceptance'));

app.use('/api', (req, res, next) => {
  const supported = ['/auth', '/health', '/evidence-workflows'];
  if (legacyPrototypeRoutesEnabled || supported.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) return next();
  return res.status(410).json({ error: 'Legacy prototype route is quarantined', code: 'prototype_route_quarantined' });
});

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
app.use('/api/evidence-workflows', require('./routes/evidenceWorkflow'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Batch-generated stub and gap routes are intentionally not mounted as product APIs.

// === Custom Bespoke Views (pipeline + molecule viewer) ===
app.use('/api/custom-views', require('./routes/customViews'));
app.use('/api/assay-batch-reproducibility', require('./routes/assayBatchReproducibility'));

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
