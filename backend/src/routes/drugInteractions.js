const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM drug_interactions ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM drug_interactions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { drug_a, drug_b, interaction_type, severity, mechanism, ai_output } = req.body;
    const result = await pool.query(
      'INSERT INTO drug_interactions (drug_a, drug_b, interaction_type, severity, mechanism, ai_output) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [drug_a, drug_b, interaction_type, severity || 'unknown', mechanism, ai_output]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { drug_a, drug_b, interaction_type, severity, mechanism, ai_output } = req.body;
    const result = await pool.query(
      'UPDATE drug_interactions SET drug_a=$1, drug_b=$2, interaction_type=$3, severity=$4, mechanism=$5, ai_output=$6, updated_at=NOW() WHERE id=$7 RETURNING *',
      [drug_a, drug_b, interaction_type, severity, mechanism, ai_output, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM drug_interactions WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
