const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const [proteins, targets, candidates, trials, compounds, projects, experiments, screenings] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM proteins'),
      pool.query('SELECT COUNT(*) as count FROM targets'),
      pool.query('SELECT COUNT(*) as count FROM drug_candidates'),
      pool.query('SELECT COUNT(*) as count FROM clinical_trials'),
      pool.query('SELECT COUNT(*) as count FROM compounds'),
      pool.query('SELECT COUNT(*) as count FROM research_projects'),
      pool.query('SELECT COUNT(*) as count FROM experiments'),
      pool.query('SELECT COUNT(*) as count FROM molecular_screenings'),
    ]);

    res.json({
      proteins: parseInt(proteins.rows[0].count),
      targets: parseInt(targets.rows[0].count),
      drugCandidates: parseInt(candidates.rows[0].count),
      clinicalTrials: parseInt(trials.rows[0].count),
      compounds: parseInt(compounds.rows[0].count),
      projects: parseInt(projects.rows[0].count),
      experiments: parseInt(experiments.rows[0].count),
      screenings: parseInt(screenings.rows[0].count),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/recent-activity', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query(`
      SELECT 'protein' as type, name, status, created_at FROM proteins
      UNION ALL SELECT 'drug_candidate' as type, name, status, created_at FROM drug_candidates
      UNION ALL SELECT 'trial' as type, name, status, created_at FROM clinical_trials
      UNION ALL SELECT 'experiment' as type, name, status, created_at FROM experiments
      ORDER BY created_at DESC LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
