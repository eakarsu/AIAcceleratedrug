const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    summary: { assay_batches: 12, reproducible: 8, review_needed: 3, failed_controls: 1 },
    batches: [
      { batch: 'IC50-EGFR-042', target: 'EGFR', cv_percent: 8.4, z_prime: 0.71, status: 'reproducible' },
      { batch: 'ADMET-LIVER-019', target: 'CYP3A4', cv_percent: 18.9, z_prime: 0.52, status: 'review' },
      { batch: 'BIND-KRAS-088', target: 'KRAS G12C', cv_percent: 24.1, z_prime: 0.39, status: 'rerun' },
    ],
    controls: [
      { name: 'positive control', drift: '+4.2%', status: 'ok' },
      { name: 'vehicle control', drift: '+13.8%', status: 'investigate' },
    ],
  });
});

router.post('/score', (req, res) => {
  const { cvPercent = 12, zPrime = 0.6 } = req.body || {};
  const reproducibility = zPrime >= 0.5 && cvPercent <= 20 ? 'acceptable' : 'rerun recommended';
  res.json({ cvPercent, zPrime, reproducibility });
});

module.exports = router;
