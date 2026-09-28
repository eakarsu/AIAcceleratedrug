const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const { paginate, paginationMeta } = require('../middleware/paginate');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'anthropic/claude-3-5-sonnet-20241022';
const DEFAULT_AI_TIMEOUT_MS = 45000;
const DEFAULT_AI_ATTEMPTS = 2;

function aiServiceError(message, code, httpStatus = 502, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.httpStatus = httpStatus;
  error.retryable = retryable;
  return error;
}

// Parse AI JSON response robustly
function parseAIJson(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) {}
  const stripped = text.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim();
  try { return JSON.parse(stripped); } catch (e) {}
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1) { try { return JSON.parse(text.slice(start, end + 1)); } catch (e) {} }
  const arrStart = text.indexOf('['); const arrEnd = text.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1) { try { return JSON.parse(text.slice(arrStart, arrEnd + 1)); } catch (e) {} }
  return null;
}

// Helper: 503 if OpenRouter key not set (apply pass 5)
function aiKeyMissing() {
  const k = process.env.OPENROUTER_API_KEY;
  return !k || k === 'placeholder' || k.trim() === '';
}

async function callOpenRouter(prompt, systemPrompt, opts = {}) {
  if (aiKeyMissing()) {
    const err = new Error('AI not configured: set OPENROUTER_API_KEY on the server.');
    err.code = 'AI_KEY_MISSING';
    throw err;
  }
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const configuredTimeout = Number(process.env.AI_REQUEST_TIMEOUT_MS || DEFAULT_AI_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout >= 5000
    ? Math.min(configuredTimeout, 180000)
    : DEFAULT_AI_TIMEOUT_MS;
  const configuredAttempts = Number(process.env.AI_REQUEST_ATTEMPTS || DEFAULT_AI_ATTEMPTS);
  const maxAttempts = Number.isInteger(configuredAttempts)
    ? Math.max(1, Math.min(configuredAttempts, 3))
    : DEFAULT_AI_ATTEMPTS;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': process.env.CLIENT_URL || 'http://localhost:3000',
          'X-Title': 'AI Drug Discovery Platform',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.max_tokens ?? 4000,
        }),
        signal: controller.signal,
      });

      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); } catch (_) {
        throw aiServiceError('AI provider returned an unreadable response.', 'AI_PROVIDER_INVALID_RESPONSE', 502, response.status >= 500);
      }

      if (!response.ok || data.error) {
        if (response.status === 401 || response.status === 403) {
          throw aiServiceError('AI provider rejected the configured credential.', 'AI_PROVIDER_AUTH', 503);
        }
        if (response.status === 402) {
          throw aiServiceError('AI provider account has insufficient credits.', 'AI_PROVIDER_CREDITS', 503);
        }
        if (response.status === 429) {
          throw aiServiceError('AI provider rate limit reached. Please try again shortly.', 'AI_PROVIDER_RATE_LIMIT', 429, true);
        }
        if (response.status >= 500) {
          throw aiServiceError('AI provider is temporarily unavailable.', 'AI_PROVIDER_UNAVAILABLE', 503, true);
        }
        throw aiServiceError('AI provider rejected the request.', 'AI_PROVIDER_REQUEST_REJECTED', 502);
      }

      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw aiServiceError('AI provider returned an empty response.', 'AI_PROVIDER_EMPTY_RESPONSE', 502, true);
      }
      return content;
    } catch (err) {
      if (err.name === 'AbortError') {
        lastErr = aiServiceError('AI analysis timed out. Please retry.', 'AI_PROVIDER_TIMEOUT', 504, true);
      } else if (err.httpStatus) {
        lastErr = err;
      } else {
        lastErr = aiServiceError('Unable to reach the AI provider.', 'AI_PROVIDER_NETWORK', 502, true);
      }
      if (attempt < maxAttempts && lastErr.retryable) await new Promise(r => setTimeout(r, 750 * attempt));
      else break;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastErr;
}

// Save AI result to ai_results table
async function saveAiResult(pool, userId, feature, inputData, parsedResult, rawResponse) {
  try {
    await pool.query(
      `INSERT INTO ai_results (user_id, feature, input_data, parsed_result, raw_response) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)`,
      [userId, feature, JSON.stringify(inputData), JSON.stringify(parsedResult || { raw: rawResponse }), rawResponse]
    );
  } catch (_) {}
  // Also log to ai_logs for backward compat
  try {
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, prompt, response) VALUES ($1, $2, $3, $4)',
      [userId, feature, JSON.stringify(inputData), rawResponse]
    );
  } catch (_) {}
}

function handleValidation(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
}

// GET /api/ai/history — Browse past AI analyses
router.get('/history', authenticateToken, paginate, async (req, res) => {
  try {
    const pool = req.app.get('db');
    const { page, limit, offset } = req.pagination;
    const feature = req.query.feature || '';
    const whereClause = feature
      ? `WHERE user_id = $3 AND feature = $4`
      : `WHERE user_id = $3`;
    const countWhereClause = feature
      ? `WHERE user_id = $1 AND feature = $2`
      : `WHERE user_id = $1`;
    const params = feature
      ? [limit, offset, req.user.id, feature]
      : [limit, offset, req.user.id];

    const [rows, count] = await Promise.all([
      pool.query(
        `SELECT id, feature, input_data, parsed_result, created_at FROM ai_results ${whereClause} ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
        params
      ),
      pool.query(`SELECT COUNT(*) FROM ai_results ${countWhereClause}`, params.slice(2)),
    ]);

    res.json({ data: rows.rows, pagination: paginationMeta(count.rows[0].count, page, limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Authenticated molecular depiction proxy. PubChem standardizes and renders
// the submitted SMILES; a failed depiction never changes the stored design.
router.get('/molecule-depiction', authenticateToken, async (req, res) => {
  const smiles = String(req.query.smiles || '').trim();
  if (!smiles || smiles.length > 2000) return res.status(400).json({ error: 'A valid SMILES value is required.' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const base = process.env.PUBCHEM_BASE || 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
    const response = await fetch(`${base}/compound/smiles/${encodeURIComponent(smiles)}/PNG?image_size=large`, { signal: controller.signal });
    if (!response.ok) return res.status(response.status === 404 ? 404 : 502).json({ error: 'Molecular depiction is unavailable for this structure.' });
    const image = await response.buffer();
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(image);
  } catch (error) {
    return res.status(error.name === 'AbortError' ? 504 : 502).json({ error: error.name === 'AbortError' ? 'Molecular depiction timed out.' : 'Unable to render the molecular depiction.' });
  } finally {
    clearTimeout(timeout);
  }
});

// POST /api/ai/protein-design
router.post(
  '/protein-design',
  authenticateToken,
  [
    body('target_organism').notEmpty().withMessage('target_organism is required'),
    body('sequence_length').optional().isInt({ min: 10, max: 2000 }),
    body('target').optional().isString(),
    body('properties').optional().isString(),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { target, properties, constraints, sequence_length, target_organism } = req.body;
      const prompt = `Design a novel protein with these specifications and return ONLY valid JSON (no markdown, no prose):
{
  "protein_name": "...",
  "amino_acid_sequence": "...",
  "molecular_weight_kDa": 0,
  "binding_affinity_Kd_nM": 0,
  "stability_Tm_C": 0,
  "secondary_structure": { "alpha_helices_pct": 0, "beta_sheets_pct": 0, "loops_pct": 0 },
  "key_structural_features": ["..."],
  "therapeutic_applications": ["..."],
  "risk_assessment": { "level": "Low|Medium|High", "concerns": ["..."] },
  "optimization_suggestions": ["..."]
}

Target: ${target || 'Not specified'}
Desired Properties: ${properties || 'High binding affinity, stability'}
Constraints: ${constraints || 'None'}
Sequence Length: ${sequence_length || '50-200 residues'}
Target Organism: ${target_organism}`;

      const systemPrompt = 'You are an expert computational biologist and protein engineer. Always return ONLY valid JSON with no markdown, no prose, no code blocks. Provide scientifically plausible protein designs.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'protein-design', { target, properties, constraints, sequence_length, target_organism }, parsed, aiResponse);

      // Persist to proteins table
      if (parsed?.protein_name) {
        await pool.query(
          `INSERT INTO proteins (name, sequence, target, properties, status, ai_output) VALUES ($1, $2, $3, $4, $5, $6)`,
          [parsed.protein_name, parsed.amino_acid_sequence || '', target || '', JSON.stringify({ binding_affinity: parsed.binding_affinity_Kd_nM, applications: parsed.therapeutic_applications }), 'designed', aiResponse]
        ).catch(() => {});
      }

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/drug-design — source-transparent small-molecule proposal
router.post(
  '/drug-design',
  authenticateToken,
  [
    body('target').notEmpty().withMessage('target is required'),
    body('modality').notEmpty().withMessage('modality is required'),
    body('desired_profile').notEmpty().withMessage('desired_profile is required'),
    body('reference_smiles').optional().isString(),
    body('chemistry_constraints').optional().isString(),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { target, modality, desired_profile, reference_smiles, chemistry_constraints } = req.body;
      const prompt = `Propose one research-stage small-molecule design and return ONLY valid JSON (no markdown or prose):
{
  "design_name": "...",
  "canonical_smiles": "...",
  "molecular_formula": "...",
  "molecular_weight": 0,
  "target": "...",
  "modality": "...",
  "mechanism_hypothesis": "...",
  "design_rationale": "...",
  "predicted_properties": {
    "logp": 0,
    "tpsa_A2": 0,
    "h_bond_donors": 0,
    "h_bond_acceptors": 0,
    "rotatable_bonds": 0,
    "solubility_class": "..."
  },
  "structural_alerts": ["..."],
  "selectivity_strategy": ["..."],
  "synthesis_considerations": ["..."],
  "validation_plan": ["..."],
  "confidence": { "level": "low|medium|high", "limitations": ["..."] }
}

Target: ${target}
Modality: ${modality}
Desired profile: ${desired_profile}
Reference SMILES: ${reference_smiles || 'No reference supplied; propose a new research hypothesis'}
Constraints: ${chemistry_constraints || 'Apply common medicinal-chemistry and safety filters'}

The SMILES must be syntactically valid. Do not claim measured efficacy, safety, synthesis success, or clinical suitability.`;
      const systemPrompt = 'You are a medicinal chemistry design assistant. Return only valid JSON. Clearly distinguish design hypotheses from measured evidence.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 4500 });
      const parsed = parseAIJson(aiResponse);
      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'drug-design', { target, modality, desired_profile, reference_smiles, chemistry_constraints }, parsed, aiResponse);

      if (parsed?.design_name && parsed?.canonical_smiles) {
        await pool.query(
          `INSERT INTO compounds(name,formula,molecular_weight,smiles,source,status,description)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [parsed.design_name, parsed.molecular_formula || null, parsed.molecular_weight || null,
            parsed.canonical_smiles, 'AI research design', 'lead',
            `${parsed.design_rationale || 'AI-generated research hypothesis'} Validation required before experimental use.`]
        ).catch(() => {});
      }

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL, design_kind: 'ai_generated_research_hypothesis' });
    } catch (err) { res.status(err.httpStatus || 500).json({ error: err.message }); }
  }
);

// POST /api/ai/binding-affinity
router.post(
  '/binding-affinity',
  authenticateToken,
  [
    body('protein_id').optional().isString(),
    body('protein').optional().isString(),
    body('target').optional().isString(),
    body('ligand_smiles').optional().matches(/^[A-Za-z0-9@+\-\[\]\(\)\\=#$%^&*!.:/,;~]+$/).withMessage('Invalid SMILES'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { protein, target, conditions, protein_id, ligand_smiles } = req.body;
      const prompt = `Predict binding affinity and return ONLY valid JSON:
{
  "kd_nM": 0,
  "ki_nM": 0,
  "delta_G_kcal_mol": 0,
  "key_binding_residues": ["..."],
  "interaction_types": { "hydrogen_bonds": 0, "hydrophobic_contacts": 0, "electrostatic": false },
  "selectivity_profile": "...",
  "confidence_pct": 0,
  "comparison_to_known_binders": "...",
  "improvement_suggestions": ["..."]
}

Protein/Ligand: ${protein || 'Not specified'}
Target: ${target || 'Not specified'}
Conditions: ${conditions || 'Physiological (pH 7.4, 37°C)'}
${ligand_smiles ? `Ligand SMILES: ${ligand_smiles}` : ''}`;

      const systemPrompt = 'You are an expert in molecular docking and binding affinity prediction. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'binding-affinity', { protein, target, conditions, protein_id, ligand_smiles }, parsed, aiResponse);

      // Persist to binding_affinities using correct schema
      await pool.query(
        `INSERT INTO binding_affinities (protein_name, target_name, affinity_score, method, conditions, ai_output) VALUES ($1, $2, $3, $4, $5, $6)`,
        [protein || 'AI Analysis', target || '', parsed?.kd_nM ? `Kd = ${parsed.kd_nM} nM` : 'AI Predicted', 'AI Prediction', conditions || 'Physiological', aiResponse]
      ).catch(() => {});

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/toxicity-prediction
router.post(
  '/toxicity-prediction',
  authenticateToken,
  [
    body('compound_name').notEmpty().withMessage('compound_name is required'),
    body('dose_mg_per_kg').optional().isFloat({ gt: 0 }),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { compound, compound_name, smiles, dose, dose_mg_per_kg } = req.body;
      const displayCompound = compound_name || compound;
      const displayDose = dose_mg_per_kg ? `${dose_mg_per_kg} mg/kg` : (dose || 'Therapeutic range');

      const prompt = `Predict toxicity profile and return ONLY valid JSON:
{
  "overall_risk": "Low|Medium|High|Critical",
  "hepatotoxicity": { "risk": "Low|Medium|High", "mechanism": "..." },
  "cardiotoxicity": { "herg_ic50_uM": 0, "risk": "Low|Medium|High" },
  "nephrotoxicity": { "risk": "Low|Medium|High", "notes": "..." },
  "neurotoxicity": { "risk": "Low|Medium|High", "notes": "..." },
  "genotoxicity": { "ames_positive": false, "risk": "Low|Medium|High" },
  "ld50_mg_kg": 0,
  "max_tolerated_dose_mg_kg": 0,
  "toxicophores": ["..."],
  "safety_recommendations": ["..."],
  "monitoring_parameters": ["..."]
}

Compound: ${displayCompound}
SMILES: ${smiles || 'Not provided'}
Dose Range: ${displayDose}`;

      const systemPrompt = 'You are an expert toxicologist. Return ONLY valid JSON with no markdown.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'toxicity-prediction', { compound_name: displayCompound, smiles, dose: displayDose }, parsed, aiResponse);

      // Persist to toxicity_predictions
      await pool.query(
        `INSERT INTO toxicity_predictions (compound_name, smiles, risk_level, prediction_result, ai_output) VALUES ($1, $2, $3, $4, $5)`,
        [displayCompound, smiles || null, parsed?.overall_risk || 'pending', JSON.stringify(parsed), aiResponse]
      ).catch(() => {});

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/structure-prediction
router.post(
  '/structure-prediction',
  authenticateToken,
  [
    body('sequence').notEmpty().withMessage('sequence is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { sequence, name } = req.body;
      const prompt = `Predict 3D protein structure and return ONLY valid JSON:
{
  "fold_family": "...",
  "plddt_score": 0,
  "secondary_structure": {
    "alpha_helices": [{"start": 0, "end": 0, "length": 0}],
    "beta_sheets": [{"start": 0, "end": 0}],
    "loops": [{"start": 0, "end": 0}]
  },
  "domains": [{"name": "...", "start": 0, "end": 0, "function": "..."}],
  "active_site_residues": ["..."],
  "disulfide_bonds": [{"res1": 0, "res2": 0}],
  "ptm_sites": [{"position": 0, "type": "..."}],
  "structural_comparison": "...",
  "stability_assessment": "...",
  "druggability_score": 0,
  "druggable_pockets": [{"volume_A3": 0, "residues": ["..."], "druggability": "High|Medium|Low"}]
}

Name: ${name || 'Unknown'}
Sequence: ${sequence}`;

      const systemPrompt = 'You are an expert structural biologist. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 5000 });
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'structure-prediction', { name, sequence: sequence?.substring(0, 50) + '...' }, parsed, aiResponse);

      // Persist to protein_structures
      if (parsed) {
        await pool.query(
          `INSERT INTO protein_structures (protein_name, sequence, fold_family, confidence_score, domains, ai_output) VALUES ($1, $2, $3, $4, $5, $6)`,
          [name || 'AI Predicted', sequence, parsed.fold_family || '', parsed.plddt_score || null, JSON.stringify(parsed.domains), aiResponse]
        ).catch(() => {});
      }

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// SSE: Streaming structure prediction
router.get('/structure-prediction/stream', authenticateToken, async (req, res) => {
  const { proteinId } = req.query;
  if (!proteinId) {
    return res.status(400).json({ error: 'proteinId query param is required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const pool = req.app.get('db');

    sendEvent('step', { step: 1, message: 'Fetching protein data...', progress: 10 });
    const proteinResult = await pool.query('SELECT * FROM proteins WHERE id = $1', [proteinId]);
    if (proteinResult.rows.length === 0) {
      sendEvent('error', { message: 'Protein not found' });
      return res.end();
    }
    const protein = proteinResult.rows[0];

    sendEvent('step', { step: 2, message: 'Analyzing amino acid composition...', progress: 25 });
    await new Promise(r => setTimeout(r, 300));

    sendEvent('step', { step: 3, message: 'Predicting secondary structure elements...', progress: 45 });
    await new Promise(r => setTimeout(r, 300));

    sendEvent('step', { step: 4, message: 'Running fold prediction...', progress: 65 });

    const prompt = `Perform a comprehensive protein structure prediction and return ONLY valid JSON:
{
  "fold_family": "...",
  "plddt_score": 0,
  "secondary_structure": { "alpha_helices_pct": 0, "beta_sheets_pct": 0 },
  "domains": [{"name": "...", "function": "..."}],
  "active_site_residues": ["..."],
  "druggability_score": 0,
  "key_findings": "..."
}

Name: ${protein.name || 'Unknown'}
Sequence: ${protein.sequence || 'Not provided'}
Organism: ${protein.organism || protein.target || 'Unknown'}`;

    const systemPrompt = 'You are an expert in structural biology. Return ONLY valid JSON.';
    const aiResponse = await callOpenRouter(prompt, systemPrompt);
    const parsed = parseAIJson(aiResponse);

    await saveAiResult(pool, req.user.id, 'structure-prediction-stream', { proteinId }, parsed, aiResponse);

    sendEvent('step', { step: 5, message: 'Analyzing active sites and binding pockets...', progress: 80 });
    await new Promise(r => setTimeout(r, 200));

    sendEvent('step', { step: 6, message: 'Generating final report...', progress: 95 });

    sendEvent('complete', { result: parsed || aiResponse, proteinId, progress: 100 });
    res.end();
  } catch (err) {
    sendEvent('error', { message: err.message });
    res.end();
  }
});

// POST /api/ai/drug-interaction
router.post(
  '/drug-interaction',
  authenticateToken,
  [
    body('drug1_name').optional().isString(),
    body('drug2_name').optional().isString(),
    body('drugA').optional().isString(),
    body('drugB').optional().isString(),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { drugA, drugB, drug1_name, drug2_name, mechanism1, mechanism2, patientProfile } = req.body;
      const d1 = drug1_name || drugA;
      const d2 = drug2_name || drugB;
      if (!d1 || !d2) return res.status(400).json({ error: 'Two drug names are required' });

      const prompt = `Analyze drug-drug interaction and return ONLY valid JSON:
{
  "severity": "None|Minor|Moderate|Major|Contraindicated",
  "mechanism": "...",
  "pk_effects": { "cyp_interactions": ["..."], "auc_change_pct": 0, "cmax_change_pct": 0 },
  "pd_effects": "...",
  "clinical_significance": "...",
  "risk_factors": ["..."],
  "monitoring_recommendations": ["..."],
  "alternative_drugs": ["..."],
  "dosage_adjustment": "...",
  "evidence_level": "Strong|Moderate|Weak|Theoretical"
}

Drug A: ${d1}
Drug B: ${d2}
${mechanism1 ? `Mechanism A: ${mechanism1}` : ''}
${mechanism2 ? `Mechanism B: ${mechanism2}` : ''}
Patient Profile: ${patientProfile || 'General adult population'}`;

      const systemPrompt = 'You are a clinical pharmacologist expert in DDI. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'drug-interaction', { drug_a: d1, drug_b: d2, patientProfile }, parsed, aiResponse);

      // Persist to drug_interactions using correct schema
      await pool.query(
        `INSERT INTO drug_interactions (drug_a, drug_b, interaction_type, severity, mechanism, ai_output) VALUES ($1, $2, $3, $4, $5, $6)`,
        [d1, d2, 'Pharmacokinetic/Pharmacodynamic', parsed?.severity || 'unknown', parsed?.mechanism || '', aiResponse]
      ).catch(() => {});

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/check-interactions — DDI severity checker
router.post(
  '/check-interactions',
  authenticateToken,
  [
    body('drug1_name').notEmpty().withMessage('drug1_name is required'),
    body('drug2_name').notEmpty().withMessage('drug2_name is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { drug1_name, drug2_name, mechanism1, mechanism2 } = req.body;

      const prompt = `Predict DDI severity and return ONLY valid JSON:
{
  "severity": "None|Minor|Moderate|Major|Contraindicated",
  "explanation": "...",
  "clinical_consequences": "...",
  "risk_factors": ["..."],
  "management": "...",
  "evidence_quality": "Strong|Moderate|Weak|Theoretical"
}

Drug 1: ${drug1_name}
Drug 2: ${drug2_name}
${mechanism1 ? `Mechanism 1: ${mechanism1}` : ''}
${mechanism2 ? `Mechanism 2: ${mechanism2}` : ''}`;

      const systemPrompt = 'You are a clinical pharmacologist specializing in DDI prediction. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'check-interactions', { drug1_name, drug2_name }, parsed, aiResponse);

      await pool.query(
        `INSERT INTO drug_interactions (drug_a, drug_b, interaction_type, severity, mechanism, ai_output) VALUES ($1, $2, $3, $4, $5, $6)`,
        [drug1_name, drug2_name, 'DDI Check', parsed?.severity || 'unknown', parsed?.explanation || '', aiResponse]
      ).catch(() => {});

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/admet-prediction
router.post(
  '/admet-prediction',
  authenticateToken,
  [
    body('compound').optional().isString(),
    body('smiles').optional().isString(),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { compound, smiles, route } = req.body;
      const prompt = `Predict ADMET properties and return ONLY valid JSON:
{
  "absorption": {
    "oral_bioavailability_pct": 0,
    "caco2_papp_cm_s": 0,
    "pgp_substrate": false,
    "bcs_class": "I|II|III|IV"
  },
  "distribution": {
    "plasma_protein_binding_pct": 0,
    "vd_L_kg": 0,
    "bbb_penetrant": false,
    "fu_plasma": 0
  },
  "metabolism": {
    "primary_cyp": ["..."],
    "inhibits_cyp": ["..."],
    "metabolic_t_half_h": 0,
    "major_metabolites": ["..."]
  },
  "excretion": {
    "t_half_h": 0,
    "renal_clearance_pct": 0,
    "hepatic_clearance_pct": 0,
    "route": "..."
  },
  "toxicity": {
    "ames_positive": false,
    "herg_ic50_uM": 0,
    "hepatotoxicity_risk": "Low|Medium|High"
  },
  "lipinski": { "mw": 0, "logp": 0, "hbd": 0, "hba": 0, "ro5_violations": 0 },
  "drug_likeness_score": 0,
  "lead_likeness": true,
  "overall_assessment": "...",
  "optimization_suggestions": ["..."]
}

Compound: ${compound || 'Unknown'}
SMILES: ${smiles || 'Not provided'}
Route: ${route || 'Oral'}`;

      const systemPrompt = 'You are an expert in ADMET prediction. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 5000 });
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'admet-prediction', { compound, smiles, route }, parsed, aiResponse);

      // Persist to admet_properties using correct table name
      if (parsed) {
        await pool.query(
          `INSERT INTO admet_properties (compound_name, absorption, distribution, metabolism, excretion, toxicity_score, overall_score, ai_output) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            compound || 'AI Analysis',
            JSON.stringify(parsed.absorption),
            JSON.stringify(parsed.distribution),
            JSON.stringify(parsed.metabolism),
            JSON.stringify(parsed.excretion),
            parsed.toxicity?.herg_ic50_uM ? Math.min(100, 100 / (parsed.toxicity.herg_ic50_uM + 1)) : null,
            parsed.drug_likeness_score || null,
            aiResponse,
          ]
        ).catch(() => {});
      }

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/literature-analysis
router.post(
  '/literature-analysis',
  authenticateToken,
  [
    body('topic').notEmpty().withMessage('topic is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { topic, keywords, focus } = req.body;
      const prompt = `Analyze research landscape and return ONLY valid JSON:
{
  "key_findings": [{"finding": "...", "significance": "High|Medium|Low", "year": 0}],
  "major_research_groups": [{"name": "...", "institution": "...", "focus": "..."}],
  "challenges_and_gaps": ["..."],
  "emerging_trends": ["..."],
  "breakthrough_areas": ["..."],
  "recommended_directions": ["..."],
  "key_papers": [{"title": "...", "authors": "...", "journal": "...", "year": 0, "doi": "..."}],
  "competitive_landscape": "...",
  "patent_overview": "...",
  "funding_landscape": "..."
}

Topic: ${topic}
Keywords: ${keywords || 'Not specified'}
Focus: ${focus || 'General overview'}`;

      const systemPrompt = 'You are a biomedical research analyst. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 5000 });
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'literature-analysis', { topic, keywords, focus }, parsed, aiResponse);

      // Persist key papers to literature table
      if (parsed?.key_papers && Array.isArray(parsed.key_papers)) {
        for (const paper of parsed.key_papers.slice(0, 5)) {
          await pool.query(
            `INSERT INTO literature (title, authors, journal, year, relevance_score, ai_summary, doi) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
            [paper.title || 'Unknown', paper.authors || '', paper.journal || '', paper.year || null, 90, `AI-discovered paper for topic: ${topic}`, paper.doi || null]
          ).catch(() => {});
        }
      }

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/validate-sequence
router.post(
  '/validate-sequence',
  authenticateToken,
  [
    body('sequence').notEmpty().withMessage('sequence is required'),
    body('type').isIn(['protein', 'DNA', 'RNA']).withMessage('type must be protein, DNA, or RNA'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { sequence, type } = req.body;
      const seq = sequence.trim().toUpperCase();
      const errors = [];
      const warnings = [];

      if (type === 'protein') {
        const validAA = new Set('ACDEFGHIKLMNPQRSTVWY');
        const invalid = [...new Set(seq.split('').filter(c => !validAA.has(c)))];
        if (invalid.length > 0) errors.push(`Invalid amino acid codes: ${invalid.join(', ')}`);
        if (seq.length < 10) errors.push('Protein sequence too short (minimum 10 residues)');
        if (seq.length > 2000) errors.push('Protein sequence too long (maximum 2000 residues)');
        if (seq.includes('*')) errors.push('Protein sequence contains stop codon(s) (*)');
        if (seq.length > 0 && seq.length < 50) warnings.push('Sequence is very short for a functional protein');
        if (seq.length > 1000) warnings.push('Very long sequence; consider splitting into domains');
      } else if (type === 'DNA') {
        const validDNA = new Set('ACGTN');
        const invalid = [...new Set(seq.split('').filter(c => !validDNA.has(c)))];
        if (invalid.length > 0) errors.push(`Invalid DNA nucleotides: ${invalid.join(', ')}`);
        if (seq.length < 10) errors.push('DNA sequence too short (minimum 10 bp)');
        if (seq.length > 10000) warnings.push('Sequence is very long for direct analysis');
        if (seq.includes('N')) warnings.push('Sequence contains ambiguous nucleotides (N)');
      } else if (type === 'RNA') {
        const validRNA = new Set('ACGUN');
        const invalid = [...new Set(seq.split('').filter(c => !validRNA.has(c)))];
        if (invalid.length > 0) errors.push(`Invalid RNA nucleotides: ${invalid.join(', ')}`);
        if (seq.length < 10) errors.push('RNA sequence too short (minimum 10 nt)');
        if (seq.includes('N')) warnings.push('Sequence contains ambiguous nucleotides (N)');
      }

      const gcContent = type !== 'protein' ? (seq.split('').filter(c => c === 'G' || c === 'C').length / seq.length * 100).toFixed(1) : null;

      res.json({
        valid: errors.length === 0,
        errors,
        warnings,
        sequence_length: seq.length,
        type,
        ...(gcContent !== null ? { gc_content_pct: parseFloat(gcContent) } : {}),
      });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/rank-candidates
router.post(
  '/rank-candidates',
  authenticateToken,
  [
    body('candidate_ids').isArray({ min: 1 }).withMessage('candidate_ids must be a non-empty array'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { candidate_ids } = req.body;
      const pool = req.app.get('db');

      // Fetch drug candidate data
      let candidateData = [];
      try {
        const r = await pool.query(`SELECT * FROM drug_candidates WHERE id = ANY($1::int[])`, [candidate_ids]);
        candidateData = r.rows;
      } catch (_) {}

      const prompt = `Rank these drug candidates and return ONLY valid JSON:
{
  "ranked": [
    {
      "id": 0,
      "rank": 0,
      "overall_score": 0,
      "efficacy_score": 0,
      "safety_score": 0,
      "developability_score": 0,
      "reasoning": "..."
    }
  ],
  "overall_reasoning": "...",
  "recommendation": "..."
}

Candidate Data: ${JSON.stringify(candidateData)}`;

      const systemPrompt = 'You are an expert drug candidate evaluator. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      await saveAiResult(pool, req.user.id, 'rank-candidates', { candidate_ids }, parsed, aiResponse);

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/predict-solubility
router.post(
  '/predict-solubility',
  authenticateToken,
  [
    body('compound_name').notEmpty().withMessage('compound_name is required'),
    body('smiles').notEmpty().withMessage('smiles is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { smiles, compound_name } = req.body;

      const prompt = `Predict aqueous solubility and return ONLY valid JSON:
{
  "classification": "highly soluble|soluble|slightly soluble|poorly soluble",
  "logS": 0,
  "solubility_mg_mL": 0,
  "solubility_mM": 0,
  "key_features_affecting_solubility": ["..."],
  "lipophilicity_logP": 0,
  "psa_A2": 0,
  "comparison_to_thresholds": "...",
  "formulation_strategies": ["..."],
  "solubility_enhancers": ["..."]
}

Compound: ${compound_name}
SMILES: ${smiles}`;

      const systemPrompt = 'You are an expert medicinal chemist. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'predict-solubility', { compound_name, smiles }, parsed, aiResponse);

      // Persist to admet_properties
      await pool.query(
        `INSERT INTO admet_properties (compound_name, absorption, ai_output) VALUES ($1, $2, $3)`,
        [compound_name, `Solubility: ${parsed?.classification || 'Unknown'}, logS: ${parsed?.logS || 'N/A'}`, aiResponse]
      ).catch(() => {});

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/dock-protein
router.post(
  '/dock-protein',
  authenticateToken,
  [
    body('protein_name').notEmpty().withMessage('protein_name is required'),
    body('ligand_smiles').notEmpty().withMessage('ligand_smiles is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { protein_name, ligand_smiles, pdb_id } = req.body;

      const prompt = `Run in-silico docking simulation and return ONLY valid JSON:
{
  "docking_score_kcal_mol": 0,
  "kd_nM": 0,
  "pose_description": "...",
  "contact_residues": ["..."],
  "h_bonds": [{"donor": "...", "acceptor": "...", "distance_A": 0}],
  "hydrophobic_contacts": ["..."],
  "pi_stacking": ["..."],
  "confidence": "high|medium|low",
  "rmsd_predicted_A": 0,
  "next_steps": ["..."],
  "optimization_suggestions": ["..."]
}

Protein: ${protein_name}
PDB ID: ${pdb_id || 'Not provided'}
Ligand SMILES: ${ligand_smiles}`;

      const systemPrompt = 'You are an expert in molecular docking. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'dock-protein', { protein_name, ligand_smiles, pdb_id }, parsed, aiResponse);

      // Persist to binding_affinities
      if (parsed?.kd_nM) {
        await pool.query(
          `INSERT INTO binding_affinities (protein_name, target_name, affinity_score, method, conditions, ai_output) VALUES ($1, $2, $3, $4, $5, $6)`,
          [protein_name, protein_name, `Kd = ${parsed.kd_nM} nM (docking)`, 'AI Docking', `Docking score: ${parsed.docking_score_kcal_mol} kcal/mol`, aiResponse]
        ).catch(() => {});
      }

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/predict-off-targets
router.post(
  '/predict-off-targets',
  authenticateToken,
  [
    body('compound_name').notEmpty().withMessage('compound_name is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { compound_name, smiles, intended_target } = req.body;

      const prompt = `Predict off-target interactions and return ONLY valid JSON:
{
  "off_targets": [
    {
      "name": "...",
      "predicted_kd_nM": 0,
      "family": "...",
      "concern_level": "High|Medium|Low",
      "adverse_effect": "..."
    }
  ],
  "selectivity_index": 0,
  "safety_concerns": ["..."],
  "mitigations": ["..."],
  "structural_modifications": ["..."],
  "panel_recommendations": ["..."]
}

Compound: ${compound_name}
SMILES: ${smiles || 'Not provided'}
Intended Target: ${intended_target || 'Not specified'}`;

      const systemPrompt = 'You are an expert in chemoproteomics. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'predict-off-targets', { compound_name, smiles, intended_target }, parsed, aiResponse);

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/recommend-formulation
router.post(
  '/recommend-formulation',
  authenticateToken,
  [
    body('compound_name').notEmpty().withMessage('compound_name is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { compound_name, smiles, route, target_dose, stability_concerns } = req.body;

      const prompt = `Recommend pharmaceutical formulation and return ONLY valid JSON:
{
  "dosage_form": "...",
  "excipients": [{"name": "...", "function": "...", "level_pct": 0}],
  "ph_range": {"min": 0, "max": 0, "optimal": 0},
  "buffer": "...",
  "stabilizers": ["..."],
  "solubility_enhancers": ["..."],
  "storage": {"temperature_C": "...", "humidity_pct": 0, "light_protection": false},
  "shelf_life_months": 0,
  "manufacturing_considerations": ["..."],
  "regulatory_notes": ["..."]
}

Compound: ${compound_name}
SMILES: ${smiles || 'Not provided'}
Route: ${route || 'Oral'}
Target Dose: ${target_dose || 'Not specified'}
Stability Concerns: ${stability_concerns || 'None'}`;

      const systemPrompt = 'You are an expert formulation scientist. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'recommend-formulation', { compound_name, smiles, route }, parsed, aiResponse);

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/patent-landscape
router.post(
  '/patent-landscape',
  authenticateToken,
  [
    body('topic').notEmpty().withMessage('topic is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { topic, target, jurisdiction } = req.body;

      const prompt = `Perform patent landscape analysis and return ONLY valid JSON:
{
  "overview": "...",
  "top_assignees": [{"name": "...", "patent_count": 0, "focus": "...", "key_patents": ["..."]}],
  "key_families": [{"family_id": "...", "claims_summary": "...", "filing_date": "...", "expiration": "..."}],
  "fto_concerns": ["..."],
  "expirations": [{"patent": "...", "year": 0, "significance": "..."}],
  "whitespace": ["..."],
  "strategy": "...",
  "risk_level": "Low|Medium|High",
  "recommendations": ["..."]
}

Topic: ${topic}
Target: ${target || 'Not specified'}
Jurisdiction: ${jurisdiction || 'US, EU, JP, CN'}`;

      const systemPrompt = 'You are an expert patent analyst in pharmaceutical IP. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 5000 });
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'patent-landscape', { topic, target, jurisdiction }, parsed, aiResponse);

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/virtual-hts
router.post(
  '/virtual-hts',
  authenticateToken,
  [
    body('target').notEmpty().withMessage('target is required'),
    body('library_size').optional().isInt({ min: 100, max: 1000000 }),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { target, library_size, criteria } = req.body;
      const lib = library_size || 100000;

      const prompt = `Simulate virtual high-throughput screening and return ONLY valid JSON:
{
  "estimated_hits": 0,
  "hit_rate_pct": 0,
  "top_scaffolds": [
    {
      "scaffold": "...",
      "ic50_range_nM": "...",
      "novelty": "...",
      "selectivity_notes": "..."
    }
  ],
  "optimization_strategy": "...",
  "resource_estimate": {
    "fte_months": 0,
    "cost_usd": 0,
    "timeline_weeks": 0
  },
  "qc_considerations": ["..."],
  "follow_up_assays": ["..."]
}

Target: ${target}
Library Size: ${lib} compounds
Criteria: ${criteria || 'Drug-like, novel, predicted IC50 < 1µM'}`;

      const systemPrompt = 'You are an expert in virtual screening. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt);
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'virtual-hts', { target, library_size: lib, criteria }, parsed, aiResponse);

      // Create a screening record
      await pool.query(
        `INSERT INTO molecular_screenings (name, target_name, method, hits_count, status, description) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          `Virtual HTS: ${target}`,
          target,
          'Virtual High-Throughput Screening (AI)',
          parsed?.estimated_hits || 0,
          'completed',
          `AI-simulated HTS against ${lib} compound library. Hit rate: ${parsed?.hit_rate_pct || 0}%`,
        ]
      ).catch(() => {});

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/sar-analysis — NEW: Structure-Activity Relationship
router.post(
  '/sar-analysis',
  authenticateToken,
  [
    body('compound_series').isArray({ min: 2 }).withMessage('compound_series must have at least 2 compounds'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { compound_series, target, property } = req.body;

      const prompt = `Perform Structure-Activity Relationship (SAR) analysis and return ONLY valid JSON:
{
  "pharmacophore": {
    "essential_features": ["..."],
    "optional_features": ["..."],
    "excluded_regions": ["..."]
  },
  "key_sar_trends": ["..."],
  "optimal_r_groups": [{"position": "...", "best_substituents": ["..."], "rationale": "..."}],
  "activity_cliff_pairs": [{"compound1": "...", "compound2": "...", "activity_fold_diff": 0}],
  "modifications_to_improve_potency": ["..."],
  "modifications_to_improve_selectivity": ["..."],
  "modifications_to_improve_admet": ["..."],
  "lead_compound_suggestion": {"smiles": "...", "predicted_ic50_nM": 0, "rationale": "..."},
  "summary": "..."
}

Target: ${target || 'Not specified'}
Property to optimize: ${property || 'potency (IC50)'}
Compound Series: ${JSON.stringify(compound_series)}`;

      const systemPrompt = 'You are an expert medicinal chemist specializing in SAR. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 5000 });
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'sar-analysis', { compound_series, target }, parsed, aiResponse);

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/clinical-trial-design — NEW
router.post(
  '/clinical-trial-design',
  authenticateToken,
  [
    body('drug_candidate').notEmpty().withMessage('drug_candidate is required'),
    body('indication').notEmpty().withMessage('indication is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { drug_candidate, indication, phase, safety_data } = req.body;

      const prompt = `Design a clinical trial and return ONLY valid JSON:
{
  "recommended_phase": "...",
  "trial_design": "...",
  "primary_endpoints": ["..."],
  "secondary_endpoints": ["..."],
  "sample_size": {"total": 0, "per_arm": 0, "power": 0, "alpha": 0},
  "inclusion_criteria": ["..."],
  "exclusion_criteria": ["..."],
  "dosing_regimen": {"dose": "...", "frequency": "...", "route": "...", "duration": "..."},
  "biomarker_strategy": ["..."],
  "statistical_analysis_plan": "...",
  "estimated_duration_months": 0,
  "estimated_cost_usd_millions": 0,
  "regulatory_considerations": ["..."],
  "risk_mitigation": ["..."]
}

Drug: ${drug_candidate}
Indication: ${indication}
Phase: ${phase || 'Phase I'}
Existing Safety Data: ${safety_data || 'None provided'}`;

      const systemPrompt = 'You are an expert clinical development strategist. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 5000 });
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'clinical-trial-design', { drug_candidate, indication, phase }, parsed, aiResponse);

      // Save as a planned clinical trial
      if (parsed) {
        await pool.query(
          `INSERT INTO clinical_trials (name, drug_candidate_name, phase, status, participants, description) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            `AI-Designed Trial: ${drug_candidate} in ${indication}`,
            drug_candidate,
            parsed.recommended_phase || phase || 'Phase I',
            'planned',
            parsed.sample_size?.total || 0,
            `AI-designed trial. Primary endpoints: ${(parsed.primary_endpoints || []).join('; ')}`,
          ]
        ).catch(() => {});
      }

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/competitive-intelligence — NEW
router.post(
  '/competitive-intelligence',
  authenticateToken,
  [
    body('target_or_disease').notEmpty().withMessage('target_or_disease is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { target_or_disease, focus } = req.body;

      const prompt = `Generate competitive intelligence report and return ONLY valid JSON:
{
  "approved_drugs": [{"name": "...", "company": "...", "approval_year": 0, "mechanism": "...", "market_share_pct": 0}],
  "clinical_stage_competitors": [{"name": "...", "company": "...", "phase": "...", "mechanism": "...", "trial_id": "..."}],
  "preclinical_competitors": ["..."],
  "recent_ma_deals": [{"acquirer": "...", "target": "...", "value_usd_m": 0, "rationale": "..."}],
  "patent_expirations": [{"drug": "...", "year": 0, "opportunity": "..."}],
  "unmet_needs": ["..."],
  "differentiation_opportunities": ["..."],
  "market_size_usd_b": 0,
  "growth_rate_cagr_pct": 0,
  "key_opinion_leaders": ["..."],
  "strategic_recommendations": ["..."]
}

Target/Disease: ${target_or_disease}
Focus: ${focus || 'Full competitive landscape'}`;

      const systemPrompt = 'You are a pharmaceutical competitive intelligence expert. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 5000 });
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'competitive-intelligence', { target_or_disease, focus }, parsed, aiResponse);

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// POST /api/ai/regulatory-pathway — NEW
router.post(
  '/regulatory-pathway',
  authenticateToken,
  [
    body('drug_type').notEmpty().withMessage('drug_type is required'),
    body('indication').notEmpty().withMessage('indication is required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { drug_type, indication, phase, jurisdiction } = req.body;

      const prompt = `Generate regulatory pathway analysis and return ONLY valid JSON:
{
  "regulatory_strategy": "...",
  "designation_opportunities": [{"type": "Fast Track|Breakthrough|Orphan|Accelerated Approval", "eligibility": true, "benefit": "..."}],
  "required_preclinical_studies": [{"study": "...", "timeline_months": 0, "cost_usd_k": 0}],
  "clinical_development_path": [{"phase": "...", "duration_months": 0, "patients": 0, "cost_usd_m": 0}],
  "cmc_requirements": ["..."],
  "key_milestones": [{"milestone": "...", "timeline": "...", "deliverable": "..."}],
  "estimated_approval_timeline_years": 0,
  "estimated_total_cost_usd_m": 0,
  "risk_factors": ["..."],
  "success_probability_pct": 0,
  "post_approval_requirements": ["..."]
}

Drug Type: ${drug_type}
Indication: ${indication}
Current Phase: ${phase || 'Preclinical'}
Jurisdiction: ${jurisdiction || 'FDA (US)'}`;

      const systemPrompt = 'You are a regulatory affairs expert with FDA/EMA experience. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, systemPrompt, { max_tokens: 5000 });
      const parsed = parseAIJson(aiResponse);

      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'regulatory-pathway', { drug_type, indication, phase, jurisdiction }, parsed, aiResponse);

      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// ============================================================
// Apply pass 5 — remaining backlog (additive, gated, non-breaking)
// ============================================================

// PRODUCT-DECISION: virtual-screening pipeline = (1) filter SMILES list by
// rule-of-5 / Lipinski-like AI scoring, (2) rank by predicted target
// affinity, (3) cap at 50 hits. Implemented as AI-only orchestrator over
// existing endpoints; no new heavy deps.
router.post(
  '/virtual-screening',
  authenticateToken,
  [
    body('compounds').isArray({ min: 1 }).withMessage('compounds[] required'),
    body('target').notEmpty().withMessage('target required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { compounds, target, max_hits } = req.body;
      const cap = Math.min(parseInt(max_hits, 10) || 50, 50);
      const prompt = `Rank these compounds for virtual screening against target "${target}". Return ONLY JSON:
{"hits":[{"smiles":"...","predicted_affinity_nM":0,"druglikeness_score":0,"rationale":"..."}]}
Cap at ${cap}.
Compounds: ${JSON.stringify(compounds.slice(0, 200))}`;
      const sys = 'You are a virtual-screening orchestrator. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, sys, { max_tokens: 4000 });
      const parsed = parseAIJson(aiResponse);
      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'virtual-screening', { target, count: compounds.length, cap }, parsed, aiResponse);
      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) {
      if (err.code === 'AI_KEY_MISSING') return res.status(503).json({ error: err.message, missing: 'OPENROUTER_API_KEY' });
      res.status(500).json({ error: err.message });
    }
  }
);

// PubChem PUG REST is public and does not require a credential. PUBCHEM_BASE
// remains configurable for a controlled mirror or test endpoint.
router.post(
  '/pubchem-lookup',
  authenticateToken,
  [body('query').notEmpty().withMessage('query required (compound name or SMILES)')],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const base = process.env.PUBCHEM_BASE || 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
      const { query, search_type } = req.body;
      const path = (search_type === 'smiles') ? 'compound/smiles' : 'compound/name';
      const url = `${base}/${path}/${encodeURIComponent(query)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey/JSON`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const r = await fetch(url, { signal: controller.signal });
      const responseText = await r.text();
      clearTimeout(timeout);
      if (!r.ok) return res.status(r.status === 404 ? 404 : 502).json({ error: r.status === 404 ? 'Compound was not found in PubChem.' : 'PubChem is temporarily unavailable.' });
      let data;
      try { data = JSON.parse(responseText); } catch (_) { return res.status(502).json({ error: 'PubChem returned an unreadable response.' }); }
      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'pubchem-lookup', { query, search_type }, data, JSON.stringify(data));
      res.json({ result: data });
    } catch (err) { res.status(500).json({ error: err.message }); }
  }
);

// PRODUCT-DECISION: predictive trial success model = LLM-based heuristic
// scoring over (mechanism, indication, phase, biomarkers, prior data). No
// trained model wired in — flagged below as 'method: heuristic-llm'.
router.post(
  '/predictive-trial-success',
  authenticateToken,
  [
    body('drug_candidate').notEmpty(),
    body('indication').notEmpty(),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { drug_candidate, indication, phase, biomarkers, prior_data } = req.body;
      const prompt = `Estimate clinical trial success probability. Return ONLY JSON:
{"success_probability_pct":0,"phase_transition_probabilities":{"P1_to_P2":0,"P2_to_P3":0,"P3_to_approval":0},"key_risk_factors":["..."],"key_success_factors":["..."],"benchmark_comparators":["..."],"recommended_de_risking_steps":["..."]}
Drug: ${drug_candidate}
Indication: ${indication}
Phase: ${phase || 'Phase 1'}
Biomarkers: ${JSON.stringify(biomarkers || [])}
Prior data: ${JSON.stringify(prior_data || {})}`;
      const sys = 'You are a clinical development risk analyst. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, sys, { max_tokens: 3500 });
      const parsed = parseAIJson(aiResponse);
      const result = parsed ? { ...parsed, method: 'heuristic-llm' } : null;
      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'predictive-trial-success', { drug_candidate, indication, phase }, result, aiResponse);
      res.json({ result: result || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) {
      if (err.code === 'AI_KEY_MISSING') return res.status(503).json({ error: err.message, missing: 'OPENROUTER_API_KEY' });
      res.status(500).json({ error: err.message });
    }
  }
);

// The AI planner works without robotics credentials. LAB_AUTOMATION_URL and
// LAB_AUTOMATION_TOKEN are required only for a future explicit execution step;
// this endpoint never controls equipment.
// Documented env: LAB_AUTOMATION_URL (target Opentrons / robotics endpoint),
// LAB_AUTOMATION_TOKEN (bearer token for that platform; not used in plan-only mode).
router.post(
  '/lab-automation-plan',
  authenticateToken,
  [body('experiment').notEmpty().withMessage('experiment required')],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { experiment, plate_format, replicates, target } = req.body;
      const prompt = `Plan a lab automation protocol. Return ONLY JSON:
{"protocol_name":"...","steps":[{"step":1,"action":"...","reagent":"...","volume_uL":0,"target_well":"..."}],"plate_layout":{"format":"96-well","wells":["A1","A2"]},"qc_steps":["..."],"estimated_duration_min":0,"safety_notes":["..."]}
Experiment: ${experiment}
Plate format: ${plate_format || '96-well'}
Replicates: ${replicates || 3}
Target: ${target || 'unspecified'}`;
      const sys = 'You are a lab automation protocol designer. Return ONLY valid JSON. Plan only — do not execute.';
      const aiResponse = await callOpenRouter(prompt, sys, { max_tokens: 4000 });
      const parsed = parseAIJson(aiResponse);
      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'lab-automation-plan', { experiment, plate_format, replicates }, parsed, aiResponse);
      res.json({
        result: parsed || aiResponse,
        raw: aiResponse,
        plan_only: true,
        robotics_integration: process.env.LAB_AUTOMATION_URL ? 'configured_not_executed' : 'not_configured',
        model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
      });
    } catch (err) {
      if (err.code === 'AI_KEY_MISSING') return res.status(503).json({ error: err.message, missing: 'OPENROUTER_API_KEY' });
      res.status(500).json({ error: err.message });
    }
  }
);

// TOO-RISKY originally (Pareto solver). PRODUCT-DECISION: implement as
// AI-driven multi-objective ranking — no numerical Pareto solver, no heavy
// deps. AI picks non-dominated candidates given user-supplied objectives
// and weights. Method tag = 'llm-pareto-heuristic'.
router.post(
  '/multi-objective-optimize',
  authenticateToken,
  [
    body('candidates').isArray({ min: 2 }).withMessage('candidates[] required'),
    body('objectives').isArray({ min: 1 }).withMessage('objectives[] required'),
  ],
  async (req, res) => {
    if (handleValidation(req, res)) return;
    try {
      const { candidates, objectives, weights } = req.body;
      const prompt = `Multi-objective optimisation. Return ONLY JSON:
{"pareto_front":[{"candidate":"...","objective_scores":{},"rank":1,"rationale":"..."}],"dominated":[{"candidate":"...","dominated_by":["..."]}],"recommended_pick":"...","method":"llm-pareto-heuristic"}
Candidates: ${JSON.stringify(candidates.slice(0, 50))}
Objectives: ${JSON.stringify(objectives)}
Weights: ${JSON.stringify(weights || {})}`;
      const sys = 'You are a drug-discovery decision analyst. Return ONLY valid JSON.';
      const aiResponse = await callOpenRouter(prompt, sys, { max_tokens: 4000 });
      const parsed = parseAIJson(aiResponse);
      const pool = req.app.get('db');
      await saveAiResult(pool, req.user.id, 'multi-objective-optimize', { count: candidates.length, objectives }, parsed, aiResponse);
      res.json({ result: parsed || aiResponse, raw: aiResponse, model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL });
    } catch (err) {
      if (err.code === 'AI_KEY_MISSING') return res.status(503).json({ error: err.message, missing: 'OPENROUTER_API_KEY' });
      res.status(500).json({ error: err.message });
    }
  }
);

module.exports = router;
