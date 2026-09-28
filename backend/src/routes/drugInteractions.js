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

const diValidation = [
  body('drug_a').trim().notEmpty().withMessage('drug_a is required').isLength({ max: 255 }),
  body('drug_b').trim().notEmpty().withMessage('drug_b is required').isLength({ max: 255 }),
  body('severity').optional().isIn(['unknown', 'Mild', 'Moderate', 'Severe', 'Contraindicated']),
];

router.get('/', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const search = req.query.search || '';
    const whereClause = search ? `WHERE drug_a ILIKE $3 OR drug_b ILIKE $3` : '';
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset];

    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM drug_interactions ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM drug_interactions ${whereClause.replace(/\$3/g, '$1')}`, search ? [`%${search}%`] : []),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Safety alerts: get high/severe interactions
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query(
      `SELECT * FROM drug_interactions WHERE severity IN ('Severe', 'Contraindicated') ORDER BY created_at DESC LIMIT 50`
    );
    res.json({ data: result.rows, count: result.rows.length });
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

router.post('/', authenticateToken, diValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
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

router.put('/:id', authenticateToken, diValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
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
