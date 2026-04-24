const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM protein_structures ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM protein_structures WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { protein_name, sequence, fold_family, confidence_score, domains, ai_output } = req.body;
    const result = await pool.query(
      'INSERT INTO protein_structures (protein_name, sequence, fold_family, confidence_score, domains, ai_output) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [protein_name, sequence, fold_family, confidence_score, domains, ai_output]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { protein_name, sequence, fold_family, confidence_score, domains, ai_output } = req.body;
    const result = await pool.query(
      'UPDATE protein_structures SET protein_name=$1, sequence=$2, fold_family=$3, confidence_score=$4, domains=$5, ai_output=$6, updated_at=NOW() WHERE id=$7 RETURNING *',
      [protein_name, sequence, fold_family, confidence_score, domains, ai_output, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM protein_structures WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
