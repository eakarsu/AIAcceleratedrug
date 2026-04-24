const express = require('express');
const router = express.Router();
const fetch = require('node-fetch');
const { authenticateToken } = require('../middleware/auth');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

async function callOpenRouter(prompt, systemPrompt) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'AI Drug Discovery Platform',
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(data.error.message || 'OpenRouter API error');
  }
  return data.choices[0].message.content;
}

// Generate Protein Design
router.post('/protein-design', authenticateToken, async (req, res) => {
  try {
    const { target, properties, constraints } = req.body;
    const prompt = `Design a novel protein with the following specifications:
Target: ${target}
Desired Properties: ${properties}
Constraints: ${constraints || 'None specified'}

Please provide:
1. A protein name suggestion
2. An amino acid sequence (realistic length 50-200 residues)
3. Predicted molecular weight
4. Predicted binding affinity score (Kd in nM)
5. Key structural features
6. Stability prediction (Tm in °C)
7. Potential therapeutic applications
8. Risk assessment
Format your response as structured data.`;

    const systemPrompt = 'You are an expert computational biologist and protein engineer. Provide scientifically plausible protein designs with realistic parameters. Always include amino acid sequences using standard single-letter codes.';

    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    const pool = req.app.get('db');
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, prompt, response) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'protein-design', prompt, aiResponse]
    );

    res.json({ result: aiResponse, model: process.env.OPENROUTER_MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Binding Affinity Prediction
router.post('/binding-affinity', authenticateToken, async (req, res) => {
  try {
    const { protein, target, conditions } = req.body;
    const prompt = `Predict the binding affinity between:
Protein/Ligand: ${protein}
Target: ${target}
Conditions: ${conditions || 'Physiological (pH 7.4, 37°C)'}

Provide:
1. Predicted Kd (dissociation constant)
2. Predicted Ki (inhibition constant)
3. Free energy of binding (ΔG)
4. Key binding residues and interactions
5. Selectivity profile
6. Confidence score (0-100%)
7. Comparison to known binders
8. Suggestions for improvement`;

    const systemPrompt = 'You are an expert in molecular docking and binding affinity prediction. Provide scientifically accurate predictions with proper units and confidence intervals.';
    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    const pool = req.app.get('db');
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, prompt, response) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'binding-affinity', prompt, aiResponse]
    );

    res.json({ result: aiResponse, model: process.env.OPENROUTER_MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toxicity Prediction
router.post('/toxicity-prediction', authenticateToken, async (req, res) => {
  try {
    const { compound, smiles, dose } = req.body;
    const prompt = `Predict toxicity profile for:
Compound: ${compound}
SMILES: ${smiles || 'Not provided'}
Dose Range: ${dose || 'Therapeutic range'}

Provide:
1. Overall toxicity risk level (Low/Medium/High/Critical)
2. Hepatotoxicity risk
3. Cardiotoxicity risk (hERG liability)
4. Nephrotoxicity risk
5. Neurotoxicity risk
6. Genotoxicity risk
7. LD50 estimate
8. Maximum tolerated dose estimate
9. Key toxicophores identified
10. Safety recommendations`;

    const systemPrompt = 'You are an expert toxicologist specializing in drug safety assessment. Provide comprehensive toxicity predictions with proper risk categorization.';
    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    const pool = req.app.get('db');
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, prompt, response) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'toxicity-prediction', prompt, aiResponse]
    );

    res.json({ result: aiResponse, model: process.env.OPENROUTER_MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Protein Structure Prediction
router.post('/structure-prediction', authenticateToken, async (req, res) => {
  try {
    const { sequence, name } = req.body;
    const prompt = `Predict the 3D structure for the following protein:
Name: ${name || 'Unknown Protein'}
Sequence: ${sequence}

Provide:
1. Predicted secondary structure elements (alpha helices, beta sheets, loops)
2. Predicted fold family
3. Confidence score (pLDDT-like, 0-100)
4. Key structural domains
5. Active site prediction
6. Disulfide bond predictions
7. Post-translational modification sites
8. Structural comparison to known proteins
9. Stability assessment
10. Druggability assessment`;

    const systemPrompt = 'You are an expert in structural biology and protein folding prediction. Provide detailed structural predictions with confidence metrics similar to AlphaFold.';
    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    const pool = req.app.get('db');
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, prompt, response) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'structure-prediction', prompt, aiResponse]
    );

    res.json({ result: aiResponse, model: process.env.OPENROUTER_MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Drug Interaction Check
router.post('/drug-interaction', authenticateToken, async (req, res) => {
  try {
    const { drugA, drugB, patientProfile } = req.body;
    const prompt = `Analyze potential drug-drug interaction:
Drug A: ${drugA}
Drug B: ${drugB}
Patient Profile: ${patientProfile || 'General adult population'}

Provide:
1. Interaction severity (None/Mild/Moderate/Severe/Contraindicated)
2. Mechanism of interaction
3. Pharmacokinetic effects (CYP enzyme interactions)
4. Pharmacodynamic effects
5. Clinical significance
6. Risk factors
7. Monitoring recommendations
8. Alternative drug suggestions
9. Dosage adjustment recommendations
10. Evidence level (Strong/Moderate/Weak/Theoretical)`;

    const systemPrompt = 'You are a clinical pharmacologist expert in drug-drug interactions. Provide evidence-based interaction assessments with clinical recommendations.';
    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    const pool = req.app.get('db');
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, prompt, response) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'drug-interaction', prompt, aiResponse]
    );

    res.json({ result: aiResponse, model: process.env.OPENROUTER_MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ADMET Property Prediction
router.post('/admet-prediction', authenticateToken, async (req, res) => {
  try {
    const { compound, smiles, route } = req.body;
    const prompt = `Predict ADMET properties for:
Compound: ${compound}
SMILES: ${smiles || 'Not provided'}
Route of Administration: ${route || 'Oral'}

Provide detailed predictions for:
1. Absorption: Oral bioavailability, Caco-2 permeability, P-gp substrate
2. Distribution: Plasma protein binding, Volume of distribution, BBB penetration
3. Metabolism: Primary CYP enzymes, Metabolic stability, Major metabolites
4. Excretion: Half-life, Clearance route, Renal clearance
5. Toxicity: Ames test prediction, hERG inhibition, Hepatotoxicity
6. Lipinski Rule of Five compliance
7. Drug-likeness score
8. Lead-likeness assessment
9. Overall developability assessment
10. Optimization suggestions`;

    const systemPrompt = 'You are an expert in pharmacokinetics and ADMET prediction. Provide comprehensive, quantitative ADMET profiles with proper units and reference ranges.';
    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    const pool = req.app.get('db');
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, prompt, response) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'admet-prediction', prompt, aiResponse]
    );

    res.json({ result: aiResponse, model: process.env.OPENROUTER_MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Literature Analysis
router.post('/literature-analysis', authenticateToken, async (req, res) => {
  try {
    const { topic, keywords, focus } = req.body;
    const prompt = `Analyze current research landscape for:
Topic: ${topic}
Keywords: ${keywords || 'Not specified'}
Focus Area: ${focus || 'General overview'}

Provide:
1. Key findings summary (top 5 recent discoveries)
2. Major research groups and institutions
3. Current challenges and gaps
4. Emerging trends and technologies
5. Potential breakthrough areas
6. Recommended research directions
7. Key papers to review (with realistic citations)
8. Competitive landscape analysis
9. Patent landscape overview
10. Funding opportunities and trends`;

    const systemPrompt = 'You are a biomedical research analyst with expertise in drug discovery literature. Provide comprehensive research landscape analysis with actionable insights.';
    const aiResponse = await callOpenRouter(prompt, systemPrompt);

    const pool = req.app.get('db');
    await pool.query(
      'INSERT INTO ai_logs (user_id, feature, prompt, response) VALUES ($1, $2, $3, $4)',
      [req.user.id, 'literature-analysis', prompt, aiResponse]
    );

    res.json({ result: aiResponse, model: process.env.OPENROUTER_MODEL });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
