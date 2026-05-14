const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const [proteins, targets, candidates, trials, compounds, projects, experiments, screenings, aiLogs, highRiskInteractions] = await Promise.all([
      pool.query('SELECT COUNT(*) as count FROM proteins'),
      pool.query('SELECT COUNT(*) as count FROM targets'),
      pool.query('SELECT COUNT(*) as count FROM drug_candidates'),
      pool.query('SELECT COUNT(*) as count FROM clinical_trials'),
      pool.query('SELECT COUNT(*) as count FROM compounds'),
      pool.query('SELECT COUNT(*) as count FROM research_projects'),
      pool.query('SELECT COUNT(*) as count FROM experiments'),
      pool.query('SELECT COUNT(*) as count FROM molecular_screenings'),
      pool.query('SELECT COUNT(*) as count FROM ai_logs').catch(() => ({ rows: [{ count: 0 }] })),
      pool.query(`SELECT COUNT(*) as count FROM drug_interactions WHERE severity IN ('Severe', 'Contraindicated')`).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    // Phase distribution for drug candidates
    const phaseDistribution = await pool.query(
      `SELECT phase, COUNT(*) as count FROM drug_candidates GROUP BY phase ORDER BY phase`
    ).catch(() => ({ rows: [] }));

    // Toxicity risk distribution
    const toxicityDistribution = await pool.query(
      `SELECT risk_level, COUNT(*) as count FROM toxicity_predictions GROUP BY risk_level`
    ).catch(() => ({ rows: [] }));

    res.json({
      proteins: parseInt(proteins.rows[0].count),
      targets: parseInt(targets.rows[0].count),
      drugCandidates: parseInt(candidates.rows[0].count),
      clinicalTrials: parseInt(trials.rows[0].count),
      compounds: parseInt(compounds.rows[0].count),
      projects: parseInt(projects.rows[0].count),
      experiments: parseInt(experiments.rows[0].count),
      screenings: parseInt(screenings.rows[0].count),
      aiAnalyses: parseInt(aiLogs.rows[0].count),
      safetyAlerts: parseInt(highRiskInteractions.rows[0].count),
      phaseDistribution: phaseDistribution.rows,
      toxicityDistribution: toxicityDistribution.rows,
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

router.get('/safety-alerts', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const [highTox, severeDDI] = await Promise.all([
      pool.query(
        `SELECT compound_name, risk_level, created_at FROM toxicity_predictions WHERE risk_level IN ('High', 'Critical') ORDER BY created_at DESC LIMIT 10`
      ).catch(() => ({ rows: [] })),
      pool.query(
        `SELECT drug_a, drug_b, severity, mechanism, created_at FROM drug_interactions WHERE severity IN ('Severe', 'Contraindicated') ORDER BY created_at DESC LIMIT 10`
      ).catch(() => ({ rows: [] })),
    ]);

    res.json({
      high_toxicity_compounds: highTox.rows,
      severe_interactions: severeDDI.rows,
      total_alerts: highTox.rows.length + severeDDI.rows.length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
