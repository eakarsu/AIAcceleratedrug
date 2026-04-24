const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM targets ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM targets WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { name, type, disease_area, description, validation_status } = req.body;
    const result = await pool.query(
      'INSERT INTO targets (name, type, disease_area, description, validation_status) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, type, disease_area, description, validation_status || 'pending']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { name, type, disease_area, description, validation_status } = req.body;
    const result = await pool.query(
      'UPDATE targets SET name=$1, type=$2, disease_area=$3, description=$4, validation_status=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [name, type, disease_area, description, validation_status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM targets WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
