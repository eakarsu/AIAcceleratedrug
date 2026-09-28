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

const compoundValidation = [
  body('name').trim().notEmpty().withMessage('name is required').isLength({ max: 255 }),
  body('formula').optional().isString().isLength({ max: 255 }),
  body('molecular_weight').optional().isFloat({ min: 0 }),
  body('smiles').optional().isString(),
  body('status').optional().isIn(['available', 'hit', 'lead', 'reference', 'screening', 'development']),
];

router.get('/', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const search = req.query.search || '';
    const whereClause = search ? `WHERE name ILIKE $3 OR formula ILIKE $3` : '';
    const params = search ? [limit, offset, `%${search}%`] : [limit, offset];

    const [rows, count] = await Promise.all([
      pool.query(`SELECT * FROM compounds ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`, params),
      pool.query(`SELECT COUNT(*) FROM compounds ${whereClause.replace(/\$3/g, '$1')}`, search ? [`%${search}%`] : []),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Compound similarity search
router.get('/similar', authenticateToken, async (req, res) => {
  try {
    const { smiles } = req.query;
    if (!smiles) return res.status(400).json({ error: 'smiles query param is required' });
    const pool = req.app.get('db');
    // Basic similarity: fetch all compounds with SMILES and filter those sharing the first scaffold characters
    // In production, use RDKit pg extension for real Tanimoto
    const result = await pool.query(
      `SELECT id, name, smiles, formula, molecular_weight, status FROM compounds WHERE smiles IS NOT NULL AND smiles != '' ORDER BY name LIMIT 50`
    );
    const queryPrefix = smiles.substring(0, Math.min(6, smiles.length));
    const similar = result.rows.map(row => {
      const overlap = row.smiles ? [...smiles].filter((c, i) => row.smiles[i] === c).length : 0;
      const similarity = smiles.length > 0 ? Math.min(1, overlap / smiles.length) : 0;
      return { ...row, similarity: parseFloat(similarity.toFixed(3)) };
    }).filter(r => r.similarity > 0.1).sort((a, b) => b.similarity - a.similarity).slice(0, 20);

    res.json({ data: similar, query_smiles: smiles });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('SELECT * FROM compounds WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authenticateToken, compoundValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { name, formula, molecular_weight, smiles, source, status, description } = req.body;
    const result = await pool.query(
      'INSERT INTO compounds (name, formula, molecular_weight, smiles, source, status, description) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, formula, molecular_weight, smiles, source, status || 'available', description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authenticateToken, compoundValidation, async (req, res) => {
  if (handleValidation(req, res)) return;
  try {
    const pool = req.app.get('db');
    const { name, formula, molecular_weight, smiles, source, status, description } = req.body;
    const result = await pool.query(
      'UPDATE compounds SET name=$1, formula=$2, molecular_weight=$3, smiles=$4, source=$5, status=$6, description=$7, updated_at=NOW() WHERE id=$8 RETURNING *',
      [name, formula, molecular_weight, smiles, source, status, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(result.rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const result = await pool.query('DELETE FROM compounds WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
