require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Database pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'drug_discovery',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

// Make pool available to routes
app.set('db', pool);

// Routes
app.use('/api/auth', require('./routes/auth'));
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
app.use('/api/ai', require('./routes/ai'));
app.use('/api/dashboard', require('./routes/dashboard'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

module.exports = app;
