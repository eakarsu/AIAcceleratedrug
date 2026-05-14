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

const candidateValidation = [
  body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 255 }),
  body('molecule_type').optional().isString().isLength({ max: 100 }),
  body('target_name').optional().isString().isLength({ max: 255 }),
  body('phase').optional().isIn(['Discovery', 'Preclinical', 'Phase I', 'Phase I/II', 'Phase II', 'Phase III']),
  body('efficacy_score').optional().isFloat({ min: 0, max: 100 }).withMessage('efficacy_score must be 0-100'),
  body('status').optional().isIn(['active', 'on_hold', 'terminated', 'approved']),
];

router.get('/', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const search = req.query.search || '';
    const phase = req.query.phase || '';
    const conditions = [];
    const params = [limit, offset];
    let paramIdx = 3;

    if (search) { conditions.push(`(name ILIKE $${paramIdx} OR target_name ILIKE $${paramIdx})`); params.push(`%${search}%`); paramIdx++; }
    if (phase) { conditions.push(`phase = $${paramIdx}`); params.push(phase); paramIdx++; }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countParams = params.slice(2);

    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM drug_candidates ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM drug_candidates ${whereClause}`, countParams),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/pipeline', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const phases = ['Discovery', 'Preclinical', 'Phase I', 'Phase I/II', 'Phase II', 'Phase III'];
    const result = await pool.query('SELECT * FROM drug_candidates ORDER BY phase, efficacy_score DESC');
    const pipeline = {};
    phases.forEach(p => { pipeline[p] = []; });
    result.rows.forEach(r => {
      if (pipeline[r.phase]) pipeline[r.phase].push(r);
      else pipeline['Discovery'].push(r);
    });
    res.json({ pipeline, phases });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM drug_candidates WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, candidateValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { name, molecule_type, target_name, phase, efficacy_score, status, description } = req.body;
    const result = await pool.query(
      'INSERT INTO drug_candidates (name, molecule_type, target_name, phase, efficacy_score, status, description) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, molecule_type, target_name, phase || 'Discovery', efficacy_score, status || 'active', description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, candidateValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { name, molecule_type, target_name, phase, efficacy_score, status, description } = req.body;
    const result = await pool.query(
      'UPDATE drug_candidates SET name=$1, molecule_type=$2, target_name=$3, phase=$4, efficacy_score=$5, status=$6, description=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
      [name, molecule_type, target_name, phase, efficacy_score, status, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM drug_candidates WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
