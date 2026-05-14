const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { paginate, paginationMeta } = require('../middleware/paginate');

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) { res.status(400).json({ errors: errors.array() }); return true; }
  return false;
}

const proteinValidation = [
  body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 255 }),
  body('sequence').optional().isString(),
  body('target').optional().isString().isLength({ max: 255 }),
  body('status').optional().isIn(['designed', 'synthesized', 'testing', 'validated']),
];

router.get('/', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const search = req.query.search || '';
    const whereClause = search ? `WHERE name ILIKE $3 OR target ILIKE $3` : '';
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset];

    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM proteins ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM proteins ${whereClause}`, search ? [`%${search}%`] : []),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM proteins WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, proteinValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { name, sequence, target, properties, status, ai_output } = req.body;
    const result = await pool.query(
      'INSERT INTO proteins (name, sequence, target, properties, status, ai_output) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, sequence, target, properties, status || 'designed', ai_output]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, proteinValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { name, sequence, target, properties, status, ai_output } = req.body;
    const result = await pool.query(
      'UPDATE proteins SET name=$1, sequence=$2, target=$3, properties=$4, status=$5, ai_output=$6, updated_at=NOW() WHERE id=$7 RETURNING *',
      [name, sequence, target, properties, status, ai_output, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM proteins WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
