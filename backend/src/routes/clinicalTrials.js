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

const trialValidation = [
  body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 255 }),
  body('phase').optional().isIn(['Preclinical', 'Phase I', 'Phase I/II', 'Phase II', 'Phase III', 'Phase IV']),
  body('status').optional().isIn(['planned', 'recruiting', 'active', 'completed', 'terminated']),
  body('participants').optional().isInt({ min: 0 }),
  body('start_date').optional().isISO8601().withMessage('start_date must be a valid date'),
  body('end_date').optional().isISO8601().withMessage('end_date must be a valid date'),
];

router.get('/', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const search = req.query.search || '';
    const whereClause = search ? `WHERE name ILIKE $3 OR drug_candidate_name ILIKE $3` : '';
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset];

    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM clinical_trials ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM clinical_trials ${whereClause.replace(/\$3/g, '$1')}`, search ? [`%${search}%`] : []),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM clinical_trials WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, trialValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { name, drug_candidate_name, phase, status, start_date, end_date, participants, site, description } = req.body;
    const result = await pool.query(
      'INSERT INTO clinical_trials (name, drug_candidate_name, phase, status, start_date, end_date, participants, site, description) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [name, drug_candidate_name, phase, status || 'planned', start_date || null, end_date || null, participants, site, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, trialValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { name, drug_candidate_name, phase, status, start_date, end_date, participants, site, description } = req.body;
    const result = await pool.query(
      'UPDATE clinical_trials SET name=$1, drug_candidate_name=$2, phase=$3, status=$4, start_date=$5, end_date=$6, participants=$7, site=$8, description=$9, updated_at=NOW() WHERE id=$10 RETURNING *',
      [name, drug_candidate_name, phase, status, start_date || null, end_date || null, participants, site, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM clinical_trials WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
