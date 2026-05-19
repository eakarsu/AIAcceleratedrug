// customViews.js — bespoke read-only endpoints powering the Pipeline Views custom feature.
// Two GET endpoints:
//   GET /api/custom-views/pipeline          → drug-candidates grouped by phase (Kanban shape)
//   GET /api/custom-views/molecules         → compound list with a parsed/synthesized structure model
//
// The route falls back to synthesized in-memory data when the underlying
// schema is missing (e.g. drug_candidates / compounds tables not present),
// so the custom UI always renders even on a fresh checkout.

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const PDFDocument = require('pdfkit');

const PHASES = ['Discovery', 'Preclinical', 'Phase I', 'Phase II', 'Phase III', 'Approved'];

// Phase normaliser — the underlying drug_candidates.phase column allows e.g. "Phase I/II",
// which we collapse into the closest canonical column for the Kanban board.
function normalisePhase(raw) {
  if (!raw) return 'Discovery';
  const v = String(raw).trim();
  if (PHASES.includes(v)) return v;
  if (/approved/i.test(v)) return 'Approved';
  if (/phase\s*iii/i.test(v) || /phase\s*3/i.test(v)) return 'Phase III';
  if (/phase\s*ii/i.test(v) || /phase\s*2/i.test(v)) return 'Phase II';
  if (/phase\s*i/i.test(v) || /phase\s*1/i.test(v)) return 'Phase I';
  if (/preclin/i.test(v)) return 'Preclinical';
  return 'Discovery';
}

function synthesizedPipeline() {
  const seed = [
    { id: 901, name: 'NX-7821 (EGFR-T790M)', molecule_type: 'Small Molecule', target_name: 'EGFR', phase: 'Discovery', efficacy_score: 71.2 },
    { id: 902, name: 'NX-4410 (KRAS-G12C)', molecule_type: 'Covalent Inhibitor', target_name: 'KRAS G12C', phase: 'Discovery', efficacy_score: 65.8 },
    { id: 903, name: 'DRC-009 Jakinase', molecule_type: 'Small Molecule', target_name: 'JAK2', phase: 'Preclinical', efficacy_score: 76.2 },
    { id: 904, name: 'DRC-012 Raptorcept', molecule_type: 'Small Molecule', target_name: 'mTOR', phase: 'Preclinical', efficacy_score: 74.5 },
    { id: 905, name: 'DRC-003 Inflazero', molecule_type: 'Bispecific Antibody', target_name: 'TNF-alpha', phase: 'Phase I', efficacy_score: 78.3 },
    { id: 906, name: 'DRC-008 Cyclobreak', molecule_type: 'Small Molecule', target_name: 'CDK4/6', phase: 'Phase I', efficacy_score: 81.4 },
    { id: 907, name: 'DRC-001 Nexatinib', molecule_type: 'Small Molecule', target_name: 'EGFR', phase: 'Phase II', efficacy_score: 87.5 },
    { id: 908, name: 'DRC-004 Herceptix', molecule_type: 'ADC', target_name: 'HER2', phase: 'Phase II', efficacy_score: 91.7 },
    { id: 909, name: 'DRC-014 ALKinator', molecule_type: 'Small Molecule', target_name: 'ALK', phase: 'Phase II', efficacy_score: 90.8 },
    { id: 910, name: 'DRC-002 Immublock', molecule_type: 'Monoclonal Antibody', target_name: 'PD-L1', phase: 'Phase III', efficacy_score: 92.1 },
    { id: 911, name: 'DRC-015 Glucomod', molecule_type: 'Peptide', target_name: 'GLP-1R', phase: 'Phase III', efficacy_score: 93.2 },
    { id: 912, name: 'Osimertinib (Tagrisso)', molecule_type: 'Small Molecule', target_name: 'EGFR T790M', phase: 'Approved', efficacy_score: 95.4 },
    { id: 913, name: 'Sotorasib (Lumakras)', molecule_type: 'Covalent Inhibitor', target_name: 'KRAS G12C', phase: 'Approved', efficacy_score: 94.0 },
  ];
  const pipeline = {};
  PHASES.forEach((p) => { pipeline[p] = []; });
  seed.forEach((row) => { pipeline[normalisePhase(row.phase)].push(row); });
  return { phases: PHASES, pipeline, source: 'synthesized' };
}

// ---------------------------------------------------------------------------
// GET /api/custom-views/pipeline
// ---------------------------------------------------------------------------
router.get('/pipeline', authenticateToken, async (req, res) => {
  const pool = req.app.get('db');
  try {
    // probe schema — if drug_candidates is missing, fall back to synth data
    const probe = await pool.query(
      `SELECT to_regclass('public.drug_candidates') AS exists`
    );
    if (!probe.rows[0] || !probe.rows[0].exists) {
      return res.json(synthesizedPipeline());
    }

    const result = await pool.query(
      `SELECT id, name, molecule_type, target_name, phase, efficacy_score, status, description
         FROM drug_candidates
        ORDER BY efficacy_score DESC NULLS LAST, name ASC`
    );

    const pipeline = {};
    PHASES.forEach((p) => { pipeline[p] = []; });
    result.rows.forEach((row) => {
      const col = normalisePhase(row.phase);
      pipeline[col].push(row);
    });

    // If DB exists but is empty, also serve synth data so the UI is meaningful.
    const total = Object.values(pipeline).reduce((a, b) => a + b.length, 0);
    if (total === 0) return res.json(synthesizedPipeline());

    res.json({ phases: PHASES, pipeline, source: 'database' });
  } catch (err) {
    // Schema-error fallback — never break the custom view
    console.warn('[customViews/pipeline] falling back to synth:', err.message);
    res.json(synthesizedPipeline());
  }
});

// ---------------------------------------------------------------------------
// Synthesized molecule library (used as fallback or to enrich DB rows).
// Each entry carries a small "structure" graph with atom labels and bonds so
// the SVG viewer in the frontend can render a deterministic chemical sketch
// without needing a chem-informatics library on the client.
// ---------------------------------------------------------------------------
function benzeneRing(offsetX = 0, offsetY = 0, labels = ['C', 'C', 'C', 'C', 'C', 'C']) {
  // Regular hexagon, radius 40, centred at (offsetX, offsetY).
  const r = 40;
  const atoms = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    atoms.push({
      label: labels[i] || 'C',
      x: +(offsetX + r * Math.cos(angle)).toFixed(2),
      y: +(offsetY + r * Math.sin(angle)).toFixed(2),
    });
  }
  const bonds = [];
  for (let i = 0; i < 6; i++) {
    bonds.push({ from: i, to: (i + 1) % 6, order: i % 2 === 0 ? 2 : 1 });
  }
  return { atoms, bonds };
}

function proteinBackbone() {
  // Synthetic N-Cα-C(=O) backbone trace, 8 residues, simplified.
  const atoms = [];
  const bonds = [];
  const startX = 30;
  const y = 150;
  const dx = 35;
  const residues = ['N', 'CA', 'C', 'N', 'CA', 'C', 'N', 'CA', 'C', 'N', 'CA', 'C'];
  residues.forEach((lbl, i) => {
    atoms.push({
      label: lbl,
      x: startX + i * dx,
      y: i % 2 === 0 ? y - 12 : y + 12,
    });
    if (i > 0) bonds.push({ from: i - 1, to: i, order: 1 });
  });
  // Carbonyl O sticks
  [2, 5, 8, 11].forEach((cIdx, k) => {
    atoms.push({ label: 'O', x: startX + cIdx * dx, y: y + (k % 2 === 0 ? -32 : 32) });
    bonds.push({ from: cIdx, to: atoms.length - 1, order: 2 });
  });
  return { atoms, bonds };
}

const MOLECULE_LIBRARY = [
  {
    id: 'mol-benzene',
    name: 'Benzene (reference scaffold)',
    formula: 'C6H6',
    molecular_weight: 78.11,
    smiles: 'c1ccccc1',
    kind: 'benzene',
    structure: benzeneRing(110, 110),
    notes: 'Aromatic ring — common pharmacophore scaffold.',
  },
  {
    id: 'mol-phenol',
    name: 'Phenol (hydroxyl-substituted)',
    formula: 'C6H6O',
    molecular_weight: 94.11,
    smiles: 'Oc1ccccc1',
    kind: 'benzene',
    // Replace one ring carbon with O for visual distinction.
    structure: benzeneRing(110, 110, ['O', 'C', 'C', 'C', 'C', 'C']),
    notes: 'Phenol — H-bond donor; lead-like fragment.',
  },
  {
    id: 'mol-pyridine',
    name: 'Pyridine (N-heterocycle)',
    formula: 'C5H5N',
    molecular_weight: 79.10,
    smiles: 'c1ccncc1',
    kind: 'benzene',
    structure: benzeneRing(110, 110, ['N', 'C', 'C', 'C', 'C', 'C']),
    notes: 'Common kinase-inhibitor hinge binder.',
  },
  {
    id: 'mol-backbone',
    name: 'Protein backbone (synthetic 4-residue trace)',
    formula: '[N-Cα-C(=O)]n',
    molecular_weight: 0,
    smiles: 'N[C@@H](C)C(=O)N[C@@H](C)C(=O)...',
    kind: 'protein',
    structure: proteinBackbone(),
    notes: 'Simulated polypeptide backbone — N → Cα → C(=O) repeat.',
  },
];

// ---------------------------------------------------------------------------
// GET /api/custom-views/molecules
// ---------------------------------------------------------------------------
router.get('/molecules', authenticateToken, async (req, res) => {
  const pool = req.app.get('db');
  try {
    const probe = await pool.query(`SELECT to_regclass('public.compounds') AS exists`);
    if (!probe.rows[0] || !probe.rows[0].exists) {
      return res.json({ molecules: MOLECULE_LIBRARY, source: 'synthesized' });
    }

    const result = await pool.query(
      `SELECT id, name, formula, molecular_weight, smiles, source, status
         FROM compounds
        WHERE smiles IS NOT NULL AND length(smiles) > 0
        ORDER BY id ASC
        LIMIT 12`
    );

    // Attach a deterministic structure model to each DB row (benzene scaffold
    // by default — purely visual). The synthesized reference library is also
    // returned so the viewer always has well-known scaffolds available.
    const enriched = result.rows.map((row, idx) => ({
      id: `db-${row.id}`,
      name: row.name,
      formula: row.formula,
      molecular_weight: row.molecular_weight,
      smiles: row.smiles,
      kind: 'benzene',
      structure: benzeneRing(110, 110, ['C', 'N', 'C', 'O', 'C', 'C']),
      notes: `${row.source || 'library'} · status: ${row.status || 'n/a'}`,
    }));

    res.json({
      molecules: [...MOLECULE_LIBRARY, ...enriched],
      source: enriched.length ? 'database+synthesized' : 'synthesized',
    });
  } catch (err) {
    console.warn('[customViews/molecules] falling back to synth:', err.message);
    res.json({ molecules: MOLECULE_LIBRARY, source: 'synthesized' });
  }
});

// ---------------------------------------------------------------------------
// Fallback synthesised candidates used when drug_candidates table is missing
// or the requested id is not present — keeps the PDF endpoint robust on a
// fresh checkout (mirrors the pipeline fallback strategy above).
// ---------------------------------------------------------------------------
function syntheticCandidateById(id) {
  const flat = [];
  Object.values(synthesizedPipeline().pipeline).forEach((arr) => arr.forEach((c) => flat.push(c)));
  if (!id) return flat[0];
  const numeric = Number(id);
  return flat.find((c) => Number(c.id) === numeric) || flat[0];
}

async function loadCandidate(pool, id) {
  try {
    const probe = await pool.query(`SELECT to_regclass('public.drug_candidates') AS exists`);
    if (probe.rows[0] && probe.rows[0].exists) {
      const r = await pool.query(
        `SELECT id, name, molecule_type, target_name, phase, efficacy_score, status, description
           FROM drug_candidates WHERE id = $1 LIMIT 1`,
        [Number(id)]
      );
      if (r.rows.length) return { ...r.rows[0], source: 'database' };
    }
  } catch (err) {
    console.warn('[customViews/trial-protocol] DB lookup failed:', err.message);
  }
  const synth = syntheticCandidateById(id);
  return { ...synth, source: 'synthesized' };
}

// ---------------------------------------------------------------------------
// POST /api/custom-views/trial-protocol?candidate_id=N
// Streams a PDF trial protocol for the requested drug candidate.
// ---------------------------------------------------------------------------
router.post('/trial-protocol', authenticateToken, async (req, res) => {
  const candidateId = req.query.candidate_id || (req.body && req.body.candidate_id);
  if (!candidateId) {
    return res.status(400).json({ error: 'candidate_id query param required' });
  }
  const pool = req.app.get('db');
  const candidate = await loadCandidate(pool, candidateId);
  if (!candidate || !candidate.name) {
    return res.status(404).json({ error: 'candidate not found' });
  }

  const filename = `trial-protocol-${String(candidate.name).replace(/[^A-Za-z0-9_-]+/g, '_')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: 'LETTER', margin: 56 });
  doc.on('error', (err) => {
    console.error('[customViews/trial-protocol] PDF error:', err.message);
    try { res.status(500).end(); } catch (_) { /* noop */ }
  });
  doc.pipe(res);

  // --- Header
  doc.fontSize(20).fillColor('#0f172a').text('Clinical Trial Protocol', { align: 'left' });
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor('#475569').text(
    `Generated ${new Date().toISOString().slice(0, 10)} · source: ${candidate.source}`
  );
  doc.moveTo(56, doc.y + 6).lineTo(556, doc.y + 6).strokeColor('#cbd5e1').lineWidth(1).stroke();
  doc.moveDown(1.2);

  // --- Candidate summary
  doc.fontSize(14).fillColor('#1e293b').text(`Candidate: ${candidate.name}`);
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor('#0f172a');
  doc.text(`Molecule type:  ${candidate.molecule_type || '—'}`);
  doc.text(`Target:         ${candidate.target_name || '—'}`);
  doc.text(`Current phase:  ${candidate.phase || 'Discovery'}`);
  if (candidate.efficacy_score != null) {
    doc.text(`Efficacy score: ${Number(candidate.efficacy_score).toFixed(1)} / 100`);
  }
  if (candidate.description) {
    doc.moveDown(0.4);
    doc.fillColor('#475569').fontSize(10).text(String(candidate.description), { align: 'left' });
  }
  doc.moveDown(0.8);

  // --- Section helper
  function section(title, body) {
    doc.fontSize(13).fillColor('#1d4ed8').text(title);
    doc.moveDown(0.2);
    doc.fontSize(10.5).fillColor('#0f172a');
    if (Array.isArray(body)) {
      body.forEach((item) => doc.text(`• ${item}`, { indent: 12 }));
    } else {
      doc.text(body, { align: 'left' });
    }
    doc.moveDown(0.6);
  }

  // --- Study design (phase-aware)
  const phase = String(candidate.phase || 'Phase I').toLowerCase();
  const isEarly = /discovery|preclin|phase\s*i\b|phase\s*1\b/.test(phase);
  const isLate = /phase\s*iii|phase\s*3/.test(phase);
  const studyDesign = isLate
    ? 'Randomised, double-blind, placebo-controlled, multicentre, parallel-group trial. Stratification by ECOG status (0 vs 1) and prior lines of therapy (1 vs ≥2).'
    : isEarly
      ? 'Open-label, dose-escalation (3+3) followed by a dose-expansion cohort. Single-arm, sequential enrolment with safety review committee gating between dose levels.'
      : 'Randomised, open-label, two-arm Phase II study with adaptive sample-size re-estimation at the planned interim analysis.';
  section('1. Study Design', studyDesign);

  // --- Inclusion criteria
  section('2. Inclusion Criteria', [
    'Adults ≥ 18 years (≥ 20 years where required by local regulation).',
    `Histologically confirmed disease relevant to target ${candidate.target_name || 'of interest'}.`,
    'ECOG performance status 0–1.',
    'Measurable disease per RECIST v1.1 (oncology) or equivalent indication-specific criterion.',
    'Adequate organ function: ANC ≥ 1.5×10^9/L, platelets ≥ 100×10^9/L, AST/ALT ≤ 3× ULN, creatinine clearance ≥ 60 mL/min.',
    'Signed informed consent and willingness to comply with study procedures.',
  ]);

  // --- Exclusion criteria
  section('3. Exclusion Criteria', [
    'Prior exposure to investigational product or close structural analogue within 4 weeks.',
    'Active CNS metastases requiring corticosteroids or anticonvulsants.',
    'Uncontrolled intercurrent illness (active infection, NYHA class III–IV heart failure, recent MI).',
    'Known hypersensitivity to study drug or excipients.',
    'Pregnancy or lactation; refusal to use effective contraception during the study and for 90 days after last dose.',
    'Concurrent participation in another interventional trial.',
  ]);

  // --- Dosing schedule
  const dosing = isEarly
    ? [
        'Dose level 1: 25 mg PO once daily, 28-day cycle.',
        'Dose level 2: 50 mg PO once daily (after DLT review).',
        'Dose level 3: 100 mg PO once daily (after DLT review).',
        'Dose level 4: 200 mg PO once daily (RP2D determination).',
        'DLT observation window: first 28 days of cycle 1.',
      ]
    : [
        'Recommended Phase 2 Dose (RP2D) administered PO once daily, continuously, in 28-day cycles.',
        'Treatment continues until disease progression, unacceptable toxicity, or withdrawal of consent.',
        'Dose reductions in 2 steps (–25%, –50%) permitted for grade ≥3 drug-related toxicity.',
      ];
  section('4. Dosing Schedule', dosing);

  // --- Endpoints
  section('5. Endpoints', [
    `Primary: ${isLate ? 'Overall Survival (OS) versus comparator.' : isEarly ? 'Safety and tolerability; determination of MTD/RP2D; incidence of DLTs.' : 'Objective Response Rate (ORR) per RECIST v1.1.'}`,
    'Secondary: Progression-Free Survival (PFS), Duration of Response (DoR), Disease Control Rate (DCR), pharmacokinetic parameters (Cmax, Tmax, AUC, t½), patient-reported outcomes (EORTC QLQ-C30).',
    `Exploratory: Pharmacodynamic biomarker engagement of ${candidate.target_name || 'target'}; circulating tumour DNA dynamics; resistance-mechanism profiling at progression.`,
  ]);

  // --- Safety monitoring
  section('6. Safety Monitoring', [
    'Adverse events graded per CTCAE v5.0 and collected continuously through 30 days after last dose.',
    'Independent Data Safety Monitoring Board (DSMB) review every 6 months (or after every 10 DLT-evaluable patients in early-phase cohorts).',
    'Standing safety review: weekly cycle 1, every 2 weeks cycles 2–3, monthly thereafter.',
    'Pre-specified stopping rules: ≥33% DLT rate at any dose level; ≥2 grade-5 drug-related events; unexpected SAE clustering.',
    'Cardiac monitoring (ECG, LVEF) at screening, end of cycle 2, then every 3 cycles.',
    'Hepatic safety: LFTs at each cycle; mandatory drug interruption for ALT/AST > 5× ULN.',
  ]);

  // --- Footer
  doc.moveDown(0.6);
  doc.fontSize(9).fillColor('#94a3b8').text(
    'Auto-generated protocol — for planning purposes only. Confirm with regulatory and biostatistics teams before IRB submission.',
    { align: 'center' }
  );

  doc.end();
});

// ---------------------------------------------------------------------------
// POST /api/custom-views/lipinski-eval
// Computes Lipinski's Rule-of-Five evaluation from explicit numeric inputs or
// a parsed SMILES estimate. Returns pass/fail flags per rule + a recommendation.
// ---------------------------------------------------------------------------

// Light-touch SMILES estimator — deliberately heuristic. Real cheminformatics
// would use RDKit; we approximate MW from atom counts and logP / HBD / HBA from
// crude substructure tallies so the calculator is meaningful without RDKit.
function estimateFromSmiles(smiles) {
  if (!smiles || typeof smiles !== 'string') return null;
  const s = smiles.trim();
  if (!s) return null;

  // Atomic weights (rough)
  const W = { C: 12.01, N: 14.01, O: 16.00, S: 32.07, F: 19.00, Cl: 35.45, Br: 79.90, I: 126.90, P: 30.97, H: 1.008 };

  // Two-letter atoms first to avoid double-counting
  const counts = { C: 0, N: 0, O: 0, S: 0, F: 0, Cl: 0, Br: 0, I: 0, P: 0 };
  let stripped = s;
  ['Cl', 'Br'].forEach((sym) => {
    const m = stripped.match(new RegExp(sym, 'g'));
    counts[sym] = m ? m.length : 0;
    stripped = stripped.replace(new RegExp(sym, 'g'), '');
  });
  // Aromatic and aliphatic single-letter
  counts.C = (stripped.match(/[cC]/g) || []).length;
  counts.N = (stripped.match(/[nN]/g) || []).length;
  counts.O = (stripped.match(/[oO]/g) || []).length;
  counts.S = (stripped.match(/[sS]/g) || []).length;
  counts.F = (stripped.match(/F/g) || []).length;
  counts.I = (stripped.match(/I/g) || []).length;
  counts.P = (stripped.match(/P/g) || []).length;

  const heavyAtoms = Object.values(counts).reduce((a, b) => a + b, 0);
  if (heavyAtoms === 0) return null;

  // Implicit H estimate: 4×C + 3×N + 2×O + 1×(halogens), minus 2 per ring/double-bond proxy.
  const ringClosures = (s.match(/[0-9]/g) || []).length / 2;
  const doubleBonds = (s.match(/=/g) || []).length;
  const tripleBonds = (s.match(/#/g) || []).length;
  const valencePool = 4 * counts.C + 3 * counts.N + 2 * counts.O + 2 * counts.S + counts.F + counts.Cl + counts.Br + counts.I + 3 * counts.P;
  const hydrogens = Math.max(0, valencePool - 2 * (ringClosures + doubleBonds + 2 * tripleBonds) - (heavyAtoms - 1));

  const mw =
    counts.C * W.C +
    counts.N * W.N +
    counts.O * W.O +
    counts.S * W.S +
    counts.F * W.F +
    counts.Cl * W.Cl +
    counts.Br * W.Br +
    counts.I * W.I +
    counts.P * W.P +
    hydrogens * W.H;

  // Crude logP — fragment-style contribution.
  const logP = +(
    0.30 * counts.C +
    0.20 * (counts.Cl + counts.Br + counts.I) +
    0.10 * counts.F -
    0.50 * counts.O -
    0.40 * counts.N -
    0.10 * counts.S +
    -0.05 * hydrogens
  ).toFixed(2);

  // H-bond donors ≈ OH + NH (we cannot perfectly count Hs on heteroatoms; proxy via O+N minus carbonyl/ether estimate)
  const carbonyls = (s.match(/=O/g) || []).length;
  const hbd = Math.max(0, counts.O + counts.N - carbonyls - Math.floor(counts.N / 2));
  // H-bond acceptors ≈ all O + all N
  const hba = counts.O + counts.N;

  return {
    molecular_weight: +mw.toFixed(2),
    logP,
    hbd,
    hba,
    heavy_atoms: heavyAtoms,
    estimated_hydrogens: hydrogens,
    source: 'smiles-heuristic',
  };
}

function evaluateLipinski({ mw, logP, hbd, hba }) {
  const rules = [
    { id: 'mw',   label: 'Molecular weight ≤ 500 Da',   value: mw,   threshold: 500, ok: mw   <= 500, violationText: `MW ${mw.toFixed(1)} Da exceeds 500.` },
    { id: 'logp', label: 'logP ≤ 5',                    value: logP, threshold: 5,   ok: logP <= 5,   violationText: `logP ${logP} exceeds 5.` },
    { id: 'hbd',  label: 'H-bond donors ≤ 5',           value: hbd,  threshold: 5,   ok: hbd  <= 5,   violationText: `${hbd} H-bond donors (limit 5).` },
    { id: 'hba',  label: 'H-bond acceptors ≤ 10',       value: hba,  threshold: 10,  ok: hba  <= 10,  violationText: `${hba} H-bond acceptors (limit 10).` },
  ];
  const violations = rules.filter((r) => !r.ok).map((r) => ({ id: r.id, label: r.label, detail: r.violationText }));
  const passes = violations.length <= 1; // Ro5 tolerates a single violation
  // Naive oral bioavailability score: start at 100 and dock points per violation, with mild penalties for marginal values.
  let score = 100 - violations.length * 22;
  if (mw > 450) score -= 4;
  if (logP > 4) score -= 4;
  if (hbd > 4) score -= 3;
  if (hba > 8) score -= 3;
  if (logP < -1) score -= 6; // too polar
  score = Math.max(0, Math.min(100, Math.round(score)));

  const recommendations = [];
  if (mw > 500) recommendations.push('Trim molecular weight: remove non-essential substituents or fuse rings.');
  if (logP > 5) recommendations.push('Lower lipophilicity: introduce polar group (OH, amide) or replace alkyl with heteroatom.');
  if (logP < 0) recommendations.push('Raise lipophilicity: add hydrophobic group or remove polar functionality to improve membrane permeability.');
  if (hbd > 5) recommendations.push('Reduce H-bond donors: convert OH/NH to ether, amide, or fluorine bioisostere.');
  if (hba > 10) recommendations.push('Reduce H-bond acceptors: limit nitrogens/oxygens; consider ring fusion to mask polar surface area.');
  if (!recommendations.length) {
    recommendations.push('Profile is drug-like; prioritise ADMET, solubility and selectivity profiling next.');
  }

  return { passes, violations, rules, oral_bioavailability_score: score, recommendations };
}

router.post('/lipinski-eval', authenticateToken, async (req, res) => {
  try {
    const body = req.body || {};
    const provided = {
      mw:   body.mw   !== undefined ? Number(body.mw)   : (body.molecular_weight !== undefined ? Number(body.molecular_weight) : null),
      logP: body.logP !== undefined ? Number(body.logP) : (body.logp             !== undefined ? Number(body.logp)             : null),
      hbd:  body.hbd  !== undefined ? Number(body.hbd)  : null,
      hba:  body.hba  !== undefined ? Number(body.hba)  : null,
    };

    let inputs = provided;
    let estimate = null;
    const needsEstimate = ['mw', 'logP', 'hbd', 'hba'].some((k) => inputs[k] == null || Number.isNaN(inputs[k]));

    if (needsEstimate && body.smiles) {
      estimate = estimateFromSmiles(body.smiles);
      if (estimate) {
        inputs = {
          mw:   inputs.mw   != null && !Number.isNaN(inputs.mw)   ? inputs.mw   : estimate.molecular_weight,
          logP: inputs.logP != null && !Number.isNaN(inputs.logP) ? inputs.logP : estimate.logP,
          hbd:  inputs.hbd  != null && !Number.isNaN(inputs.hbd)  ? inputs.hbd  : estimate.hbd,
          hba:  inputs.hba  != null && !Number.isNaN(inputs.hba)  ? inputs.hba  : estimate.hba,
        };
      }
    }

    if (['mw', 'logP', 'hbd', 'hba'].some((k) => inputs[k] == null || Number.isNaN(inputs[k]))) {
      return res.status(400).json({
        error: 'Provide either all of (mw, logP, hbd, hba) or a SMILES string for estimation.',
      });
    }

    const evaluation = evaluateLipinski({
      mw: Number(inputs.mw),
      logP: Number(inputs.logP),
      hbd: Number(inputs.hbd),
      hba: Number(inputs.hba),
    });

    res.json({
      inputs: { ...inputs, smiles: body.smiles || null },
      estimate,
      passes: evaluation.passes ? 'y' : 'n',
      violations: evaluation.violations,
      rules: evaluation.rules,
      oral_bioavailability_score: evaluation.oral_bioavailability_score,
      recommendations: evaluation.recommendations,
    });
  } catch (err) {
    console.error('[customViews/lipinski-eval] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
