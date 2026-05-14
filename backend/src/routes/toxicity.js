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

const toxValidation = [
  body('compound_name').trim().notEmpty().withMessage('compound_name is required').isLength({ max: 255 }),
  body('smiles').optional().isString(),
  body('risk_level').optional().isIn(['pending', 'Low', 'Medium', 'High', 'Critical']),
];

router.get('/', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const search = req.query.search || '';
    const whereClause = search ? `WHERE compound_name ILIKE $3` : '';
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset];

    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM toxicity_predictions ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM toxicity_predictions ${whereClause}`, search ? [`%${search}%`] : []),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM toxicity_predictions WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, toxValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { compound_name, smiles, risk_level, prediction_result, ai_output } = req.body;
    const result = await pool.query(
      'INSERT INTO toxicity_predictions (compound_name, smiles, risk_level, prediction_result, ai_output) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [compound_name, smiles, risk_level || 'pending', prediction_result, ai_output]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, toxValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { compound_name, smiles, risk_level, prediction_result, ai_output } = req.body;
    const result = await pool.query(
      'UPDATE toxicity_predictions SET compound_name=$1, smiles=$2, risk_level=$3, prediction_result=$4, ai_output=$5, updated_at=NOW() WHERE id=$6 RETURNING *',
      [compound_name, smiles, risk_level, prediction_result, ai_output, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM toxicity_predictions WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
