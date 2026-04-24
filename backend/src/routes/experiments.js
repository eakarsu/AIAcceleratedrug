const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM experiments ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM experiments WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { name, project_name, type, hypothesis, result: expResult, status, protocol, description } = req.body;
    const r = await pool.query(
      'INSERT INTO experiments (name, project_name, type, hypothesis, result, status, protocol, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [name, project_name, type, hypothesis, expResult, status || 'planned', protocol, description]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { name, project_name, type, hypothesis, result: expResult, status, protocol, description } = req.body;
    const r = await pool.query(
      'UPDATE experiments SET name=$1, project_name=$2, type=$3, hypothesis=$4, result=$5, status=$6, protocol=$7, description=$8, updated_at=NOW() WHERE id=$9 RETURNING *',
      [name, project_name, type, hypothesis, expResult, status, protocol, description, req.params.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(r.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM experiments WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
