import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Layout from './components/Layout';
import CrudPage from './pages/CrudPage';
import AiFeaturePage from './pages/AiFeaturePage';
import AiHistoryPage from './pages/AiHistoryPage';

const featureConfigs = {
  proteins: {
    title: 'Protein Design',
    subtitle: 'AI-designed novel proteins for therapeutic applications',
    resource: 'proteins',
    fields: [
      { key: 'name', label: 'Protein Name', type: 'text', required: true },
      { key: 'sequence', label: 'Amino Acid Sequence', type: 'textarea' },
      { key: 'target', label: 'Target', type: 'text' },
      { key: 'properties', label: 'Properties', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', options: ['designed', 'synthesized', 'testing', 'validated'] },
    ],
    columns: ['name', 'target', 'status'],
    badgeField: 'status',
    badgeMap: { designed: 'badge-info', synthesized: 'badge-warning', testing: 'badge-primary', validated: 'badge-success' },
  },
  targets: {
    title: 'Drug Targets',
    subtitle: 'Validated therapeutic targets for drug development',
    resource: 'targets',
    fields: [
      { key: 'name', label: 'Target Name', type: 'text', required: true },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'disease_area', label: 'Disease Area', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'validation_status', label: 'Validation Status', type: 'select', options: ['pending', 'preclinical', 'clinical', 'validated'] },
    ],
    columns: ['name', 'type', 'disease_area', 'validation_status'],
    badgeField: 'validation_status',
    badgeMap: { pending: 'badge-secondary', preclinical: 'badge-warning', clinical: 'badge-info', validated: 'badge-success' },
  },
  'drug-candidates': {
    title: 'Drug Candidates',
    subtitle: 'Active drug candidates in the development pipeline',
    resource: 'drug-candidates',
    fields: [
      { key: 'name', label: 'Candidate Name', type: 'text', required: true },
      { key: 'molecule_type', label: 'Molecule Type', type: 'text' },
      { key: 'target_name', label: 'Target', type: 'text' },
      { key: 'phase', label: 'Phase', type: 'select', options: ['Discovery', 'Preclinical', 'Phase I', 'Phase I/II', 'Phase II', 'Phase III'] },
      { key: 'efficacy_score', label: 'Efficacy Score', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: ['active', 'on_hold', 'terminated', 'approved'] },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'molecule_type', 'target_name', 'phase', 'efficacy_score', 'status'],
    badgeField: 'phase',
    badgeMap: { 'Discovery': 'badge-secondary', 'Preclinical': 'badge-info', 'Phase I': 'badge-warning', 'Phase I/II': 'badge-warning', 'Phase II': 'badge-primary', 'Phase III': 'badge-success' },
  },
  screenings: {
    title: 'Molecular Screening',
    subtitle: 'High-throughput and virtual screening campaigns',
    resource: 'screenings',
    fields: [
      { key: 'name', label: 'Campaign Name', type: 'text', required: true },
      { key: 'target_name', label: 'Target', type: 'text' },
      { key: 'method', label: 'Method', type: 'text' },
      { key: 'hits_count', label: 'Hits Count', type: 'number' },
      { key: 'status', label: 'Status', type: 'select', options: ['pending', 'in_progress', 'completed'] },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'target_name', 'method', 'hits_count', 'status'],
    badgeField: 'status',
    badgeMap: { pending: 'badge-secondary', in_progress: 'badge-warning', completed: 'badge-success' },
  },
  'binding-affinities': {
    title: 'Binding Affinities',
    subtitle: 'Protein-target binding affinity measurements and predictions',
    resource: 'binding-affinities',
    fields: [
      { key: 'protein_name', label: 'Protein', type: 'text', required: true },
      { key: 'target_name', label: 'Target', type: 'text', required: true },
      { key: 'affinity_score', label: 'Affinity Score', type: 'text' },
      { key: 'method', label: 'Method', type: 'text' },
      { key: 'conditions', label: 'Conditions', type: 'textarea' },
    ],
    columns: ['protein_name', 'target_name', 'affinity_score', 'method'],
  },
  toxicity: {
    title: 'Toxicity Predictions',
    subtitle: 'AI-powered compound toxicity assessments',
    resource: 'toxicity',
    fields: [
      { key: 'compound_name', label: 'Compound', type: 'text', required: true },
      { key: 'smiles', label: 'SMILES', type: 'text' },
      { key: 'risk_level', label: 'Risk Level', type: 'select', options: ['pending', 'Low', 'Medium', 'High', 'Critical'] },
      { key: 'prediction_result', label: 'Prediction Result', type: 'textarea' },
    ],
    columns: ['compound_name', 'risk_level', 'prediction_result'],
    badgeField: 'risk_level',
    badgeMap: { pending: 'badge-secondary', Low: 'badge-success', Medium: 'badge-warning', High: 'badge-danger', Critical: 'badge-danger' },
  },
  structures: {
    title: 'Protein Structures',
    subtitle: 'Predicted and experimentally determined protein structures',
    resource: 'structures',
    fields: [
      { key: 'protein_name', label: 'Protein Name', type: 'text', required: true },
      { key: 'sequence', label: 'Sequence', type: 'textarea' },
      { key: 'fold_family', label: 'Fold Family', type: 'text' },
      { key: 'confidence_score', label: 'Confidence Score', type: 'number' },
      { key: 'domains', label: 'Domains', type: 'textarea' },
    ],
    columns: ['protein_name', 'fold_family', 'confidence_score'],
  },
  'clinical-trials': {
    title: 'Clinical Trials',
    subtitle: 'Active and planned clinical trial programs',
    resource: 'clinical-trials',
    fields: [
      { key: 'name', label: 'Trial Name', type: 'text', required: true },
      { key: 'drug_candidate_name', label: 'Drug Candidate', type: 'text' },
      { key: 'phase', label: 'Phase', type: 'select', options: ['Preclinical', 'Phase I', 'Phase I/II', 'Phase II', 'Phase III', 'Phase IV'] },
      { key: 'status', label: 'Status', type: 'select', options: ['planned', 'recruiting', 'active', 'completed', 'terminated'] },
      { key: 'start_date', label: 'Start Date', type: 'date' },
      { key: 'end_date', label: 'End Date', type: 'date' },
      { key: 'participants', label: 'Participants', type: 'number' },
      { key: 'site', label: 'Site', type: 'text' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'drug_candidate_name', 'phase', 'status', 'participants', 'site'],
    badgeField: 'status',
    badgeMap: { planned: 'badge-secondary', recruiting: 'badge-info', active: 'badge-success', completed: 'badge-primary', terminated: 'badge-danger' },
  },
  compounds: {
    title: 'Compound Library',
    subtitle: 'Chemical compound collection and library management',
    resource: 'compounds',
    fields: [
      { key: 'name', label: 'Compound Name', type: 'text', required: true },
      { key: 'formula', label: 'Molecular Formula', type: 'text' },
      { key: 'molecular_weight', label: 'Molecular Weight (Da)', type: 'number' },
      { key: 'smiles', label: 'SMILES', type: 'text' },
      { key: 'source', label: 'Source', type: 'text' },
      { key: 'status', label: 'Status', type: 'select', options: ['available', 'hit', 'lead', 'reference', 'screening', 'development'] },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'formula', 'molecular_weight', 'source', 'status'],
    badgeField: 'status',
    badgeMap: { available: 'badge-secondary', hit: 'badge-info', lead: 'badge-warning', reference: 'badge-primary', screening: 'badge-info', development: 'badge-success' },
  },
  projects: {
    title: 'Research Projects',
    subtitle: 'Active drug discovery research programs',
    resource: 'projects',
    fields: [
      { key: 'name', label: 'Project Name', type: 'text', required: true },
      { key: 'lead_scientist', label: 'Lead Scientist', type: 'text' },
      { key: 'objective', label: 'Objective', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', options: ['planning', 'active', 'on_hold', 'completed'] },
      { key: 'budget', label: 'Budget ($)', type: 'number' },
      { key: 'start_date', label: 'Start Date', type: 'date' },
      { key: 'end_date', label: 'End Date', type: 'date' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'lead_scientist', 'status', 'budget'],
    badgeField: 'status',
    badgeMap: { planning: 'badge-secondary', active: 'badge-success', on_hold: 'badge-warning', completed: 'badge-primary' },
  },
  experiments: {
    title: 'Lab Experiments',
    subtitle: 'Experimental protocols and results tracking',
    resource: 'experiments',
    fields: [
      { key: 'name', label: 'Experiment Name', type: 'text', required: true },
      { key: 'project_name', label: 'Project', type: 'text' },
      { key: 'type', label: 'Type', type: 'text' },
      { key: 'hypothesis', label: 'Hypothesis', type: 'textarea' },
      { key: 'result', label: 'Result', type: 'textarea' },
      { key: 'status', label: 'Status', type: 'select', options: ['planned', 'in_progress', 'completed', 'failed'] },
      { key: 'protocol', label: 'Protocol', type: 'textarea' },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'project_name', 'type', 'status'],
    badgeField: 'status',
    badgeMap: { planned: 'badge-secondary', in_progress: 'badge-warning', completed: 'badge-success', failed: 'badge-danger' },
  },
  'drug-interactions': {
    title: 'Drug Interactions',
    subtitle: 'Drug-drug interaction analysis and predictions',
    resource: 'drug-interactions',
    fields: [
      { key: 'drug_a', label: 'Drug A', type: 'text', required: true },
      { key: 'drug_b', label: 'Drug B', type: 'text', required: true },
      { key: 'interaction_type', label: 'Interaction Type', type: 'text' },
      { key: 'severity', label: 'Severity', type: 'select', options: ['unknown', 'Mild', 'Moderate', 'Severe', 'Contraindicated'] },
      { key: 'mechanism', label: 'Mechanism', type: 'textarea' },
    ],
    columns: ['drug_a', 'drug_b', 'interaction_type', 'severity'],
    badgeField: 'severity',
    badgeMap: { unknown: 'badge-secondary', Mild: 'badge-info', Moderate: 'badge-warning', Severe: 'badge-danger', Contraindicated: 'badge-danger' },
  },
  admet: {
    title: 'ADMET Properties',
    subtitle: 'Absorption, Distribution, Metabolism, Excretion, Toxicity profiles',
    resource: 'admet',
    fields: [
      { key: 'compound_name', label: 'Compound', type: 'text', required: true },
      { key: 'absorption', label: 'Absorption', type: 'text' },
      { key: 'distribution', label: 'Distribution', type: 'text' },
      { key: 'metabolism', label: 'Metabolism', type: 'text' },
      { key: 'excretion', label: 'Excretion', type: 'text' },
      { key: 'toxicity_score', label: 'Toxicity Score', type: 'number' },
      { key: 'overall_score', label: 'Overall Score', type: 'number' },
    ],
    columns: ['compound_name', 'absorption', 'toxicity_score', 'overall_score'],
  },
  literature: {
    title: 'Literature & Research',
    subtitle: 'Scientific publications and AI-powered literature analysis',
    resource: 'literature',
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'authors', label: 'Authors', type: 'text' },
      { key: 'journal', label: 'Journal', type: 'text' },
      { key: 'year', label: 'Year', type: 'number' },
      { key: 'relevance_score', label: 'Relevance Score', type: 'number' },
      { key: 'doi', label: 'DOI', type: 'text' },
      { key: 'abstract', label: 'Abstract', type: 'textarea' },
      { key: 'ai_summary', label: 'AI Summary', type: 'textarea' },
    ],
    columns: ['title', 'journal', 'year', 'relevance_score'],
  },
};

const aiFeatureConfigs = {
  'ai-protein-design': {
    title: 'AI Protein Design',
    subtitle: 'Generate novel protein sequences using AI',
    icon: '🧬',
    apiCall: 'aiProteinDesign',
    fields: [
      { key: 'target', label: 'Target Protein/Receptor', placeholder: 'e.g., EGFR, PD-L1, TNF-alpha' },
      { key: 'properties', label: 'Desired Properties', placeholder: 'e.g., High binding affinity, good stability, low immunogenicity', type: 'textarea' },
      { key: 'constraints', label: 'Constraints (optional)', placeholder: 'e.g., Sequence length < 200, avoid glycosylation sites', type: 'textarea' },
    ],
  },
  'ai-binding-affinity': {
    title: 'AI Binding Affinity Prediction',
    subtitle: 'Predict protein-target binding strength',
    icon: '🔗',
    apiCall: 'aiBindingAffinity',
    fields: [
      { key: 'protein', label: 'Protein/Ligand', placeholder: 'e.g., NEO-P1 Anti-EGFR antibody' },
      { key: 'target', label: 'Target', placeholder: 'e.g., EGFR kinase domain' },
      { key: 'conditions', label: 'Conditions (optional)', placeholder: 'e.g., pH 7.4, 37°C, 150mM NaCl', type: 'textarea' },
    ],
  },
  'ai-toxicity': {
    title: 'AI Toxicity Prediction',
    subtitle: 'Predict compound toxicity profiles',
    icon: '☠️',
    apiCall: 'aiToxicityPrediction',
    fields: [
      { key: 'compound', label: 'Compound Name', placeholder: 'e.g., DRC-001 Nexatinib' },
      { key: 'smiles', label: 'SMILES (optional)', placeholder: 'e.g., CC1=CC(=CC=C1NC(=O)...', type: 'textarea' },
      { key: 'dose', label: 'Dose Range (optional)', placeholder: 'e.g., 10-100 mg/day oral' },
    ],
  },
  'ai-structure': {
    title: 'AI Structure Prediction',
    subtitle: 'Predict 3D protein structure from sequence',
    icon: '🏗️',
    apiCall: 'aiStructurePrediction',
    fields: [
      { key: 'name', label: 'Protein Name', placeholder: 'e.g., Novel Anti-EGFR Nanobody' },
      { key: 'sequence', label: 'Amino Acid Sequence', placeholder: 'e.g., MKVLWAALLVTFLAGCQA...', type: 'textarea' },
    ],
  },
  'ai-drug-interaction': {
    title: 'AI Drug Interaction Check',
    subtitle: 'Analyze potential drug-drug interactions',
    icon: '⚠️',
    apiCall: 'aiDrugInteraction',
    fields: [
      { key: 'drugA', label: 'Drug A', placeholder: 'e.g., DRC-001 Nexatinib' },
      { key: 'drugB', label: 'Drug B', placeholder: 'e.g., Ketoconazole' },
      { key: 'patientProfile', label: 'Patient Profile (optional)', placeholder: 'e.g., 65yo male, renal impairment', type: 'textarea' },
    ],
  },
  'ai-admet': {
    title: 'AI ADMET Prediction',
    subtitle: 'Predict pharmacokinetic and safety properties',
    icon: '💊',
    apiCall: 'aiAdmetPrediction',
    fields: [
      { key: 'compound', label: 'Compound Name', placeholder: 'e.g., Compound NX-7821' },
      { key: 'smiles', label: 'SMILES (optional)', placeholder: 'Molecular structure in SMILES format', type: 'textarea' },
      { key: 'route', label: 'Route of Administration', placeholder: 'e.g., Oral, IV, SC' },
    ],
  },
  'ai-literature': {
    title: 'AI Literature Analysis',
    subtitle: 'AI-powered research landscape analysis',
    icon: '📚',
    apiCall: 'aiLiteratureAnalysis',
    fields: [
      { key: 'topic', label: 'Research Topic', placeholder: 'e.g., KRAS G12C inhibitors in NSCLC' },
      { key: 'keywords', label: 'Keywords (optional)', placeholder: 'e.g., covalent inhibitor, resistance, combination therapy' },
      { key: 'focus', label: 'Focus Area (optional)', placeholder: 'e.g., Clinical outcomes, Resistance mechanisms' },
    ],
  },
  // ============= NEW Custom Non-CRUD Features =============
  'ai-validate-sequence': {
    title: 'Sequence Validator',
    subtitle: 'Validate protein/DNA/RNA sequences for chemistry rules',
    icon: '✅',
    apiCall: 'aiValidateSequence',
    fields: [
      { key: 'type', label: 'Sequence Type', type: 'select', options: ['protein', 'DNA', 'RNA'] },
      { key: 'sequence', label: 'Sequence', type: 'textarea', placeholder: 'e.g., MKVLWAALLVTFLAGCQA...', rows: 6 },
    ],
  },
  'ai-rank-candidates': {
    title: 'Candidate Ranker',
    subtitle: 'Multi-objective ranking of drug candidates (potency + safety + cost)',
    icon: '🏆',
    apiCall: 'aiRankCandidates',
    fields: [
      { key: 'candidate_ids', label: 'Candidate IDs (comma-separated)', type: 'csv-array', placeholder: 'e.g., 1,2,3' },
    ],
  },
  'ai-predict-solubility': {
    title: 'Solubility Predictor',
    subtitle: 'Predict aqueous solubility from SMILES; identify precipitation risks',
    icon: '💧',
    apiCall: 'aiPredictSolubility',
    fields: [
      { key: 'compound_name', label: 'Compound Name', placeholder: 'e.g., Compound NX-7821' },
      { key: 'smiles', label: 'SMILES', type: 'textarea', placeholder: 'e.g., CC(=O)Nc1ccc(O)cc1' },
    ],
  },
  'ai-dock-protein': {
    title: 'Docking Integrator',
    subtitle: 'In-silico docking simulation with quantitative binding scores',
    icon: '🧲',
    apiCall: 'aiDockProtein',
    fields: [
      { key: 'protein_name', label: 'Protein Name', placeholder: 'e.g., EGFR kinase' },
      { key: 'pdb_id', label: 'PDB ID (optional)', placeholder: 'e.g., 1M17' },
      { key: 'ligand_smiles', label: 'Ligand SMILES', type: 'textarea', placeholder: 'e.g., COc1cc2ncnc(Nc3ccc(F)c(Cl)c3)c2cc1OC' },
    ],
  },
  'ai-predict-off-targets': {
    title: 'Off-Target Predictor',
    subtitle: 'Screen candidates for unintended protein interactions (ChEMBL-style)',
    icon: '🎯',
    apiCall: 'aiPredictOffTargets',
    fields: [
      { key: 'compound_name', label: 'Compound Name', placeholder: 'e.g., Compound NX-7821' },
      { key: 'smiles', label: 'SMILES (optional)', type: 'textarea' },
      { key: 'intended_target', label: 'Intended Target', placeholder: 'e.g., EGFR' },
    ],
  },
  'ai-recommend-formulation': {
    title: 'Formulation Recommender',
    subtitle: 'Suggest excipients, pH, buffer based on chemical stability',
    icon: '🧴',
    apiCall: 'aiRecommendFormulation',
    fields: [
      { key: 'compound_name', label: 'Compound Name', placeholder: 'e.g., Compound NX-7821' },
      { key: 'smiles', label: 'SMILES (optional)', type: 'textarea' },
      { key: 'route', label: 'Route', placeholder: 'e.g., Oral, IV, SC' },
      { key: 'target_dose', label: 'Target Dose', placeholder: 'e.g., 50 mg/day' },
      { key: 'stability_concerns', label: 'Stability Concerns (optional)', type: 'textarea' },
    ],
  },
  'ai-patent-landscape': {
    title: 'Patent Landscape',
    subtitle: 'Auto-query patent IP landscape and freedom-to-operate analysis',
    icon: '📜',
    apiCall: 'aiPatentLandscape',
    fields: [
      { key: 'topic', label: 'Topic', placeholder: 'e.g., KRAS G12C covalent inhibitors' },
      { key: 'target', label: 'Target (optional)', placeholder: 'e.g., KRAS G12C' },
      { key: 'jurisdiction', label: 'Jurisdiction', placeholder: 'e.g., US, EU, JP, CN' },
    ],
  },
  'ai-virtual-hts': {
    title: 'Virtual HTS Simulator',
    subtitle: 'In-silico high-throughput screening across compound libraries',
    icon: '🧪',
    apiCall: 'aiVirtualHts',
    fields: [
      { key: 'target', label: 'Target', placeholder: 'e.g., KRAS G12C' },
      { key: 'library_size', label: 'Library Size', type: 'number', placeholder: 'e.g., 100000' },
      { key: 'criteria', label: 'Selection Criteria', type: 'textarea', placeholder: 'e.g., Drug-like, novel, predicted IC50 < 1µM' },
    ],
  },
  'ai-sar-analysis': {
    title: 'SAR Analyzer',
    subtitle: 'Structure-Activity Relationship analysis — identify pharmacophore and optimization vectors',
    icon: '🔬',
    apiCall: 'aiSarAnalysis',
    fields: [
      { key: 'target', label: 'Target', placeholder: 'e.g., EGFR kinase' },
      { key: 'property', label: 'Property to Optimize', placeholder: 'e.g., potency (IC50), selectivity, solubility' },
      { key: 'compound_series', label: 'Compound Series (JSON array)', type: 'json-array', placeholder: '[{"name": "Cpd-1", "smiles": "...", "ic50_nM": 50}, ...]', rows: 6 },
    ],
  },
  'ai-clinical-trial-design': {
    title: 'Clinical Trial Designer',
    subtitle: 'AI-generated clinical trial protocols with endpoints, sample size, and statistical plan',
    icon: '🏥',
    apiCall: 'aiClinicalTrialDesign',
    fields: [
      { key: 'drug_candidate', label: 'Drug Candidate', placeholder: 'e.g., DRC-001 Nexatinib' },
      { key: 'indication', label: 'Indication', placeholder: 'e.g., EGFR-mutant NSCLC' },
      { key: 'phase', label: 'Phase', type: 'select', options: ['Phase I', 'Phase I/II', 'Phase II', 'Phase III'] },
      { key: 'safety_data', label: 'Existing Safety Data (optional)', type: 'textarea', placeholder: 'e.g., No DLTs at 100mg, mild nausea noted' },
    ],
  },
  'ai-competitive-intelligence': {
    title: 'Competitive Intelligence',
    subtitle: 'AI-generated competitive landscape: approved drugs, clinical competitors, market analysis',
    icon: '🕵️',
    apiCall: 'aiCompetitiveIntelligence',
    fields: [
      { key: 'target_or_disease', label: 'Target or Disease Area', placeholder: 'e.g., KRAS G12C NSCLC, GLP-1R obesity' },
      { key: 'focus', label: 'Focus Area (optional)', placeholder: 'e.g., Clinical competitors, Patent landscape, Market sizing' },
    ],
  },
  'ai-regulatory-pathway': {
    title: 'Regulatory Pathway Advisor',
    subtitle: 'FDA/EMA regulatory roadmap with timelines, costs, and designation opportunities',
    icon: '📋',
    apiCall: 'aiRegulatoryPathway',
    fields: [
      { key: 'drug_type', label: 'Drug Type', type: 'select', options: ['Small Molecule', 'Monoclonal Antibody', 'Bispecific Antibody', 'ADC', 'Cell Therapy', 'Gene Therapy', 'Peptide', 'Oligonucleotide', 'mRNA'] },
      { key: 'indication', label: 'Indication', placeholder: 'e.g., Relapsed/Refractory AML' },
      { key: 'phase', label: 'Current Phase', type: 'select', options: ['Discovery', 'Preclinical', 'Phase I', 'Phase II', 'Phase III'] },
      { key: 'jurisdiction', label: 'Regulatory Jurisdiction', type: 'select', options: ['FDA (US)', 'EMA (EU)', 'PMDA (Japan)', 'NMPA (China)', 'Global'] },
    ],
  },
  // Apply pass 5 — backlog
  'ai-virtual-screening': {
    title: 'Virtual Screening Pipeline',
    subtitle: 'Rank a SMILES library against a target and return top hits',
    icon: '🧬',
    apiCall: 'aiVirtualScreening',
    fields: [
      { key: 'target', label: 'Target', placeholder: 'e.g., EGFR kinase' },
      { key: 'max_hits', label: 'Max Hits', type: 'number', placeholder: '50' },
      { key: 'compounds', label: 'Compounds (JSON array)', type: 'json-array', placeholder: '[{"name": "Cpd-1", "smiles": "..."}, ...]', rows: 6 },
    ],
  },
  'ai-pubchem-lookup': {
    title: 'PubChem Lookup',
    subtitle: 'Look up compound properties from PubChem (requires PUBCHEM_ENABLED env var)',
    icon: '🔍',
    apiCall: 'aiPubchemLookup',
    fields: [
      { key: 'query', label: 'Query', placeholder: 'aspirin or CC(=O)Oc1ccccc1C(=O)O' },
      { key: 'search_type', label: 'Search Type', type: 'select', options: ['name', 'smiles'] },
    ],
  },
  'ai-predictive-trial-success': {
    title: 'Predictive Trial Success',
    subtitle: 'Estimate clinical trial success probability (heuristic LLM scoring)',
    icon: '📊',
    apiCall: 'aiPredictiveTrialSuccess',
    fields: [
      { key: 'drug_candidate', label: 'Drug Candidate', placeholder: 'e.g., DRC-001' },
      { key: 'indication', label: 'Indication', placeholder: 'e.g., NSCLC' },
      { key: 'phase', label: 'Phase', type: 'select', options: ['Phase 1', 'Phase 2', 'Phase 3'] },
      { key: 'biomarkers', label: 'Biomarkers (JSON array)', type: 'json-array', placeholder: '["EGFR", "PD-L1"]' },
    ],
  },
  'ai-lab-automation-plan': {
    title: 'Lab Automation Planner',
    subtitle: 'Plan a lab automation protocol (requires LAB_AUTOMATION_URL env var)',
    icon: '🤖',
    apiCall: 'aiLabAutomationPlan',
    fields: [
      { key: 'experiment', label: 'Experiment', placeholder: 'e.g., dose-response IC50 assay' },
      { key: 'plate_format', label: 'Plate Format', type: 'select', options: ['96-well', '384-well', '1536-well'] },
      { key: 'replicates', label: 'Replicates', type: 'number', placeholder: '3' },
      { key: 'target', label: 'Target (optional)', placeholder: 'e.g., EGFR' },
    ],
  },
  'ai-multi-objective-optimize': {
    title: 'Multi-Objective Optimizer',
    subtitle: 'AI-driven Pareto-front selection over multiple objectives',
    icon: '🎯',
    apiCall: 'aiMultiObjectiveOptimize',
    fields: [
      { key: 'candidates', label: 'Candidates (JSON array)', type: 'json-array', placeholder: '[{"name":"Cpd-1","ic50_nM":10,"logP":3.2}, ...]', rows: 6 },
      { key: 'objectives', label: 'Objectives (JSON array)', type: 'json-array', placeholder: '["potency","solubility","selectivity"]' },
      { key: 'weights', label: 'Weights (JSON object, optional)', type: 'json-array', placeholder: '{"potency":0.5,"solubility":0.3,"selectivity":0.2}' },
    ],
  },
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(!!localStorage.getItem('token'));

  const handleLogin = (token, user) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(user));
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Layout onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {Object.entries(featureConfigs).map(([key, config]) => (
            <Route key={key} path={`/${key}`} element={<CrudPage config={config} />} />
          ))}
          {Object.entries(aiFeatureConfigs).map(([key, config]) => (
            <Route key={key} path={`/${key}`} element={<AiFeaturePage config={config} />} />
          ))}
          <Route path="/ai-history" element={<AiHistoryPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}

export default App;
