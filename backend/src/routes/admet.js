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

const admetValidation = [
  body('compound_name').trim().notEmpty().withMessage('compound_name is required').isLength({ max: 255 }),
  body('toxicity_score').optional().isFloat({ min: 0, max: 100 }),
  body('overall_score').optional().isFloat({ min: 0, max: 100 }),
];

router.get('/', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const search = req.query.search || '';
    const whereClause = search ? `WHERE compound_name ILIKE $3` : '';
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset];

    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM admet_properties ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM admet_properties ${whereClause}`, search ? [`%${search}%`] : []),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM admet_properties WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, admetValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { compound_name, absorption, distribution, metabolism, excretion, toxicity_score, overall_score, ai_output } = req.body;
    const result = await pool.query(
      'INSERT INTO admet_properties (compound_name, absorption, distribution, metabolism, excretion, toxicity_score, overall_score, ai_output) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [compound_name, absorption, distribution, metabolism, excretion, toxicity_score, overall_score, ai_output]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, admetValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { compound_name, absorption, distribution, metabolism, excretion, toxicity_score, overall_score, ai_output } = req.body;
    const result = await pool.query(
      'UPDATE admet_properties SET compound_name=$1, absorption=$2, distribution=$3, metabolism=$4, excretion=$5, toxicity_score=$6, overall_score=$7, ai_output=$8, updated_at=NOW() WHERE id=$9 RETURNING *',
      [compound_name, absorption, distribution, metabolism, excretion, toxicity_score, overall_score, ai_output, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM admet_properties WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
