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

const targetValidation = [
  body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 255 }),
  body('type').optional().isString().isLength({ max: 100 }),
  body('disease_area').optional().isString().isLength({ max: 255 }),
  body('validation_status').optional().isIn(['pending', 'preclinical', 'clinical', 'validated']),
];

router.get('/', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const search = req.query.search || '';
    const whereClause = search ? `WHERE name ILIKE $3 OR disease_area ILIKE $3` : '';
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset];

    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM targets ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM targets ${whereClause}`, search ? [`%${search}%`] : []),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
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

router.post('/', authenticateToken, targetValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
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

router.put('/:id', authenticateToken, targetValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
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
